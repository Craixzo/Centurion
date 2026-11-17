import { config } from '../config';

/**
 * Start of the current quota week, at midnight local time.
 *
 * config.quota.weekStartsOn is a day index (0 = Sunday). Defaults to Monday,
 * so "this week" means Monday 00:00 through Sunday 23:59.
 */
export const getWeekStart = (now = new Date()): Date => {
    const startDay = config.quota?.weekStartsOn ?? 1;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const diff = (start.getDay() - startDay + 7) % 7;
    start.setDate(start.getDate() - diff);
    return start;
}

/** End of the current quota week, for display. */
export const getWeekEnd = (now = new Date()): Date => {
    const end = getWeekStart(now);
    end.setDate(end.getDate() + 7);
    return end;
}

export const isQuotaEnabled = (): boolean => {
    return Boolean(config.quota?.enabled && (config.quota.roleIds || []).length > 0);
}

/** Does this member's roles put them under the quota? */
export const isUnderQuota = (roleIds: string[]): boolean => {
    if(!isQuotaEnabled()) return false;
    if(roleIds.some((id) => (config.quota.exemptRoleIds || []).includes(id))) return false;
    return roleIds.some((id) => config.quota.roleIds.includes(id));
}

/** Quota weeks are keyed by their start date, YYYY-MM-DD. */
export const weekKeyFor = (weekStart: Date): string => weekStart.toISOString().slice(0, 10);

/** Key of the most recently COMPLETED quota week (the one the weekly check judges). */
export const lastCompletedWeekKey = (now = new Date()): string =>
    weekKeyFor(new Date(getWeekStart(now).getTime() - 7 * 24 * 60 * 60 * 1000));

/**
 * Where an officer's strike row lives. Global mode keeps one row per officer
 * under 'global' + the main group; per-server mode keys by guild + its group.
 */
export const strikeScope = (guildId: string): { key: string; groupId: string } => {
    if(config.quota?.global) return { key: 'global', groupId: String(config.groupId) };
    const map = config.guildGroups || {};
    return { key: guildId, groupId: String((map[guildId] as number) || config.groupId) };
}

export const isJagcEnabled = (): boolean => Boolean(config.quota?.jagc?.enabled && config.quota.jagc.channelId);
