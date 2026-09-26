import { Client, GuildMember, TextChannel } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { robloxClient } from '../main';
import { getWeekStart } from '../handlers/quota';
import { getLinkedRobloxUser } from '../handlers/accountLinks';
import { logAction } from '../handlers/handleLogging';
import { getNotificationEmbed } from '../handlers/locale';

/**
 * Weekly quota enforcement. Once per quota week, for the week that just ended:
 *   - officers who met quota, or were on LOA, reset to 0 strikes
 *   - officers who missed get +1 strike
 *   - at strikeLimit strikes, they are fired (set to config.firedRank)
 *
 * Fully automatic, but guarded: if NOBODY hosted anything that week, it assumes
 * a data/outage problem and skips the whole run rather than striking everyone.
 * Set quota.requireConfirmation to only flag the 3rd strike instead of firing.
 */

const CHECK_INTERVAL = 60 * 60 * 1000; // hourly; the weekKey guard makes it idempotent

const weekKeyFor = (weekStart: Date): string => weekStart.toISOString().slice(0, 10);

const runForGuild = async (client: Client, guildId: string, groupId: number) => {
    const q = config.quota;
    if(!q?.enabled || (q.roleIds || []).length === 0) return;

    const guild = client.guilds.cache.get(guildId);
    if(!guild) return;

    // The week that just ended: this quota week's start minus one week.
    const thisWeekStart = getWeekStart();
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekKey = weekKeyFor(lastWeekStart);

    // Only run once per week: if everyone's already been checked for this week, stop.
    // (Cheap gate; per-officer lastCheckedAt is the real idempotency.)

    // Outage guard: only skip if the data layer itself is unreachable, NOT if
    // the count is simply zero. A zero-event week means officers didn't host and
    // SHOULD be struck; a broken DB means we can't tell and must not strike.
    const healthy = await provider.healthCheck();
    if(!healthy) {
        console.warn(`[quotaStrikes] ${guildId}: data layer unhealthy - skipping this run to avoid false strikes.`);
        return;
    }

    const loas = await provider.findLoasOverlapping(guildId, lastWeekStart, thisWeekStart);
    const onLeave = new Set(loas.map((l: any) => l.discordId));

    const officers = [ ... guild.members.cache.values() ].filter((m: GuildMember) =>
        !m.user.bot && m.roles.cache.some((r) => q.roleIds.includes(r.id)));

    const logChannel = config.logChannels?.actions
        ? guild.channels.cache.get(config.logChannels.actions) as TextChannel
        : null;

    const fired: string[] = [];
    const struck: { id: string; strikes: number }[] = [];

    for(const officer of officers) {
        try {
            const record = await provider.getQuotaStrike(guildId, String(groupId), officer.id);

            // Already processed this week? Skip - makes the hourly loop idempotent.
            if(record?.lastCheckedAt === weekKey) continue;
            if(record?.fired) continue;

            // Count only events hosted within the completed week window.
            const hosted = await provider.countEventsByHost(guildId, officer.id, lastWeekStart);
            const metQuota = hosted >= q.perWeek;
            const excused = onLeave.has(officer.id);

            if(metQuota || excused) {
                if(record?.strikes) await provider.setQuotaStrikes(guildId, String(groupId), officer.id, 0, weekKey);
                else await provider.setQuotaStrikes(guildId, String(groupId), officer.id, 0, weekKey);
                continue;
            }

            const newStrikes = (record?.strikes || 0) + 1;
            const limit = q.strikeLimit ?? 3;

            if(newStrikes >= limit && !q.requireConfirmation) {
                await provider.setQuotaStrikes(guildId, String(groupId), officer.id, newStrikes, weekKey, true);
                await fireOfficer(officer, groupId);
                await dmOfficer(officer, newStrikes, limit, q.perWeek, true);
                fired.push(`<@${officer.id}>`);
            } else {
                await provider.setQuotaStrikes(guildId, String(groupId), officer.id, newStrikes, weekKey);
                await dmOfficer(officer, newStrikes, limit, q.perWeek, false);
                struck.push({ id: officer.id, strikes: newStrikes });
            }
        } catch (err) {
            console.error(`[quotaStrikes] ${guildId}/${officer.id}:`, err);
        }
    }

    if(logChannel && (fired.length || struck.length)) {
        const lines: string[] = [ `**Weekly quota check** (week of ${weekKey})` ];
        for(const s of struck) {
            const atLimit = s.strikes >= (q.strikeLimit ?? 3);
            lines.push(`<@${s.id}> - strike ${s.strikes}/${q.strikeLimit ?? 3}${atLimit ? ' (eligible for removal)' : ''}`);
        }
        if(fired.length) lines.push(`\nFired for reaching the strike limit: ${fired.join(', ')}`);
        logChannel.send({ content: lines.join('\n') }).catch(() => {});
    }
}


/** DMs an officer when they take a quota strike (or are fired). Best-effort. */
const dmOfficer = async (officer: GuildMember, strikes: number, limit: number, perWeek: number, wasFired: boolean) => {
    try {
        const body = wasFired
            ? `You missed your weekly hosting quota and have reached **${strikes}/${limit}** strikes, so you have been removed from your position.\n\nIf you believe this is a mistake, contact command.`
            : `You did not meet your weekly hosting quota. This is strike **${strikes}/${limit}**.\n\n${strikes >= limit ? 'You are now eligible for removal.' : `Host at least ${perWeek} event next week to avoid another strike. Hosting resets your strikes.`}`;
        await officer.send({ embeds: [ getNotificationEmbed(body, wasFired ? 'Removed for Quota' : 'Quota Strike') ] });
    } catch (err) {
        // DMs closed - the log channel still records it.
    }
}

const fireOfficer = async (officer: GuildMember, groupId: number) => {
    const robloxUser = await getLinkedRobloxUser(officer.id, officer.guild.id);
    if(!robloxUser) {
        console.warn(`[quotaStrikes] cannot fire ${officer.id}: no linked Roblox account.`);
        return;
    }
    const group = await robloxClient.getGroup(groupId);
    const roles = await group.getRoles();
    const firedRole = roles.find((r) => r.rank === config.firedRank);
    if(!firedRole) return;

    const member = await group.getMember(robloxUser.id);
    if(!member || member.role.rank === config.firedRank) return;

    await group.updateMember(robloxUser.id, firedRole.id);
    logAction('Fire', 'Quota System', 'Reached weekly quota strike limit', robloxUser);
}

const registerQuotaStrikes = (client: Client) => {
    if(!config.quota?.enabled || !config.quota?.strikeLimit) return;

    const loop = async () => {
        try {
            for(const [ guildId, groupId ] of Object.entries(config.guildGroups || { })) {
                await runForGuild(client, guildId, groupId as number);
            }
            // Also the default group, keyed to whichever guild(s) it runs in.
            // If guildGroups is empty, run every guild the bot is in against the default group.
            if(!config.guildGroups || Object.keys(config.guildGroups).length === 0) {
                for(const guild of client.guilds.cache.values()) {
                    await runForGuild(client, guild.id, config.groupId);
                }
            }
        } catch (err) {
            console.error('[quotaStrikes]', err);
        }
        setTimeout(loop, CHECK_INTERVAL);
    }
    // First run a minute after startup, once members are cached.
    setTimeout(loop, 90 * 1000);
}

export default registerQuotaStrikes;
