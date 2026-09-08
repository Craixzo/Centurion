import { config } from '../config';
import { getDenylists, Denylist } from './rowifi';
import { publicApi } from '../roblox/rest';

/**
 * RoWifi denylists used as a blacklist.
 *
 * Two kinds: a specific Roblox user, or an entire Roblox group (everyone in
 * that group is blocked). Checked before anything that raises a rank.
 *
 * The list is cached; a denylist that takes five minutes to apply is fine,
 * a request per promotion is not.
 */
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { entries: Denylist[]; at: number }>();

const GROUPS_BASE = 'https://groups.roblox.com';

export const isDenylistEnabled = (): boolean => {
    return Boolean(config.accountLinks?.useDenylist && process.env.ROWIFI_TOKEN);
}

const getEntries = async (guildId: string): Promise<Denylist[]> => {
    const cached = cache.get(guildId);
    if(cached && Date.now() - cached.at < CACHE_TTL) return cached.entries;

    try {
        const entries = await getDenylists(guildId);
        cache.set(guildId, { entries, at: Date.now() });
        return entries;
    } catch (err) {
        console.error('[denylist] fetch failed, using last known list:', err);
        return cached?.entries || [];
    }
}

export interface DenylistHit {
    reason: string;
    kind: 'user' | 'group';
    groupId?: string;
}

/**
 * Returns the matching entry if the user is denylisted, else null.
 * Group membership is only fetched when the guild actually has group entries.
 */
export const checkDenylist = async (guildId: string, robloxId: number | string): Promise<DenylistHit | null> => {
    if(!isDenylistEnabled()) return null;

    const entries = await getEntries(guildId);
    if(entries.length === 0) return null;

    const userHit = entries.find((e) => e.kind === 0 && String(e.user_id) === String(robloxId));
    if(userHit) return { reason: userHit.reason, kind: 'user' };

    const groupEntries = entries.filter((e) => e.kind === 1);
    if(groupEntries.length === 0) return null;

    try {
        const data = await publicApi('GET', `${GROUPS_BASE}/v2/users/${robloxId}/groups/roles`);
        const memberOf = new Set((data?.data || []).map((g: any) => String(g.group?.id)));

        const groupHit = groupEntries.find((e) => memberOf.has(String(e.group_id)));
        if(groupHit) return { reason: groupHit.reason, kind: 'group', groupId: groupHit.group_id };
    } catch (err) {
        // Can't read their groups; don't block on an outage.
        console.error('[denylist] group lookup failed:', err);
    }

    return null;
}
