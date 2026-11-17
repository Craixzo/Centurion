import { Client, EmbedBuilder, GuildMember, Message } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { mainColor } from './locale';
import { getBranches, allOfficerRoleIds, Status } from './recruitment/common';
import { hasHostedTryout } from './recruitment/service';

/**
 * Event advisor. An officer pings Centurion anywhere in Yellonia and gets the
 * events most likely to go well right now, with the best time to host them.
 *
 * Everything comes from the bot's own records (last LOOKBACK_DAYS):
 *   - turnout: average ✅ RSVPs per event type (smoothed, so one lucky event
 *     doesn't dominate), in this server if it has enough history, else Yellonia-wide
 *   - freshness: types nobody has run in a while get a boost
 *   - clashes: types already scheduled in the next 48 hours are pushed down
 *   - demand: tryouts are pushed up when recruits are waiting on them, and
 *     to the top when the asking officer's own recruits still need one
 *   - fit: in a branch server, other branches' patrols/tryouts are pushed down
 *   - best hour: the hour (config.timezone) with the best turnout that isn't
 *     already taken by another event in the next 24 hours
 *
 * RSVPs are the only turnout signal the bot has, so that's what "results" means.
 */

const LOOKBACK_DAYS = 60;
const LOCAL_MIN_EVENTS = 8;          // fewer than this in a server -> use Yellonia-wide data
const PRIOR_WEIGHT = 2;              // smoothing: acts like 2 average events per type
const COOLDOWN_MS = 20 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** Never suggested: not real "go host this" events, or not available yet. */
const EXCLUDED = new Set([ 'Other', 'Court Martial', 'Award Ceremony' ]);

type EventType = { name: string; value: string; category: string; description?: string };
type PastEvent = { guildId: string; type: string | null; title: string; at: Date; attending: number };

const db = () => (provider as any).db;
const cooldowns = new Map<string, number>();

const eventTypes = (): EventType[] => {
    const out: EventType[] = [];
    const seen = new Set<string>();
    for(const [ category, list ] of Object.entries(config.eventTypes || {})) {
        for(const t of list) {
            if(EXCLUDED.has(t.value) || seen.has(t.value)) continue;
            if(/coming soon/i.test(t.description || '')) continue;
            seen.add(t.value);
            out.push({ ... t, category });
        }
    }
    return out;
};

/** "Army Tryout" -> "Army"; null for types that aren't tied to a branch. */
const branchPrefix = (t: EventType): string | null => {
    const m = t.name.match(/^(.+?)\s+(Patrol|Tryout)$/i);
    return m ? m[1] : null;
};

/** Which configured type a past event was. /event stores the type; hand-written posts only have a title. */
const classify = (types: EventType[], type: string | null, title: string): string | null => {
    if(type && types.some((t) => t.value === type)) return type;
    const lower = `${type || ''} ${title}`.toLowerCase();
    const byLength = [ ... types ].sort((a, b) => b.name.length - a.name.length);
    return byLength.find((t) => lower.includes(t.name.toLowerCase()) || lower.includes(t.value.toLowerCase()))?.value || null;
};

const hourIn = (date: Date): number => Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hourCycle: 'h23', timeZone: config.timezone || 'UTC',
}).format(date)) % 24;

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

const isOfficer = (member: GuildMember): boolean => {
    const allowed = new Set([
        ... (config.quota?.roleIds || []),
        ... (config.permissions.users || []),
        ... (config.permissions.all || []),
        ... allOfficerRoleIds(),
    ].filter(Boolean));
    return member.roles.cache.some((r) => allowed.has(r.id));
};

const loadHistory = async (types: EventType[]): Promise<{ past: (PastEvent & { kind: string | null })[]; upcoming: (PastEvent & { kind: string | null })[] }> => {
    const now = Date.now();
    const rows = await db().event.findMany({
        where: { createdAt: { gte: new Date(now - LOOKBACK_DAYS * DAY) } },
        select: {
            guildId: true, type: true, title: true, startsAt: true, createdAt: true,
            rsvps: { where: { attending: true }, select: { id: true } },
        },
    });
    const mapped = rows.map((e: any) => {
        const at = new Date(e.startsAt || e.createdAt);
        return { guildId: e.guildId, type: e.type, title: e.title, at, attending: e.rsvps.length, kind: classify(types, e.type, e.title) };
    });
    return {
        past: mapped.filter((e: any) => e.at.getTime() <= now),
        upcoming: mapped.filter((e: any) => e.at.getTime() > now && e.at.getTime() <= now + 2 * DAY),
    };
};

/** Recruits waiting on a tryout, per branch name, plus the asking officer's own. */
const loadRecruitDemand = async (officerId: string) => {
    const perBranch = new Map<string, number>();
    const own: { username: string; branch: string }[] = [];
    const mine: { username: string; linkedEventId: string | null; channelId: string | null }[] = [];
    if(!config.recruitment?.enabled) return { perBranch, own, mine };

    const active = await db().recruitmentRequest.findMany({
        where: { activeKey: { not: null }, status: { in: [ Status.Awaiting, Status.Assigned, Status.Contact, Status.Training ] } },
    });
    const branches = getBranches();
    for(const r of active) {
        const branch = branches.find((b) => b.key === r.branch);
        if(!branch || branch.general) continue;
        perBranch.set(branch.name, (perBranch.get(branch.name) || 0) + 1);
        if(r.officerId === officerId && r.status !== Status.Awaiting) {
            mine.push({ username: r.username, linkedEventId: r.linkedEventId || null, channelId: r.channelId || null });
            // Already linked to an event: their tryout is scheduled, don't push another.
            if(!r.linkedEventId && !(await hasHostedTryout(r))) own.push({ username: r.username, branch: branch.name });
        }
    }
    return { perBranch, own, mine };
};

type Pick = { type: EventType; score: number; reasons: string[]; bestHour: number | null; bestHourAvg: number | null };

export const buildSuggestions = async (member: GuildMember): Promise<EmbedBuilder> => {
    const types = eventTypes();
    const { past, upcoming } = await loadHistory(types);
    const { perBranch, own, mine: myRecruits } = await loadRecruitDemand(member.id);

    const guildPast = past.filter((e) => e.guildId === member.guild.id);
    const local = guildPast.length >= LOCAL_MIN_EVENTS;
    const scope = local ? guildPast : past;
    const scopeUpcoming = local ? upcoming.filter((e) => e.guildId === member.guild.id) : upcoming;

    const overallAvg = scope.length ? scope.reduce((s, e) => s + e.attending, 0) / scope.length : 0;
    const guildName = member.guild.name.toLowerCase();
    const mainGuild = member.guild.id === config.recruitment?.guildId || member.guild.id === Object.keys(config.guildGroups || {})[0];
    const takenHours = new Set(upcoming.filter((e) => e.at.getTime() <= Date.now() + DAY).map((e) => hourIn(e.at)));

    const picks: Pick[] = types.map((type) => {
        const mine = scope.filter((e) => e.kind === type.value);
        const avg = (mine.reduce((s, e) => s + e.attending, 0) + overallAvg * PRIOR_WEIGHT) / (mine.length + PRIOR_WEIGHT);
        const last = mine.reduce((m, e) => Math.max(m, e.at.getTime()), 0);
        const daysSince = last ? (Date.now() - last) / DAY : 14;
        const scheduled = scopeUpcoming.filter((e) => e.kind === type.value).length;
        const reasons: string[] = [];

        // Proven types score on turnout, plus a bonus the longer it's been since the
        // last one. Untried types get a cautious score, so a known crowd-puller wins.
        let score = mine.length
            ? Math.max(avg, 0.5) * (1 + 0.06 * Math.min(daysSince, 14))
            : Math.max(overallAvg, 0.5) * 0.6;
        if(mine.length >= 2) reasons.push(`Averages **${avg.toFixed(1)}** RSVPs (${mine.length} hosted${local ? ' here' : ''})`);
        else reasons.push(mine.length ? 'Only hosted once recently: room to grow' : 'Not hosted recently: untested, but no competition');
        if(last && daysSince >= 5) reasons.push(`Last one was ${Math.floor(daysSince)} days ago`);

        if(scheduled > 0) {
            score *= 0.35;
            reasons.push(`${scheduled} already scheduled in the next 2 days`);
        }

        const prefix = branchPrefix(type);
        if(prefix && !mainGuild && !guildName.includes(prefix.toLowerCase())) score *= 0.4;

        if(type.category === 'tryouts' && prefix) {
            // "Army Tryout" matches a branch named "Army" or "Yellonian Army".
            const matches = (branch: string) => branch.toLowerCase().includes(prefix.toLowerCase()) || prefix.toLowerCase().includes(branch.toLowerCase());
            const waiting = [ ... perBranch ].filter(([ name ]) => matches(name)).reduce((s, [ , n ]) => s + n, 0);
            const yours = own.filter((r) => matches(r.branch));
            if(waiting) {
                score += waiting * 1.5;
                reasons.push(`**${waiting}** recruit${waiting === 1 ? '' : 's'} waiting on ${prefix}`);
            }
            if(yours.length) {
                score += 100;
                reasons.unshift(`Your recruit${yours.length === 1 ? '' : 's'} ${yours.map((r) => `**${r.username}**`).join(', ')} need${yours.length === 1 ? 's' : ''} this tryout to be completed`);
            }
        }

        // Best hour for this type (fall back to all events) that isn't already taken tomorrow.
        const pool = mine.length >= 3 ? mine : scope;
        const byHour = new Map<number, { sum: number; n: number }>();
        for(const e of pool) {
            const h = hourIn(e.at);
            const cur = byHour.get(h) || { sum: 0, n: 0 };
            byHour.set(h, { sum: cur.sum + e.attending, n: cur.n + 1 });
        }
        let bestHour: number | null = null;
        let bestHourAvg: number | null = null;
        for(const [ h, { sum, n } ] of byHour) {
            if(n < 2 || takenHours.has(h)) continue;
            const a = (sum + overallAvg) / (n + 1);
            if(bestHourAvg === null || a > bestHourAvg) { bestHour = h; bestHourAvg = a; }
        }

        return { type, score, reasons, bestHour, bestHourAvg };
    });

    const top = picks.sort((a, b) => b.score - a.score).slice(0, 3);
    const embed = new EmbedBuilder()
        .setColor(mainColor)
        .setTitle('What to host right now')
        .setDescription(`Based on ${scope.length} event${scope.length === 1 ? '' : 's'} from the last ${LOOKBACK_DAYS} days ${local ? 'in this server' : 'across Yellonia'}.`);

    top.forEach((p, i) => {
        const lines = p.reasons.slice(0, 3).map((r) => `• ${r}`);
        if(p.bestHour !== null) lines.push(`• Best time: around **${hourLabel(p.bestHour)}** (${config.timezone || 'UTC'})`);
        embed.addFields({ name: `${i + 1}. ${p.type.name}`, value: lines.join('\n').slice(0, 1024) });
    });

    if(myRecruits.length) {
        const linkedIds = myRecruits.map((r) => r.linkedEventId).filter(Boolean) as string[];
        const linked = linkedIds.length ? await db().event.findMany({ where: { id: { in: linkedIds } } }) : [];
        const byId = new Map(linked.map((e: any) => [ e.id, e ]));
        const status = myRecruits.slice(0, 8).map((r) => {
            const event: any = r.linkedEventId ? byId.get(r.linkedEventId) : null;
            const where = r.channelId ? ` <#${r.channelId}>` : '';
            return event
                ? `✅ **${r.username}** → ${event.title}${event.startsAt ? ` <t:${Math.floor(new Date(event.startsAt).getTime() / 1000)}:R>` : ''}`
                : `⚠️ **${r.username}** — not linked to an event yet${where}`;
        });
        embed.addFields(
            { name: 'Your recruits', value: status.join('\n').slice(0, 1024) },
            { name: 'Getting them to show up', value: [
                '1. Schedule it with **/event** (counts toward your quota).',
                '2. In each recruit\'s ticket, press **Link to Event**. Centurion RSVPs them, DMs them the time and game link, and reminds them 5 minutes before and at start.',
                '3. Message them in the ticket to confirm they can make it. If not, reschedule and link the new event.',
                '4. After it runs: **Training Complete** → **Complete Recruitment**.',
            ].join('\n') },
        );
    }

    if(scope.length < LOCAL_MIN_EVENTS) {
        embed.addFields({ name: 'Heads up', value: 'There isn\'t much event history yet, so these picks will get sharper as more events are logged.' });
    }
    embed.setFooter({ text: 'Turnout = ✅ RSVPs. Host with /event so it counts toward your quota.' });
    return embed;
};

/** Officers ping Centurion (in any server) to get suggestions. */
export const registerEventAdvisor = (client: Client) => {
    client.on('messageCreate', async (message: Message) => {
        try {
            if(message.author.bot || !message.guild || !client.user) return;
            // A real @mention of the bot, not just a reply to one of its messages.
            if(!new RegExp(`<@!?${client.user.id}>`).test(message.content)) return;

            const member = message.member || await message.guild.members.fetch(message.author.id).catch((): null => null);
            if(!member || !isOfficer(member)) return;

            const last = cooldowns.get(member.id) || 0;
            if(Date.now() - last < COOLDOWN_MS) return;
            cooldowns.set(member.id, Date.now());

            if('sendTyping' in message.channel) await message.channel.sendTyping().catch((): null => null);
            const embed = await buildSuggestions(member);
            await message.reply({ embeds: [ embed ], allowedMentions: { repliedUser: false } });
        } catch (err) {
            console.error('[eventAdvisor]', err);
        }
    });
};
