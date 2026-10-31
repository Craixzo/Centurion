import { provider } from '../../database';
import { config } from '../../config';
import { getMainMember } from '../news/manage';
import { SITE_SETTINGS } from './settings';

/** Shared helpers for the staff area, modmail, the job board and documents. */

export const db = () => (provider as any).db;

export type Result<T = any> = { ok: true; data?: T; msg?: string } | { ok: false; msg: string };
export const fail = (msg: string): Result => ({ ok: false, msg });

export const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, max);

const ids = (list: string[]) => (list || []).filter(Boolean);

export type SiteUser = {
    discordId: string;
    name: string;
    isStaff: boolean;
    isAdmin: boolean;
    isOfficer: boolean;
};

const cache = new Map<string, { at: number; user: SiteUser | null }>();
const CACHE_MS = 30 * 1000;

/**
 * Who this Discord account is on the site, from their roles in the main
 * server. Null if they aren't in the server. Cached for 30 seconds, so a
 * removed role stops working within half a minute.
 */
export const siteUser = async (discordId: string): Promise<SiteUser | null> => {
    const hit = cache.get(discordId);
    if(hit && Date.now() - hit.at < CACHE_MS) return hit.user;

    const member = await getMainMember(discordId);
    let user: SiteUser | null = null;
    if(member) {
        const has = (list: string[]) => ids(list).some((id) => member.roles.cache.has(id));
        const isAdmin = has(SITE_SETTINGS.adminRoleIds) || has((config as any).permissions?.admin || []);
        const isStaff = isAdmin || has(SITE_SETTINGS.staffRoleIds);
        user = {
            discordId,
            name: member.displayName,
            isStaff,
            isAdmin,
            isOfficer: isStaff || has(SITE_SETTINGS.jobOfficerRoleIds),
        };
    }
    cache.set(discordId, { at: Date.now(), user });
    return user;
};

/** Writes a line to the site's audit log. Never throws. */
export const siteAudit = async (actor: SiteUser | { discordId: string; name: string }, action: string, detail = '') => {
    try {
        await db().siteAudit.create({ data: { actorId: actor.discordId, actorName: actor.name.slice(0, 60), action: action.slice(0, 80), detail: detail.slice(0, 300) } });
    } catch (err) {
        console.error('[site] audit', err);
    }
};
