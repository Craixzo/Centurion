import { provider } from '../../database';
import { findMainMember } from '../news/manage';
import { DES_SETTINGS, DES_ROLES } from './settings';
import { audit, parseRoles, publicMember, Result } from './auth';
import { addMember, removeMember } from './members';

/**
 * The Personnel Database, Former Personnel and the admin pages.
 *
 * Every call carries the logged-in member's session (id + tokenVersion), which
 * is checked first, so a removed member or an old session can do nothing.
 *
 * Who can do what:
 *   any member        list personnel, view a member
 *   supervisor, OIA,  list former personnel
 *   local admin, service admin
 *   local admin       add, edit, remove, reinstate, unlock and sign out members of
 *                     THEIR OWN department who are not admins; can only grant
 *                     officer, dispatcher, supervisor, OIA and OFI
 *   service admin     all of that for every department and every role, and the audit log
 *   nobody            removes themselves or takes away their own admin role
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const LOCAL_GRANTABLE = [ 'officer', 'dispatcher', 'supervisor', 'oia', 'ofi' ];
const ADMIN_ROLES = [ 'local-admin', 'service-admin' ];

const has = (m: any, ...roles: string[]) => parseRoles(m.roles).some((r) => roles.includes(r));
const isService = (m: any) => has(m, 'service-admin');
const isAdmin = (m: any) => has(m, 'local-admin', 'service-admin');
const deptName = (d: string) => DES_SETTINGS.departments[d]?.name || d;
const deptShort = (d: string) => DES_SETTINGS.departments[d]?.short || d;

/** The member making the request, if their session is still good. */
export const actorFrom = async (session: any) => {
    if(!session || typeof session.memberId !== 'string') return null;
    const m = await db().desMember.findUnique({ where: { id: session.memberId } });
    if(!m || m.status !== 'ACTIVE' || m.tokenVersion !== Number(session.tokenVersion)) return null;
    return m;
}

/** Can this admin change this member at all? */
const canManage = (actor: any, target: any) => {
    if(isService(actor)) return true;
    if(!has(actor, 'local-admin')) return false;
    return target.department === actor.department && !has(target, ...ADMIN_ROLES);
}

const grantable = (actor: any) => isService(actor) ? Object.keys(DES_ROLES) : has(actor, 'local-admin') ? LOCAL_GRANTABLE : [];

const checkRoles = (actor: any, roles: unknown): string[] | string => {
    if(!Array.isArray(roles)) return 'Pick at least one role.';
    const list = Array.from(new Set(roles.map((r) => String(r))));
    if(!list.length) return 'Pick at least one role.';
    const allowed = grantable(actor);
    const bad = list.find((r) => !DES_ROLES[r] || !allowed.includes(r));
    if(bad) return DES_ROLES[bad] ? `You can't give the ${DES_ROLES[bad]} role.` : 'One of those roles doesn\'t exist.';
    return list;
}

const row = (m: any, adminView: boolean) => ({
    id: m.id,
    username: m.robloxUsername,
    badgeId: m.badgeId,
    department: m.department,
    departmentShort: deptShort(m.department),
    rank: m.rank,
    unit: m.unit,
    joinedAt: m.joinedAt,
    leftAt: m.leftAt,
    status: m.status,
    ... (adminView ? {
        roles: parseRoles(m.roles),
        setUp: !!m.passwordHash,
        locked: !!(m.lockedUntil && new Date(m.lockedUntil).getTime() > Date.now()),
        leaveReason: m.leaveReason || null,
    } : {}),
});

// ---------------------------------------------------------------- reading

export const listPersonnel = async (actor: any, input: any): Promise<Result> => {
    const former = input.former === true;
    if(former && !has(actor, 'supervisor', 'oia', 'local-admin', 'service-admin')) return fail('Your role doesn\'t include Former Personnel.');
    const where: any = { status: former ? 'FORMER' : 'ACTIVE' };
    const all = await db().desMember.findMany({ where, orderBy: { joinedAt: 'asc' } });
    const adminView = isAdmin(actor);
    return { ok: true, data: {
        members: all.map((m: any) => ({ ... row(m, adminView && canManage(actor, m)), manageable: canManage(actor, m) })),
        departments: Object.entries(DES_SETTINGS.departments).map(([ key, d ]) => ({ key, name: d.name, short: d.short })),
        canAdd: isAdmin(actor),
    } };
}

export const getMember = async (actor: any, input: any): Promise<Result> => {
    const m = await db().desMember.findUnique({ where: { id: clean(input.id, 64) } });
    if(!m) return fail('That member doesn\'t exist.');
    if(m.status === 'FORMER' && !has(actor, 'supervisor', 'oia', 'local-admin', 'service-admin')) return fail('That member has left, and your role doesn\'t include Former Personnel.');
    const manage = canManage(actor, m);
    const data: any = { member: { ... row(m, manage), departmentName: deptName(m.department) }, manageable: manage, self: m.id === actor.id };
    if(manage) {
        data.member.discordId = m.discordId;
        data.member.lastLoginAt = m.lastLoginAt;
        data.member.passwordSetAt = m.passwordSetAt;
        data.grantable = grantable(actor).map((key) => ({ key, name: DES_ROLES[key] }));
        data.departments = isService(actor)
            ? Object.entries(DES_SETTINGS.departments).map(([ key, d ]) => ({ key, name: d.name }))
            : [ { key: actor.department, name: deptName(actor.department) } ];
        data.history = (await db().desAudit.findMany({ where: { target: m.badgeId }, orderBy: { createdAt: 'desc' }, take: 15 }))
            .map((a: any) => ({ action: a.action, detail: a.detail, at: a.createdAt }));
    }
    return { ok: true, data };
}

// ---------------------------------------------------------------- changing

export const addFromWeb = async (actor: any, input: any): Promise<Result> => {
    if(!isAdmin(actor)) return fail('Only admins can add members.');
    const department = isService(actor) ? clean(input.department, 10).toUpperCase() : actor.department;
    const roles = checkRoles(actor, input.roles);
    if(typeof roles === 'string') return fail(roles);

    const query = clean(input.discord, 40);
    if(!query) return fail('Enter their Discord username or ID.');
    const found = await findMainMember(query);
    if(!found) return fail('No member of the Yellonia Discord server has that username or ID.');
    if(found.user.bot) return fail('Bots can\'t be members.');

    const existing = await db().desMember.findUnique({ where: { discordId: found.id } });
    if(existing && existing.status === 'ACTIVE') return fail(`${found.user.username} is already a member (Badge ${existing.badgeId}). Edit them instead.`);
    if(existing && !canManage(actor, existing)) return fail('That person was a member of another department; a Service Admin needs to re-add them.');

    const result = await addMember(actor.id, {
        discordId: found.id, robloxUsername: input.robloxUsername, badgeId: input.badgeId, department,
        rank: input.rank, unit: input.unit, roles,
    });
    if(result.ok === false) return result;
    return { ok: true, msg: `${result.data.member.robloxUsername} has been added. They can now set their password with their Discord account.`, data: { id: result.data.member.id } };
}

export const updateMember = async (actor: any, input: any): Promise<Result> => {
    const m = await db().desMember.findUnique({ where: { id: clean(input.id, 64) } });
    if(!m || m.status !== 'ACTIVE') return fail('That member doesn\'t exist or has left.');
    if(!canManage(actor, m)) return fail('You can\'t change this member.');

    const data: any = {};
    const changes: string[] = [];
    if(input.rank !== undefined) {
        const rank = clean(input.rank, 40);
        if(!rank) return fail('A rank is required.');
        if(rank !== m.rank) { data.rank = rank; changes.push(`rank ${m.rank} → ${rank}`); }
    }
    if(input.unit !== undefined) {
        const unit = clean(input.unit, 60) || null;
        if(unit !== m.unit) { data.unit = unit; changes.push(`unit → ${unit || 'none'}`); }
    }
    if(input.department !== undefined && input.department !== m.department) {
        if(!isService(actor)) return fail('Only a Service Admin can move someone to another department.');
        const dept = clean(input.department, 10).toUpperCase();
        if(!DES_SETTINGS.departments[dept]) return fail('That department isn\'t one of the choices.');
        data.department = dept; changes.push(`department → ${dept}`);
    }
    if(input.roles !== undefined) {
        const roles = checkRoles(actor, input.roles);
        if(typeof roles === 'string') return fail(roles);
        // Roles the admin isn't allowed to give are kept as they were
        const kept = parseRoles(m.roles).filter((r) => !grantable(actor).includes(r));
        const next = Array.from(new Set([ ... kept, ... roles ]));
        if(m.id === actor.id && isService(actor) && !next.includes('service-admin')) return fail('You can\'t remove your own Service Admin role.');
        if(JSON.stringify([ ... next ].sort()) !== JSON.stringify(parseRoles(m.roles).sort())) {
            data.roles = JSON.stringify(next);
            data.tokenVersion = m.tokenVersion + 1;   // new access applies at their next login
            changes.push(`roles → ${next.join(', ')}`);
        }
    }
    if(!changes.length) return { ok: true, msg: 'Nothing changed.' };
    await db().desMember.update({ where: { id: m.id }, data });
    await audit(actor.id, 'Member updated', m.badgeId, `${m.robloxUsername}: ${changes.join('; ')}`);
    return { ok: true, msg: data.roles ? 'Saved. Their roles changed, so they\'ve been logged out to pick up the new access.' : 'Saved.' };
}

export const removeFromWeb = async (actor: any, input: any): Promise<Result> => {
    const m = await db().desMember.findUnique({ where: { id: clean(input.id, 64) } });
    if(!m || m.status !== 'ACTIVE') return fail('That member doesn\'t exist or has already left.');
    if(m.id === actor.id) return fail('You can\'t remove yourself.');
    if(!canManage(actor, m)) return fail('You can\'t remove this member.');
    const reason = clean(input.reason, 300);
    if(!reason) return fail('Give a reason; it\'s kept in Former Personnel.');
    const result = await removeMember(actor.id, m.badgeId, reason);
    if(result.ok === false) return result;
    return { ok: true, msg: `${m.robloxUsername} is now former personnel and has been logged out.` };
}

export const reinstateMember = async (actor: any, input: any): Promise<Result> => {
    const m = await db().desMember.findUnique({ where: { id: clean(input.id, 64) } });
    if(!m || m.status !== 'FORMER') return fail('That person isn\'t former personnel.');
    if(!canManage(actor, m)) return fail('You can\'t reinstate this member.');
    const clash = await db().desMember.findUnique({ where: { badgeId: m.badgeId } });
    if(clash && clash.id !== m.id) return fail(`Badge ${m.badgeId} has been given to someone else. Re-add them with a new Badge ID.`);
    await db().desMember.update({ where: { id: m.id }, data: { status: 'ACTIVE', leftAt: null, leaveReason: null, joinedAt: new Date(), tokenVersion: m.tokenVersion + 1 } });
    await audit(actor.id, 'Member reinstated', m.badgeId, m.robloxUsername);
    return { ok: true, msg: `${m.robloxUsername} is active again. Their old password still works.` };
}

export const unlockMember = async (actor: any, input: any): Promise<Result> => {
    const m = await db().desMember.findUnique({ where: { id: clean(input.id, 64) } });
    if(!m || !canManage(actor, m)) return fail('You can\'t change this member.');
    await db().desMember.update({ where: { id: m.id }, data: { failedLogins: 0, lockedUntil: null } });
    await audit(actor.id, 'Account unlocked', m.badgeId, m.robloxUsername);
    return { ok: true, msg: 'Unlocked. They can log in again.' };
}

export const signOutMember = async (actor: any, input: any): Promise<Result> => {
    const m = await db().desMember.findUnique({ where: { id: clean(input.id, 64) } });
    if(!m || !canManage(actor, m)) return fail('You can\'t change this member.');
    await db().desMember.update({ where: { id: m.id }, data: { tokenVersion: m.tokenVersion + 1 } });
    await audit(actor.id, 'Signed out everywhere', m.badgeId, m.robloxUsername);
    return { ok: true, msg: m.id === actor.id ? 'You\'ve been signed out everywhere.' : `${m.robloxUsername} has been signed out everywhere.` };
}

// ---------------------------------------------------------------- audit log (Service Admin)

export const listAudit = async (actor: any, input: any): Promise<Result> => {
    if(!isService(actor)) return fail('Only Service Admins can see the audit log.');
    const filter = clean(input.badge, 20);
    const entries = await db().desAudit.findMany({ where: filter ? { target: filter } : {}, orderBy: { createdAt: 'desc' }, take: 300 });

    // Show who did each thing: a member's id becomes their name; a Discord ID (from a Discord command) is shown as such
    const ids = Array.from(new Set(entries.map((e: any) => e.actorId).filter(Boolean))) as string[];
    const names: Record<string, string> = {};
    for(const id of ids) {
        const m = /^\d{15,22}$/.test(id)
            ? await db().desMember.findUnique({ where: { discordId: id } })
            : await db().desMember.findUnique({ where: { id } });
        names[id] = m ? `${m.robloxUsername} (${m.badgeId})` : (/^\d{15,22}$/.test(id) ? `Discord ${id}` : 'unknown');
    }
    return { ok: true, data: { entries: entries.map((e: any) => ({ at: e.createdAt, action: e.action, by: e.actorId ? names[e.actorId] : 'system', target: e.target, detail: e.detail })) } };
}

export const meFull = (actor: any) => publicMember(actor);
