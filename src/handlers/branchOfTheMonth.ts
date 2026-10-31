import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { mainColor } from './locale';
import { logAction } from './handleLogging';

/**
 * Branch of the Month.
 *
 * Score = raw number of events a branch hosted in the calendar month
 * (month boundaries in config.timezone). Every event Centurion records
 * counts - /event posts and hand-written posts picked up by manualEvents.ts.
 *
 * Which branch an event belongs to:
 *   1. The channel it was posted in (CHANNEL_BRANCHES below), otherwise
 *   2. The host's branch role in the main server (config.recruitment.branches roleId).
 *   Events that match neither are left uncounted.
 *
 * When a month ends, the winner is saved, announced (ANNOUNCE_CHANNEL_ID) and
 * given the winner role (WINNER_ROLE_ID). A tie makes every tied branch a winner.
 * Results live in the meta store, so no database migration is needed.
 *
 * The website reads GET /branch-of-the-month (see api.ts).
 */

/* ---------- SETTINGS ---------- */

/**
 * Mode the bot starts in until an admin changes it with /botm-mode
 * (the choice is saved, so it survives restarts).
 *   'manual'    - nothing is counted from event channels and nothing is decided on its own.
 *                 Staff log events with /botm-add and pick the winner with /botm-set.
 *   'automatic' - events Centurion records are counted, and the month is decided at
 *                 midnight on the 1st. /botm-add still works, as a correction on top.
 */
const DEFAULT_MODE: BotmMode = 'manual';

/** Channel ID -> branch key. Keys must match config.recruitment.branches. */
const CHANNEL_BRANCHES: Record<string, string> = {
    '911767148161040404': 'army',       // Army: Events Schedule
    '940816706283135056': 'army',       // 3rd Armored Division: Events
    '823291036012249128': 'army',       // 1st Infantry Division: Events
    '944806856323383396': 'navy',       // Navy: Events
    '935682168326357032': 'navy',       // 2nd Fleet: Events
    '1113278064101707877': 'navy',      // 6th Marines: Events Schedule
    '1180922507881103420': 'airforce',  // Air Force: Events Schedule
    '812802721471266818': 'airforce',   // 4th Air Combat Division: Events Schedule
    '1457512799516229852': 'airforce',  // 9th Helicopter Operations Division: Events Schedule
    '1474063802256326739': 'mpc',       // Military Police: Events Schedule
    // Main Server: Events Schedule is not listed, so those events go by the host's branch role.
};

/** Where the winner is announced when a month ends. Leave '' to skip the announcement. */
const ANNOUNCE_CHANNEL_ID = '';

/** Role given to every member of the winning branch for the month. Leave '' to skip. Must be below Centurion's own role. */
const WINNER_ROLE_ID = '';

/** First month that is scored. Earlier months are never decided automatically. */
const FIRST_MONTH = '2026-10';

/** DM the winning branch's officers (config.recruitment.branches officerRoleIds) when a winner is set. */
const CONGRATULATE_OFFICERS = true;

/** How often Centurion checks whether a month has ended. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

const META_KEY = 'branchOfTheMonth';
const CACHE_MS = 60_000;
const HISTORY_LIMIT = 60;   // months kept

/* ---------- TYPES ---------- */

export type BotmMode = 'manual' | 'automatic';

export interface BranchScore {
    key: string;
    name: string;
    count: number;
}

export interface MonthResult {
    month: string;          // "2026-10"
    winners: BranchScore[];
    standings: BranchScore[];
    decidedAt: string;
    overridden?: boolean;
}

interface Stored {
    history: MonthResult[];  // newest first
}

/* ---------- BRANCHES ---------- */

const scoredBranches = () =>
    ((config as any).recruitment?.branches || [])
        .filter((branch: any) => !branch.general)
        .map((branch: any) => ({
            key: String(branch.key),
            name: String(branch.name),
            roleId: String(branch.roleId || ''),
            officerRoleIds: ((branch.officerRoleIds || []) as string[]).filter(Boolean),
        }));

export const branchChoices = () => scoredBranches().map((branch: any) => ({ name: branch.name, value: branch.key }));

const branchName = (key: string) => scoredBranches().find((branch: any) => branch.key === key)?.name || key;

/* ---------- MONTHS (in config.timezone) ---------- */

const zone = () => config.timezone || 'UTC';

const offsetAt = (date: Date, timeZone: string): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).reduce((acc: any, part) => {
        if(part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    return asUtc - date.getTime();
};

/** Midnight on the 1st of a month in config.timezone, as a real instant. month is 1-12 and may overflow. */
const monthStart = (year: number, month: number): Date => {
    const guess = Date.UTC(year, month - 1, 1, 0, 0);
    const first = guess - offsetAt(new Date(guess), zone());
    return new Date(guess - offsetAt(new Date(first), zone()));
};

const parseKey = (key: string) => {
    const [ year, month ] = key.split('-').map(Number);
    return { year, month };
};

export const isMonthKey = (key: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key);

/** "2026-10" for the month a date falls in, in config.timezone. */
export const monthKeyOf = (date = new Date()): string => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone(), year: 'numeric', month: '2-digit' }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')!.value;
    const month = parts.find((part) => part.type === 'month')!.value;
    return `${year}-${month}`;
};

export const previousMonthKey = (key: string): string => {
    const { year, month } = parseKey(key);
    return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
};

export const monthLabel = (key: string): string => {
    const { year, month } = parseKey(key);
    return new Date(Date.UTC(year, month - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const monthRange = (key: string) => {
    const { year, month } = parseKey(key);
    return { from: monthStart(year, month), to: monthStart(year, month + 1) };
};

/* ---------- MODE AND MANUAL TALLY (meta store) ---------- */

const MODE_KEY = 'branchOfTheMonthMode';
const TALLY_KEY = 'branchOfTheMonthTally';

let modeCache: BotmMode | null = null;

export const getMode = async (): Promise<BotmMode> => {
    if(modeCache) return modeCache;
    const stored = await provider.getMeta(MODE_KEY).catch((): null => null);
    modeCache = stored === 'automatic' || stored === 'manual' ? stored : DEFAULT_MODE;
    return modeCache;
};

export const setMode = async (mode: BotmMode) => {
    await provider.setMeta(MODE_KEY, mode);
    modeCache = mode;
    cached = null;
};

/** month -> branch key -> events logged by hand. */
type Tally = Record<string, Record<string, number>>;

const loadTally = async (): Promise<Tally> => {
    try {
        const raw = await provider.getMeta(TALLY_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if(parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
        console.error('[botm] could not read the manual tally', err);
    }
    return {};
};

/** Adds (or with a negative amount, removes) hand-logged events. Never goes below 0. Returns the new total. */
export const addToTally = async (key: string, branchKey: string, amount: number): Promise<number> => {
    const tally = await loadTally();
    const month = tally[key] || (tally[key] = {});
    month[branchKey] = Math.max(0, (month[branchKey] || 0) + amount);
    // Keep the last 12 months only.
    for(const old of Object.keys(tally).sort().slice(0, -12)) delete tally[old];
    await provider.setMeta(TALLY_KEY, JSON.stringify(tally));
    cached = null;
    return month[branchKey];
};

/** True once any branch has a hand-logged event this month. */
const hasTally = async (key: string) => Object.values((await loadTally())[key] || {}).some((count) => count > 0);

export const isMonthDecided = async (key: string) => (await load()).history.some((entry) => entry.month === key);

/* ---------- SCORING ---------- */

const db = () => (provider as any).db;

let botClient: Client | null = null;

const mainGuild = (): Guild | null => {
    const guildId = (config as any).recruitment?.guildId;
    return (guildId && botClient?.guilds.cache.get(guildId)) || null;
};

/** The host's branch from their roles in the main server, or null. */
const branchOfHost = (hostId: string): string | null => {
    const member = mainGuild()?.members.cache.get(hostId);
    if(!member) return null;
    const branch = scoredBranches().find((entry: any) => entry.roleId && member.roles.cache.has(entry.roleId));
    return branch ? branch.key : null;
};

/**
 * Event counts per branch for a month, highest first. Every branch is listed, even at 0.
 * Manual mode: only hand-logged events. Automatic: recorded events plus hand-logged ones.
 */
export const getStandings = async (key: string): Promise<BranchScore[]> => {
    const counts: Record<string, number> = { ... ((await loadTally())[key] || {}) };

    if(await getMode() === 'automatic') {
        const { from, to } = monthRange(key);
        const events: { channelId: string; hostId: string }[] = await db().event.findMany({
            where: { createdAt: { gte: from, lt: to } },
            select: { channelId: true, hostId: true },
        });
        for(const event of events) {
            const branch = CHANNEL_BRANCHES[event.channelId] || branchOfHost(event.hostId);
            if(branch) counts[branch] = (counts[branch] || 0) + 1;
        }
    }

    return scoredBranches()
        .map((branch: any) => ({ key: branch.key, name: branch.name, count: counts[branch.key] || 0 }))
        .sort((a: BranchScore, b: BranchScore) => b.count - a.count);
};

/**
 * Standings to show for a month: the saved result once the month has been
 * decided (including one set early with /botm-set), otherwise the live count.
 */
export const getShownStandings = async (key: string): Promise<{ standings: BranchScore[]; decided: boolean }> => {
    const saved = (await load()).history.find((entry) => entry.month === key);
    if(saved) return { standings: saved.standings, decided: true };
    // Manual mode with nothing logged yet: show nothing rather than a row of zeros.
    if(await getMode() === 'manual' && !(await hasTally(key))) return { standings: [], decided: false };
    return { standings: await getStandings(key), decided: false };
};

export interface EventCredit {
    title: string;
    channelId: string;
    hostId: string;
    createdAt: Date;
    branch: string | null;           // branch key, or null if uncounted
    reason: 'channel' | 'host role' | 'uncounted';
}

/** Every event in a month and which branch it was credited to - for /botm-check. */
export const getEventCredits = async (key: string): Promise<EventCredit[]> => {
    const { from, to } = monthRange(key);
    const events: any[] = await db().event.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { title: true, channelId: true, hostId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });
    return events.map((event) => {
        const byChannel = CHANNEL_BRANCHES[event.channelId];
        const byHost = byChannel ? null : branchOfHost(event.hostId);
        return {
            title: event.title,
            channelId: event.channelId,
            hostId: event.hostId,
            createdAt: event.createdAt,
            branch: byChannel || byHost,
            reason: byChannel ? 'channel' : byHost ? 'host role' : 'uncounted',
        };
    });
};

export { branchName };

const topOf = (standings: BranchScore[]) => {
    const best = standings[0]?.count || 0;
    return best > 0 ? standings.filter((entry) => entry.count === best) : [];
};

/* ---------- STORAGE ---------- */

const load = async (): Promise<Stored> => {
    try {
        const raw = await provider.getMeta(META_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if(parsed && Array.isArray(parsed.history)) return parsed;
    } catch (err) {
        console.error('[botm] could not read stored results', err);
    }
    return { history: [] };
};

const save = async (stored: Stored) => {
    stored.history.sort((a, b) => b.month.localeCompare(a.month));
    stored.history = stored.history.slice(0, HISTORY_LIMIT);
    await provider.setMeta(META_KEY, JSON.stringify(stored));
    cached = null;
};

export const getHistory = async () => (await load()).history;

/** The most recent decided month - the current Branch of the Month. */
export const getHolder = async (): Promise<MonthResult | null> => (await load()).history[0] || null;

/* ---------- PERKS ---------- */

/** Moves the winner role to everyone holding the winning branches' roles. */
const applyWinnerRole = async (winners: BranchScore[]) => {
    const guild = mainGuild();
    if(!WINNER_ROLE_ID || !guild) return;

    const roleIds = scoredBranches()
        .filter((branch: any) => winners.some((winner) => winner.key === branch.key) && branch.roleId)
        .map((branch: any) => branch.roleId);

    for(const member of guild.members.cache.values()) {
        const shouldHave = roleIds.some((id: string) => member.roles.cache.has(id));
        const has = member.roles.cache.has(WINNER_ROLE_ID);
        try {
            if(shouldHave && !has) await member.roles.add(WINNER_ROLE_ID, 'Branch of the Month');
            if(!shouldHave && has) await member.roles.remove(WINNER_ROLE_ID, 'Branch of the Month ended');
        } catch (err) {
            console.error(`[botm] could not update winner role for ${member.id}`);
        }
    }
};

export const buildResultEmbed = (result: MonthResult) => {
    const names = result.winners.map((winner) => `**${winner.name}**`).join(' and ');
    const lines = result.standings.map((entry, index) => `\`${String(index + 1).padStart(2)}\` ${entry.name} - **${entry.count}** event${entry.count === 1 ? '' : 's'}`);
    return new EmbedBuilder()
        .setColor(mainColor)
        .setTitle(`Branch of the Month: ${monthLabel(result.month)}`)
        .setDescription(`${result.winners.length ? `${names} ${result.winners.length > 1 ? 'share' : 'takes'} ${monthLabel(result.month)}.` : 'No events were hosted, so there is no winner.'}\n\n${lines.join('\n')}`)
        .setFooter({ text: result.overridden ? 'Set by an administrator.' : 'Scored on events hosted.' });
};

const announce = async (result: MonthResult) => {
    if(!ANNOUNCE_CHANNEL_ID || !botClient) return;
    try {
        const channel = await botClient.channels.fetch(ANNOUNCE_CHANNEL_ID) as TextChannel;
        await channel.send({ embeds: [ buildResultEmbed(result) ] });
    } catch (err) {
        console.error('[botm] could not announce the winner', err);
    }
};

/** DMs every officer of the winning branches, once each. Officer roles are looked up in the officer server and the main server. */
const congratulateOfficers = async (result: MonthResult) => {
    if(!CONGRATULATE_OFFICERS || !botClient || !result.winners.length) return;
    const recruitment = (config as any).recruitment || {};
    const guilds = [ recruitment.officerGuildId, recruitment.guildId ]
        .map((id: string) => id && botClient!.guilds.cache.get(id))
        .filter(Boolean) as Guild[];

    const sent = new Set<string>();
    for(const winner of result.winners) {
        const branch = scoredBranches().find((entry: any) => entry.key === winner.key);
        if(!branch || !branch.officerRoleIds.length) continue;

        const embed = new EmbedBuilder()
            .setColor(mainColor)
            .setTitle(`Congratulations - Branch of the Month`)
            .setDescription(`**${branch.name}** is the Branch of the Month for **${monthLabel(result.month)}**${winner.count ? ` with **${winner.count}** event${winner.count === 1 ? '' : 's'} hosted` : ''}.\n\nThank you for keeping your branch active. Keep the events coming to hold the title next month.`);
        if(config.notificationFooter) embed.setFooter({ text: config.notificationFooter });

        for(const guild of guilds) {
            for(const member of guild.members.cache.values()) {
                if(member.user.bot || sent.has(member.id)) continue;
                if(!branch.officerRoleIds.some((id: string) => member.roles.cache.has(id))) continue;
                sent.add(member.id);
                await member.send({ embeds: [ embed ] }).catch(() => { /* DMs closed */ });
                await new Promise((resolve) => setTimeout(resolve, 1000));   // stay well under Discord's DM rate limit
            }
        }
    }
    console.log(`[botm] congratulated ${sent.size} officer(s) for ${result.month}`);
};

/* ---------- DECIDING A MONTH ---------- */

/** Scores and saves a finished month. Returns the result, or the existing one if it was already decided. */
export const decideMonth = async (key: string): Promise<MonthResult> => {
    const stored = await load();
    const existing = stored.history.find((entry) => entry.month === key);
    if(existing) return existing;

    const standings = await getStandings(key);
    const result: MonthResult = { month: key, winners: topOf(standings), standings, decidedAt: new Date().toISOString() };
    stored.history.push(result);
    await save(stored);

    const isLatest = stored.history[0]?.month === key;
    if(isLatest) {
        await announce(result);
        await applyWinnerRole(result.winners);
        await congratulateOfficers(result);
    }
    return result;
};

/**
 * Admin override: sets a month's winner by hand (tie-break, dispute, or early,
 * before the month ends). A month set early is not re-scored when it closes.
 * Pass eventCount to also set how many events the winner is shown as hosting;
 * otherwise the winner's current count (logged and/or recorded) is used.
 */
export const overrideMonth = async (key: string, branchKey: string, eventCount?: number): Promise<MonthResult> => {
    const stored = await load();
    const standings = await getStandings(key);
    let winner = standings.find((entry) => entry.key === branchKey);
    if(!winner) {
        winner = { key: branchKey, name: branchName(branchKey), count: 0 };
        standings.push(winner);
    }
    if(eventCount !== undefined) winner.count = eventCount;
    standings.sort((a, b) => b.count - a.count);
    const result: MonthResult = { month: key, winners: [ winner ], standings, decidedAt: new Date().toISOString(), overridden: true };

    stored.history = stored.history.filter((entry) => entry.month !== key);
    stored.history.push(result);
    await save(stored);

    // Runs in the background so /botm-set can reply before Discord's 3-second limit.
    if(stored.history[0]?.month === key) {
        announce(result)
            .then(() => applyWinnerRole(result.winners))
            .then(() => congratulateOfficers(result))
            .catch((err) => console.error('[botm] override perks failed', err));
    }
    logAction('Branch of the Month' as any, botClient?.user as any, `${monthLabel(key)} set to ${winner.name} (${winner.count} events)`);
    return result;
};

const checkMonthEnd = async () => {
    if(await getMode() !== 'automatic') return;   // manual mode never decides on its own
    const last = previousMonthKey(monthKeyOf());
    if(last < FIRST_MONTH) return;
    const stored = await load();
    if(stored.history.some((entry) => entry.month === last)) return;
    await decideMonth(last);
};

/* ---------- WEBSITE ---------- */

let cached: { at: number; body: any } | null = null;

/** The JSON the website receives from GET /branch-of-the-month. */
export const getBotmResponse = async () => {
    if(cached && Date.now() - cached.at < CACHE_MS) return cached.body;
    const current = monthKeyOf();
    const [ history, shown ] = await Promise.all([ getHistory(), getShownStandings(current) ]);
    const withLabel = (entry: MonthResult) => ({ month: entry.month, label: monthLabel(entry.month), winners: entry.winners, standings: entry.standings });
    const body = {
        success: true,
        holder: history[0] ? withLabel(history[0]) : null,
        mode: await getMode(),
        current: { month: current, label: monthLabel(current), standings: shown.standings, decided: shown.decided },
        history: history.map(withLabel),
    };
    cached = { at: Date.now(), body };
    return body;
};

/* ---------- STARTUP ---------- */

export const registerBranchOfTheMonth = (client: Client) => {
    botClient = client;
    const run = () => checkMonthEnd().catch((err) => console.error('[botm] month check failed', err));
    // Always scheduled; checkMonthEnd does nothing while the mode is manual.
    // First run waits until main.ts has cached members, so host roles resolve.
    client.once('ready', () => setTimeout(run, 60_000));
    setInterval(run, CHECK_EVERY_MS);
};
