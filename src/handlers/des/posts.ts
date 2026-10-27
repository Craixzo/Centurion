import { provider } from '../../database';
import { DES_SETTINGS } from './settings';
import { audit, parseRoles, Result } from './auth';

/**
 * Posts: the notice board inside the DES back-end (shift notices, bulletins,
 * policy updates). Members only; never shown on the public site.
 *
 * Who can do what:
 *   any member                 read posts for everyone and for their own department
 *   supervisor, PIO,           post to everyone or to their own department
 *   local admin
 *   service admin              post to any department; sees every post
 *   author                     edit or remove their own post
 *   local admin                edit, remove and pin posts for their own department
 *   service admin              edit, remove and pin any post
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const has = (m: any, ...roles: string[]) => parseRoles(m.roles).some((r) => roles.includes(r));
const deptShort = (d: string | null) => (d && DES_SETTINGS.departments[d]?.short) || null;

const canPost = (m: any) => has(m, 'supervisor', 'pio', 'local-admin', 'service-admin');
const isService = (m: any) => has(m, 'service-admin');

/** Admins who look after this post: service admins, and local admins of its department */
const adminOf = (m: any, post: any) => isService(m) || (has(m, 'local-admin') && post.department === m.department);
const canChange = (m: any, post: any) => post.authorId === m.id || adminOf(m, post);
const canRead = (m: any, post: any) => !post.department || post.department === m.department || isService(m);

const view = (actor: any, p: any) => ({
    id: p.id, title: p.title, body: p.body, department: p.department, departmentShort: deptShort(p.department),
    pinned: p.pinned, authorName: p.authorName, createdAt: p.createdAt, updatedAt: p.updatedAt,
    canChange: canChange(actor, p), canPin: adminOf(actor, p),
});

/** Which departments this member may post to ('' = everyone) */
const targets = (m: any) => [ '', ... (isService(m) ? Object.keys(DES_SETTINGS.departments) : [ m.department ]) ];

export const listPosts = async (actor: any, input: any): Promise<Result> => {
    const rows = await db().desPost.findMany({ where: { removed: false }, orderBy: { createdAt: 'desc' }, take: 300 });
    const visible = rows.filter((p: any) => canRead(actor, p));
    visible.sort((a: any, b: any) => Number(b.pinned) - Number(a.pinned));
    const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 100);
    return { ok: true, data: {
        posts: visible.slice(0, limit).map((p: any) => view(actor, p)),
        canPost: canPost(actor),
        targets: canPost(actor) ? targets(actor).map((key) => ({ key, name: key ? DES_SETTINGS.departments[key].name : 'Everyone in DES' })) : [],
    } };
}

const readPost = (actor: any, input: any) => {
    const title = clean(input.title, 120);
    if(title.length < 3) return 'Give the post a title.';
    const body = cleanLong(input.body, 4000);
    if(body.length < 3) return 'Write something in the post.';
    const department = clean(input.department, 20).toUpperCase();
    if(!targets(actor).includes(department)) return 'You can\'t post to that department.';
    return { title, body, department: department || null };
}

export const createPost = async (actor: any, input: any): Promise<Result> => {
    if(!canPost(actor)) return fail('Only supervisors, PIOs and admins can post.');
    const data = readPost(actor, input);
    if(typeof data === 'string') return fail(data);
    const pinned = input.pinned === true && adminOf(actor, data);
    await db().desPost.create({ data: { ... data, pinned, authorId: actor.id, authorName: `${actor.rank} ${actor.robloxUsername}` } });
    return { ok: true, msg: 'Posted.' };
}

export const updatePost = async (actor: any, input: any): Promise<Result> => {
    const p = await db().desPost.findUnique({ where: { id: clean(input.id, 64) } });
    if(!p || p.removed || !canRead(actor, p)) return fail('That post doesn\'t exist.');
    if(!canChange(actor, p)) return fail('You can only edit your own posts.');
    const data = readPost(actor, { department: p.department || '', ... input });
    if(typeof data === 'string') return fail(data);
    if(data.department !== p.department && !(isService(actor) || p.authorId === actor.id)) return fail('You can\'t move this post to another department.');
    await db().desPost.update({ where: { id: p.id }, data });
    return { ok: true, msg: 'Post updated.' };
}

export const removePost = async (actor: any, input: any): Promise<Result> => {
    const p = await db().desPost.findUnique({ where: { id: clean(input.id, 64) } });
    if(!p || p.removed || !canRead(actor, p)) return fail('That post doesn\'t exist.');
    if(!canChange(actor, p)) return fail('You can only remove your own posts.');
    await db().desPost.update({ where: { id: p.id }, data: { removed: true, pinned: false } });
    if(p.authorId !== actor.id) await audit(actor.id, 'Post removed', p.title.slice(0, 60), `by ${p.authorName} · ${actor.badgeId}`);
    return { ok: true, msg: 'Post removed.' };
}

export const pinPost = async (actor: any, input: any): Promise<Result> => {
    const p = await db().desPost.findUnique({ where: { id: clean(input.id, 64) } });
    if(!p || p.removed || !canRead(actor, p)) return fail('That post doesn\'t exist.');
    if(!adminOf(actor, p)) return fail('Only admins can pin posts.');
    const pinned = input.pinned === true;
    await db().desPost.update({ where: { id: p.id }, data: { pinned, updatedAt: p.updatedAt } });
    return { ok: true, msg: pinned ? 'Pinned.' : 'Unpinned.' };
}
