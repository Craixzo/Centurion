import { provider } from '../../database';
import { DES_SETTINGS, DES_ROLES } from './settings';
import { audit, parseRoles, Result } from './auth';

/**
 * Adding and removing DES members: the /des-add and /des-remove commands,
 * and the website's admin pages (through personnel.ts).
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** What each starting access level grants. */
export const ACCESS_LEVELS: Record<string, string[]> = {
    'officer': [ 'officer' ],
    'dispatcher': [ 'dispatcher' ],
    'supervisor': [ 'officer', 'supervisor' ],
    'oia': [ 'officer', 'oia' ],
    'ofi': [ 'officer', 'ofi' ],
    'local-admin': [ 'officer', 'supervisor', 'local-admin' ],
    'service-admin': [ 'officer', 'supervisor', 'local-admin', 'service-admin' ],
};

export const addMember = async (actorDiscordId: string, input: any): Promise<Result> => {
    const discordId = clean(input.discordId, 22);
    const robloxUsername = clean(input.robloxUsername, 20);
    const badgeId = clean(input.badgeId, 20);
    const department = clean(input.department, 10).toUpperCase();
    const rank = clean(input.rank, 40);
    const unit = clean(input.unit, 60) || null;
    const access = clean(input.access, 20) || 'officer';
    // The website passes an exact list of roles instead of an access level (already checked against what the admin may grant)
    const roles: string[] | null = Array.isArray(input.roles) ? input.roles.filter((r: unknown) => typeof r === 'string' && DES_ROLES[r as string]) : null;

    if(!/^\d{15,22}$/.test(discordId)) return fail('That Discord user couldn\'t be read.');
    if(!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername)) return fail('The Roblox username must be 3 to 20 letters, numbers or underscores.');
    if(!/^[A-Za-z0-9-]{1,20}$/.test(badgeId)) return fail('The Badge ID can only use letters, numbers and dashes.');
    if(!DES_SETTINGS.departments[department]) return fail('That department isn\'t one of the choices.');
    if(!rank) return fail('A rank is required.');
    if(!roles && !ACCESS_LEVELS[access]) return fail('That access level isn\'t one of the choices.');
    if(roles && !roles.length) return fail('Pick at least one role.');

    const byBadge = await db().desMember.findUnique({ where: { badgeId } });
    if(byBadge && byBadge.discordId !== discordId) return fail(`Badge ID **${badgeId}** already belongs to ${byBadge.robloxUsername}.`);
    const existing = await db().desMember.findUnique({ where: { discordId } });

    const data = { robloxUsername, badgeId, department, rank, unit, roles: JSON.stringify(roles || ACCESS_LEVELS[access]) };
    let member;
    if(existing) {
        // Re-adding someone (e.g. a former member rejoining): keeps their password, signs them out
        member = await db().desMember.update({ where: { id: existing.id }, data: { ... data, status: 'ACTIVE', leftAt: null, leaveReason: null, tokenVersion: existing.tokenVersion + 1 } });
        await audit(actorDiscordId, existing.status === 'ACTIVE' ? 'Member updated' : 'Member re-added', badgeId, `${robloxUsername} · ${department} · ${rank} · ${roles ? roles.join(', ') : access}`);
    } else {
        member = await db().desMember.create({ data: { ... data, discordId, createdBy: actorDiscordId } });
        await audit(actorDiscordId, 'Member added', badgeId, `${robloxUsername} · ${department} · ${rank} · ${roles ? roles.join(', ') : access}`);
    }
    return { ok: true, data: { member, updated: !!existing, roles: parseRoles(member.roles).map((r) => DES_ROLES[r]) } };
}

export const removeMember = async (actorDiscordId: string, badgeIdRaw: unknown, reason: unknown): Promise<Result> => {
    const badgeId = clean(badgeIdRaw, 20);
    const member = await db().desMember.findUnique({ where: { badgeId } });
    if(!member || member.status === 'FORMER') return fail(`There's no active member with Badge ID **${badgeId}**.`);
    const updated = await db().desMember.update({ where: { id: member.id }, data: { status: 'FORMER', leftAt: new Date(), leaveReason: reason ? clean(reason, 300) : null, tokenVersion: member.tokenVersion + 1 } });
    await audit(actorDiscordId, 'Member removed', badgeId, `${member.robloxUsername}${reason ? ` · ${clean(reason, 200)}` : ''}`);
    return { ok: true, data: { member: updated } };
}
