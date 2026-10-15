import { config } from '../config';
import { provider } from '../database';

/**
 * Rank-skip prevention for military groups.
 *
 * A rank skip is moving someone UP more than config.rankSkip.maxStep ranks
 * in one change (Private -> Sergeant, skipping Corporal). Ranks are counted by
 * position in the group's role list, not by rank number, so gaps in rank
 * numbers (1, 5, 10, ...) do not matter. Demotions are never limited.
 *
 * Admins can grant a one-time exception for a specific person and rank.
 */

type RoleLike = { id: number; rank: number; name: string };

export const isRankSkipGroup = (groupId: number): boolean =>
    !!config.rankSkip?.enabled && (config.rankSkip.groups || []).some((group) => group.id === groupId);

export const rankSkipGroupName = (groupId: number): string =>
    (config.rankSkip?.groups || []).find((group) => group.id === groupId)?.name || String(groupId);

/** Ranks moved up (positive) or down (negative), counted by position. */
export const rankSteps = (roles: RoleLike[], oldRank: number, newRank: number): number => {
    const sorted = [ ... roles ].sort((a, b) => a.rank - b.rank);
    const from = sorted.findIndex((role) => role.rank === oldRank);
    const to = sorted.findIndex((role) => role.rank === newRank);
    if(from === -1 || to === -1) return 0;
    return to - from;
};

/** Skipped ranks between old and new, for messages. */
export const skippedRanks = (roles: RoleLike[], oldRank: number, newRank: number): string[] =>
    [ ... roles ].sort((a, b) => a.rank - b.rank)
        .filter((role) => role.rank > oldRank && role.rank < newRank)
        .map((role) => role.name);

const exceptionKey = (groupId: number, robloxId: number | string) => `rankskip:exception:${groupId}:${robloxId}`;

type Exception = { rank: number; expires: number; grantedBy: string };

export const grantException = async (groupId: number, robloxId: number | string, rank: number, grantedBy: string, hours: number) => {
    const value: Exception = { rank, expires: Date.now() + hours * 3600 * 1000, grantedBy };
    await provider.setMeta(exceptionKey(groupId, robloxId), JSON.stringify(value));
};

/** Valid exception for this person, if any (does not use it up). */
export const getException = async (groupId: number, robloxId: number | string): Promise<Exception | null> => {
    const raw = await provider.getMeta(exceptionKey(groupId, robloxId));
    if(!raw) return null;
    try {
        const value = JSON.parse(raw) as Exception;
        return value.expires > Date.now() ? value : null;
    } catch (err) {
        return null;
    }
};

const clearException = (groupId: number, robloxId: number | string) => provider.setMeta(exceptionKey(groupId, robloxId), '');

export type RankSkipResult =
    | { allowed: true; usedException: Exception | null }
    | { allowed: false; steps: number; skipped: string[] };

/**
 * Decides whether a rank change is allowed. A matching exception (promotion
 * to at most the exception's rank) is used up when it allows a skip.
 */
export const checkRankSkip = async (groupId: number, roles: RoleLike[], robloxId: number | string, oldRank: number, newRank: number): Promise<RankSkipResult> => {
    if(!isRankSkipGroup(groupId)) return { allowed: true, usedException: null };

    const steps = rankSteps(roles, oldRank, newRank);
    if(steps <= (config.rankSkip.maxStep || 1)) return { allowed: true, usedException: null };

    const exception = await getException(groupId, robloxId);
    if(exception && newRank <= exception.rank) {
        await clearException(groupId, robloxId);
        return { allowed: true, usedException: exception };
    }

    return { allowed: false, steps, skipped: skippedRanks(roles, oldRank, newRank) };
};

export const describeBlocked = (blocked: RankSkipResult, maxStep = config.rankSkip?.maxStep || 1) => {
    const result = blocked as { steps: number; skipped: string[] };
    return `That would move them up ${result.steps} ranks at once (max ${maxStep}), skipping ${result.skipped.join(', ') || 'ranks'}. Promote one rank at a time, or ask an admin for an exception with /allowrankskip.`;
};
