import { Client, GuildMember, TextChannel } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { getWeekStart, weekKeyFor, strikeScope, isJagcEnabled, isUnderQuota } from '../handlers/quota';
import { getNotificationEmbed } from '../handlers/locale';
import { appealButtonRow, fireOfficerById, openCase } from '../handlers/quotaJagc';

/**
 * Weekly quota enforcement. Once per quota week, for the week that just ended:
 *   - officers who met quota, or were on LOA, reset to 0 strikes
 *   - officers who missed get +1 strike (DM includes an "Appeal to JAGC" button)
 *   - at strikeLimit strikes: a JAGC trial is opened (quota.jagc.trialAtLimit),
 *     otherwise they are fired (or only flagged, with requireConfirmation)
 *
 * Never struck:
 *   - for any week before the bot started tracking (fresh DB / new deploy)
 *   - for their first week on the roster: an officer seen for the first time
 *     (or returning after being off the roster) gets a baseline, and is only
 *     judged from their first FULL week onward
 *   - while a JAGC trial is pending, or after being fired
 *
 * quota.global = true pools events across every server and evaluates each
 * officer once (strikes keyed 'global' + main group). Otherwise each server is
 * evaluated separately against its own group.
 */

const CHECK_INTERVAL = 60 * 60 * 1000; // hourly; lastCheckedAt makes it idempotent
const WEEK = 7 * 24 * 60 * 60 * 1000;
const META_KEY = 'trackingStartWeek';

type Scope = {
    label: string;
    key: string;                       // QuotaStrike.guildId ('global' in global mode)
    groupId: string;
    officers: Map<string, GuildMember>;
    countHosted: (discordId: string, from: Date, to: Date) => Promise<number>;
    onLeave: Set<string>;
    logChannel: TextChannel | null;
};

const getLogChannel = (client: Client, guildId?: string): TextChannel | null => {
    if(!config.logChannels?.actions) return null;
    const cached = client.channels.cache.get(config.logChannels.actions) as TextChannel;
    if(cached) return cached;
    const guild = guildId ? client.guilds.cache.get(guildId) : null;
    return (guild?.channels.cache.get(config.logChannels.actions) as TextChannel) || null;
}

const isOfficer = (m: GuildMember) => !m.user.bot && isUnderQuota([ ... m.roles.cache.keys() ]);

const evaluate = async (scope: Scope, trackingStart: string) => {
    const q = config.quota;
    const limit = q.strikeLimit ?? 3;
    const dmsOn = q.sendDMs !== false;
    const jagcOn = isJagcEnabled();
    const trialAtLimit = jagcOn && q.jagc?.trialAtLimit !== false;

    const thisWeekStart = getWeekStart();
    const lastWeekStart = new Date(thisWeekStart.getTime() - WEEK);
    const weekKey = weekKeyFor(lastWeekStart);                         // week being judged
    const weekBeforeKey = weekKeyFor(new Date(lastWeekStart.getTime() - WEEK));
    const currentWeekKey = weekKeyFor(thisWeekStart);

    const fired: string[] = [];
    const trials: string[] = [];
    const struck: { id: string; strikes: number }[] = [];
    const newcomers: string[] = [];

    for(const officer of scope.officers.values()) {
        try {
            const record = await provider.getQuotaStrike(scope.key, scope.groupId, officer.id);

            // Already judged this week (makes restarts and hourly runs safe).
            if(record?.lastCheckedAt === weekKey) continue;
            // Fired, or waiting on JAGC: not judged until that's resolved.
            if(record?.fired || record?.pendingTrial) continue;

            // Week predates tracking (fresh DB / new deploy): baseline, no strike.
            if(weekKey < trackingStart) {
                await provider.setQuotaStrikes(scope.key, scope.groupId, officer.id, record?.strikes || 0, weekKey, false,
                    record?.firstSeenWeek ? {} : { firstSeenWeek: currentWeekKey });
                continue;
            }

            // First time on the roster, or back after missing at least one weekly
            // check (left the role, was off the server): start fresh. Their first
            // judged week is the first FULL week after this one.
            const isNew = !record || !record.lastCheckedAt || record.lastCheckedAt < weekBeforeKey;
            if(isNew) {
                await provider.setQuotaStrikes(scope.key, scope.groupId, officer.id, 0, weekKey, false, { firstSeenWeek: currentWeekKey });
                newcomers.push(officer.id);
                continue;
            }
            // Still inside their first (partial) week.
            if(record.firstSeenWeek && weekKey <= record.firstSeenWeek) {
                await provider.setQuotaStrikes(scope.key, scope.groupId, officer.id, record.strikes || 0, weekKey);
                continue;
            }

            const hosted = await scope.countHosted(officer.id, lastWeekStart, thisWeekStart);
            if(hosted >= q.perWeek || scope.onLeave.has(officer.id)) {
                await provider.setQuotaStrikes(scope.key, scope.groupId, officer.id, 0, weekKey);
                continue;
            }

            const newStrikes = (record.strikes || 0) + 1;
            const atLimit = newStrikes >= limit;
            const notify = dmsOn && !(q.notifyExemptRoleIds || []).some((r) => officer.roles.cache.has(r));

            if(atLimit && trialAtLimit) {
                // Stamp first so a failure below can never double-process this week.
                await provider.setQuotaStrikes(scope.key, scope.groupId, officer.id, newStrikes, weekKey, false, { pendingTrial: true });
                const opened = await openCase({
                    kind: 'TRIAL',
                    discordId: officer.id,
                    scopeKey: scope.key,
                    groupId: scope.groupId,
                    weekKey,
                    strikes: newStrikes,
                    hosted,
                    reason: `Reached ${newStrikes}/${limit} strikes. Hosted ${hosted}/${q.perWeek} in the week of ${weekKey}.`,
                });
                if(!opened) {
                    // JAGC unreachable: leave the strike, drop the trial flag so
                    // the officer isn't frozen; JAGC can be reached by appeal.
                    await provider.setQuotaStrikes(scope.key, scope.groupId, officer.id, newStrikes, weekKey);
                    struck.push({ id: officer.id, strikes: newStrikes });
                    if(notify) await dmOfficer(officer, newStrikes, limit, q.perWeek, 'strike', weekKey, scope.key);
                    continue;
                }
                if(notify) await dmOfficer(officer, newStrikes, limit, q.perWeek, 'trial', weekKey, scope.key, opened.number);
                trials.push(`<@${officer.id}> (${opened.number})`);
                continue;
            }

            const willFire = atLimit && !q.requireConfirmation;
            await provider.setQuotaStrikes(scope.key, scope.groupId, officer.id, newStrikes, weekKey, willFire);

            if(willFire) {
                const prev = await fireOfficerById(officer.id, Number(scope.groupId), officer.guild.id).catch((err) => {
                    console.error(`[quotaStrikes] fire ${officer.id}:`, err);
                    return null as string | null;
                });
                if(prev) await (provider as any).db.quotaStrike.updateMany({
                    where: { guildId: scope.key, groupId: scope.groupId, discordId: officer.id },
                    data: { firedFromRoleId: prev },
                });
                if(notify) await dmOfficer(officer, newStrikes, limit, q.perWeek, 'fired', weekKey, scope.key);
                fired.push(`<@${officer.id}>`);
            } else {
                if(notify) await dmOfficer(officer, newStrikes, limit, q.perWeek, 'strike', weekKey, scope.key);
                struck.push({ id: officer.id, strikes: newStrikes });
            }
        } catch (err) {
            console.error(`[quotaStrikes] ${scope.label}/${officer.id}:`, err);
        }
    }

    if(scope.logChannel && (fired.length || struck.length || trials.length || newcomers.length)) {
        const lines: string[] = [ `**Weekly quota check${scope.key === 'global' ? ' (global)' : ''}** - week of ${weekKey}` ];
        for(const s of struck) lines.push(`<@${s.id}> - strike ${s.strikes}/${limit}${s.strikes >= limit ? ' (eligible for removal)' : ''}`);
        if(trials.length) lines.push(`\nSent to JAGC for trial: ${trials.join(', ')}`);
        if(fired.length) lines.push(`\nFired for reaching the strike limit: ${fired.join(', ')}`);
        if(newcomers.length) lines.push(`\nNew to the roster (first week not judged): ${newcomers.length}`);
        let content = lines.join('\n');
        if(content.length > 1900) content = content.slice(0, 1900) + '\n...';
        scope.logChannel.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
    }
}

/** DMs an officer about a strike, trial, or firing. Best-effort. */
const dmOfficer = async (officer: GuildMember, strikes: number, limit: number, perWeek: number, kind: 'strike' | 'trial' | 'fired', weekKey: string, scopeKey: string, caseNumber?: string) => {
    try {
        const canAppeal = isJagcEnabled() && kind !== 'trial';
        const appealLine = canAppeal ? `\n\nIf you believe this strike is wrong, press **Appeal to JAGC** below (or use /quotaappeal) within ${config.quota.jagc?.appealDays ?? 7} days.` : '';
        let body: string;
        let heading: string;
        if(kind === 'trial') {
            heading = 'Quota Trial';
            body = `You did not meet your weekly hosting quota and have reached **${strikes}/${limit}** strikes.\n\nInstead of being removed automatically, your case has been sent to JAGC for trial (**${caseNumber}**). You will be messaged with their ruling.`;
        } else if(kind === 'fired') {
            heading = 'Removed for Quota';
            body = `You missed your weekly hosting quota and have reached **${strikes}/${limit}** strikes, so you have been removed from your position.${appealLine || '\n\nIf you believe this is a mistake, contact command.'}`;
        } else {
            heading = 'Quota Strike';
            body = `You did not meet your weekly hosting quota. This is strike **${strikes}/${limit}**.\n\n${strikes >= limit ? 'You are now eligible for removal.' : `Host at least ${perWeek} event next week to avoid another strike. Meeting quota resets your strikes.`}${appealLine}`;
        }
        await officer.send({
            embeds: [ getNotificationEmbed(body, heading) ],
            components: canAppeal ? [ appealButtonRow(weekKey, scopeKey) ] : [],
        });
    } catch (err) {
        // DMs closed - the log channel still records it, and /quotaappeal still works.
    }
}

const getTrackingStart = async (): Promise<string> => {
    let trackingStart = await provider.getMeta(META_KEY);
    if(!trackingStart) {
        // First run ever (or after a wipe): the week in progress is the baseline,
        // so the week that just ended is never judged retroactively.
        trackingStart = weekKeyFor(getWeekStart());
        await provider.setMeta(META_KEY, trackingStart);
    }
    return trackingStart;
}

/** One pass for everyone: events pooled across servers, one strike row per officer. */
const runGlobal = async (client: Client, trackingStart: string) => {
    const officers = new Map<string, GuildMember>();
    for(const guild of client.guilds.cache.values()) {
        for(const m of guild.members.cache.values()) {
            if(isOfficer(m) && !officers.has(m.id)) officers.set(m.id, m);
        }
    }

    const thisWeekStart = getWeekStart();
    const lastWeekStart = new Date(thisWeekStart.getTime() - WEEK);
    const loas = await provider.findLoasOverlappingGlobal(lastWeekStart, thisWeekStart);
    const scope = strikeScope('global');
    const mainGuildId = Object.keys(config.guildGroups || {})[0];

    await evaluate({
        label: 'global',
        key: scope.key,
        groupId: scope.groupId,
        officers,
        countHosted: (id, from, to) => provider.countEventsByHostGlobal(id, from, to),
        onLeave: new Set(loas.map((l: any) => l.discordId)),
        logChannel: getLogChannel(client, mainGuildId),
    }, trackingStart);
}

const runForGuild = async (client: Client, guildId: string, trackingStart: string) => {
    const guild = client.guilds.cache.get(guildId);
    if(!guild) return;

    const officers = new Map<string, GuildMember>();
    for(const m of guild.members.cache.values()) if(isOfficer(m)) officers.set(m.id, m);

    const thisWeekStart = getWeekStart();
    const lastWeekStart = new Date(thisWeekStart.getTime() - WEEK);
    const loas = await provider.findLoasOverlapping(guildId, lastWeekStart, thisWeekStart);
    const scope = strikeScope(guildId);

    await evaluate({
        label: guildId,
        key: scope.key,
        groupId: scope.groupId,
        officers,
        countHosted: (id, from, to) => provider.countEventsByHost(guildId, id, from, to),
        onLeave: new Set(loas.map((l: any) => l.discordId)),
        logChannel: getLogChannel(client, guildId),
    }, trackingStart);
}

const registerQuotaStrikes = (client: Client) => {
    if(!config.quota?.enabled || !config.quota?.strikeLimit) return;

    const loop = async () => {
        try {
            const q = config.quota;
            if(q?.enabled && (q.roleIds || []).length > 0) {
                // Can't tell who missed quota if the database is down: skip, don't strike.
                if(!(await provider.healthCheck())) {
                    console.warn('[quotaStrikes] data layer unhealthy - skipping this run to avoid false strikes.');
                } else {
                    const trackingStart = await getTrackingStart();
                    if(q.global) {
                        await runGlobal(client, trackingStart);
                    } else {
                        const guildIds = Object.keys(config.guildGroups || {}).length > 0
                            ? Object.keys(config.guildGroups)
                            : [ ... client.guilds.cache.keys() ];
                        for(const guildId of guildIds) await runForGuild(client, guildId, trackingStart);
                    }
                }
            }
        } catch (err) {
            console.error('[quotaStrikes]', err);
        }
        setTimeout(loop, CHECK_INTERVAL);
    }
    // First run a minute and a half after startup, once members are cached.
    setTimeout(loop, 90 * 1000);
}


export default registerQuotaStrikes;
