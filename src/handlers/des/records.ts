import { provider } from '../../database';
import { robloxClient } from '../../main';
import { DES_SETTINGS } from './settings';
import { audit, parseRoles, Result } from './auth';

/**
 * The Criminal Database and the Wanted List.
 *
 * IMPORTANT: these records are IN-GAME roleplay only. A subject is a Roblox
 * account playing a character in Yellonia; the charges are in-game offences
 * under Yellonia's in-game laws. No real-world personal information is stored.
 *
 * Who can do what (checked here, on top of the website's session check):
 *   any member        search subjects, view a subject, view the wanted list
 *   officer+          add a subject, add a record (arrest/citation/warning/note)
 *   supervisor, OIA,  issue and recall warrants, put a warrant on / off the
 *   local/service admin   public Most Wanted list, edit a subject's flags/notes
 *   local/service admin   remove a record or a subject (kept, hidden, audited)
 *   service admin     remove anything in any department
 *
 * The public Most Wanted page (no login) shows ONLY warrants that are ACTIVE
 * and have onWantedList = true, and only in-game information.
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

const has = (m: any, ...roles: string[]) => parseRoles(m.roles).some((r) => roles.includes(r));
const canWarrant = (m: any) => has(m, 'supervisor', 'oia', 'local-admin', 'service-admin');
const canRemove = (m: any) => has(m, 'local-admin', 'service-admin');

const RECORD_KINDS: Record<string, string> = { ARREST: 'Arrest', CITATION: 'Citation', WARNING: 'Warning', NOTE: 'Note' };
const DANGER: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
export const SUBJECT_FLAGS: Record<string, string> = { armed: 'Armed', 'flight-risk': 'Flight risk', violent: 'Violent', gang: 'Gang affiliation' };

/** The public Most Wanted page keeps a 30-second copy; any warrant change clears it so the page updates at once. */
const wantedCache = { at: 0, body: null as any };
const refreshWanted = () => { wantedCache.at = 0; wantedCache.body = null; };

const parseList = (raw: unknown): string[] => { try { const a = JSON.parse(String(raw || '[]')); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const chargesFrom = (input: unknown): string[] => {
    const list = Array.isArray(input) ? input : String(input || '').split(/[\n,]/);
    return list.map((c) => clean(c, 80)).filter(Boolean).slice(0, 25);
};

// ---------------------------------------------------------------- Roblox

const AVATAR_BASE = 'https://thumbnails.roblox.com';
const avatarCache = new Map<string, { url: string | null; at: number }>();

const headshot = async (userId: string): Promise<string | null> => {
    const cached = avatarCache.get(userId);
    if(cached && Date.now() - cached.at < 3600_000) return cached.url;
    try {
        const data: any = await robloxClient.apis.thumbnailsAPI.getUsersAvatarHeadShotImages({ userIds: [ Number(userId) ], size: '150x150', format: 'png', isCircular: false });
        const url = data?.data?.[0]?.imageUrl || null;
        avatarCache.set(userId, { url, at: Date.now() });
        return url;
    } catch { return null; }
};

// ---------------------------------------------------------------- views

const warrantView = (w: any) => ({
    id: w.id, number: w.number, charges: parseList(w.charges), summary: w.summary,
    danger: w.danger, dangerName: DANGER[w.danger] || w.danger, status: w.status,
    onWantedList: w.onWantedList, issuedByName: w.issuedByName, issuedAt: w.issuedAt,
    closedAt: w.closedAt, closedNote: w.closedNote,
});
const recordView = (r: any) => ({
    id: r.id, kind: r.kind, kindName: RECORD_KINDS[r.kind] || r.kind, charges: parseList(r.charges),
    summary: r.summary, location: r.location, officerName: r.officerName, createdAt: r.createdAt,
});
const subjectRow = (s: any, activeWarrants: number) => ({
    id: s.id, robloxUserId: s.robloxUserId, username: s.robloxUsername, characterName: s.characterName,
    flags: parseList(s.flags).map((f) => ({ key: f, name: SUBJECT_FLAGS[f] || f })),
    activeWarrants, createdAt: s.createdAt,
});

// ---------------------------------------------------------------- subjects & search

export const searchSubjects = async (actor: any, input: any): Promise<Result> => {
    const q = clean(input.q, 40).toLowerCase();
    const where: any = { removed: false };
    const all = await db().desSubject.findMany({ where, orderBy: { updatedAt: 'desc' }, include: { warrants: { where: { status: 'ACTIVE' } } }, take: 400 });
    let rows = all;
    if(q) rows = all.filter((s: any) => (s.robloxUsername + ' ' + (s.characterName || '')).toLowerCase().includes(q));
    if(input.wantedOnly === true) rows = rows.filter((s: any) => s.warrants.some((w: any) => w.onWantedList));
    return { ok: true, data: {
        subjects: rows.slice(0, 100).map((s: any) => subjectRow(s, s.warrants.length)),
        canAdd: true, flags: Object.entries(SUBJECT_FLAGS).map(([ key, name ]) => ({ key, name })),
    } };
}

export const getSubject = async (actor: any, input: any): Promise<Result> => {
    const s = await db().desSubject.findUnique({ where: { id: clean(input.id, 64) }, include: {
        records: { orderBy: { createdAt: 'desc' } },
        warrants: { orderBy: { issuedAt: 'desc' } },
    } });
    if(!s || s.removed) return fail('That record doesn\'t exist.');
    const avatar = await headshot(s.robloxUserId);
    return { ok: true, data: {
        subject: {
            id: s.id, robloxUserId: s.robloxUserId, username: s.robloxUsername, characterName: s.characterName,
            avatar, notes: s.notes,
            flags: parseList(s.flags).map((f) => ({ key: f, name: SUBJECT_FLAGS[f] || f })),
            createdAt: s.createdAt,
        },
        records: s.records.filter((r: any) => !r.removed).map(recordView),
        warrants: s.warrants.map(warrantView),
        allFlags: Object.entries(SUBJECT_FLAGS).map(([ key, name ]) => ({ key, name })),
        recordKinds: Object.entries(RECORD_KINDS).map(([ key, name ]) => ({ key, name })),
        dangerLevels: Object.entries(DANGER).map(([ key, name ]) => ({ key, name })),
        can: { record: true, warrant: canWarrant(actor), edit: canWarrant(actor), remove: canRemove(actor) },
    } };
}

export const addSubject = async (actor: any, input: any): Promise<Result> => {
    const username = clean(input.username, 20);
    if(!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail('Enter a valid Roblox username (3–20 letters, numbers or underscores).');

    // The account must really exist on Roblox, which keys the record to one person and blocks typos
    let found;
    try { found = await robloxClient.getUsersByUsernames([ username ]); }
    catch { return fail('Couldn\'t reach Roblox to check that username. Try again in a minute.'); }
    const user = (found || [])[0];
    if(!user) return fail(`No Roblox account named "${username}" exists.`);

    const existing = await db().desSubject.findUnique({ where: { robloxUserId: String(user.id) } });
    if(existing && !existing.removed) return { ok: true, msg: 'That person already has a record.', data: { id: existing.id, existed: true } };

    const flags = JSON.stringify((Array.isArray(input.flags) ? input.flags : []).filter((f: unknown) => typeof f === 'string' && SUBJECT_FLAGS[f as string]).slice(0, 8));
    let subject;
    if(existing) {
        subject = await db().desSubject.update({ where: { id: existing.id }, data: { removed: false, robloxUsername: user.name, characterName: clean(input.characterName, 40) || null, flags, notes: cleanLong(input.notes, 1000) || null } });
    } else {
        subject = await db().desSubject.create({ data: {
            robloxUserId: String(user.id), robloxUsername: user.name, characterName: clean(input.characterName, 40) || null,
            flags, notes: cleanLong(input.notes, 1000) || null, createdBy: actor.id,
        } });
    }
    await audit(actor.id, 'Subject added', user.name, actor.badgeId);
    return { ok: true, msg: `${user.name} added to the Criminal Database.`, data: { id: subject.id } };
}

export const updateSubject = async (actor: any, input: any): Promise<Result> => {
    if(!canWarrant(actor)) return fail('Only supervisors and admins can edit a subject\'s flags and notes.');
    const s = await db().desSubject.findUnique({ where: { id: clean(input.id, 64) } });
    if(!s || s.removed) return fail('That record doesn\'t exist.');
    const flags = JSON.stringify((Array.isArray(input.flags) ? input.flags : []).filter((f: unknown) => typeof f === 'string' && SUBJECT_FLAGS[f as string]).slice(0, 8));
    await db().desSubject.update({ where: { id: s.id }, data: { flags, characterName: clean(input.characterName, 40) || null, notes: cleanLong(input.notes, 1000) || null } });
    await audit(actor.id, 'Subject updated', s.robloxUsername, actor.badgeId);
    return { ok: true, msg: 'Saved.' };
}

export const removeSubject = async (actor: any, input: any): Promise<Result> => {
    if(!canRemove(actor)) return fail('Only admins can remove a record.');
    const s = await db().desSubject.findUnique({ where: { id: clean(input.id, 64) } });
    if(!s || s.removed) return fail('That record doesn\'t exist.');
    const reason = clean(input.reason, 200);
    if(!reason) return fail('Give a reason; it\'s kept in the audit log.');
    await db().desSubject.update({ where: { id: s.id }, data: { removed: true } });
    await db().desWarrant.updateMany({ where: { subjectId: s.id, status: 'ACTIVE' }, data: { status: 'RECALLED', onWantedList: false, closedBy: actor.id, closedAt: new Date(), closedNote: 'Record removed' } });
    refreshWanted();
    await audit(actor.id, 'Subject removed', s.robloxUsername, `${actor.badgeId} · ${reason}`);
    return { ok: true, msg: `${s.robloxUsername}'s record has been removed.` };
}

// ---------------------------------------------------------------- records

export const addRecord = async (actor: any, input: any): Promise<Result> => {
    const s = await db().desSubject.findUnique({ where: { id: clean(input.subjectId, 64) } });
    if(!s || s.removed) return fail('That record doesn\'t exist.');
    const kind = clean(input.kind, 20).toUpperCase();
    if(!RECORD_KINDS[kind]) return fail('Pick a valid entry type.');
    const summary = cleanLong(input.summary, 2000);
    if(summary.length < 3) return fail('Write a short summary of what happened.');
    const charges = JSON.stringify(chargesFrom(input.charges));
    await db().desRecord.create({ data: {
        subjectId: s.id, kind, charges, summary, location: clean(input.location, 120) || null,
        officerId: actor.id, officerName: `${actor.rank} ${actor.robloxUsername}`,
    } });
    await db().desSubject.update({ where: { id: s.id }, data: { updatedAt: new Date() } });
    await audit(actor.id, 'Record added', s.robloxUsername, `${RECORD_KINDS[kind]} · ${actor.badgeId}`);
    return { ok: true, msg: `${RECORD_KINDS[kind]} added to ${s.robloxUsername}'s record.` };
}

export const removeRecord = async (actor: any, input: any): Promise<Result> => {
    if(!canRemove(actor)) return fail('Only admins can remove an entry.');
    const r = await db().desRecord.findUnique({ where: { id: clean(input.id, 64) }, include: { subject: true } });
    if(!r || r.removed) return fail('That entry doesn\'t exist.');
    const reason = clean(input.reason, 200);
    if(!reason) return fail('Give a reason; it\'s kept in the audit log.');
    await db().desRecord.update({ where: { id: r.id }, data: { removed: true, removedBy: actor.id, removedReason: reason } });
    await audit(actor.id, 'Record removed', r.subject.robloxUsername, `${RECORD_KINDS[r.kind] || r.kind} · ${actor.badgeId} · ${reason}`);
    return { ok: true, msg: 'Entry removed.' };
}

// ---------------------------------------------------------------- warrants

const nextWarrantNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `W-${year}-`;
    const latest = await db().desWarrant.findMany({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, take: 1 });
    const n = latest.length ? Number(String(latest[0].number).slice(prefix.length)) + 1 : 1;
    return prefix + String(n).padStart(4, '0');
}

export const issueWarrant = async (actor: any, input: any): Promise<Result> => {
    if(!canWarrant(actor)) return fail('Only supervisors and admins can issue warrants.');
    const s = await db().desSubject.findUnique({ where: { id: clean(input.subjectId, 64) } });
    if(!s || s.removed) return fail('That record doesn\'t exist.');
    const summary = cleanLong(input.summary, 1000);
    if(summary.length < 3) return fail('Write what the warrant is for.');
    const charges = chargesFrom(input.charges);
    if(!charges.length) return fail('Add at least one charge.');
    const danger = clean(input.danger, 10).toUpperCase();
    if(!DANGER[danger]) return fail('Pick a danger level.');

    const number = await nextWarrantNumber();
    await db().desWarrant.create({ data: {
        number, subjectId: s.id, charges: JSON.stringify(charges), summary, danger,
        onWantedList: input.onWantedList === true,
        issuedBy: actor.id, issuedByName: `${actor.rank} ${actor.robloxUsername}`,
    } });
    await db().desSubject.update({ where: { id: s.id }, data: { updatedAt: new Date() } });
    refreshWanted();
    await audit(actor.id, 'Warrant issued', s.robloxUsername, `${number} · ${actor.badgeId}${input.onWantedList === true ? ' · on Most Wanted' : ''}`);
    return { ok: true, msg: `Warrant ${number} issued.` };
}

export const closeWarrant = async (actor: any, input: any): Promise<Result> => {
    if(!canWarrant(actor)) return fail('Only supervisors and admins can close warrants.');
    const w = await db().desWarrant.findUnique({ where: { id: clean(input.id, 64) }, include: { subject: true } });
    if(!w || w.status !== 'ACTIVE') return fail('That warrant isn\'t active.');
    const served = input.served === true;
    await db().desWarrant.update({ where: { id: w.id }, data: { status: served ? 'SERVED' : 'RECALLED', onWantedList: false, closedBy: actor.id, closedAt: new Date(), closedNote: clean(input.note, 200) || null } });
    refreshWanted();
    await audit(actor.id, served ? 'Warrant served' : 'Warrant recalled', w.subject.robloxUsername, `${w.number} · ${actor.badgeId}`);
    return { ok: true, msg: `Warrant ${w.number} ${served ? 'marked served' : 'recalled'}.` };
}

export const setWarrantWanted = async (actor: any, input: any): Promise<Result> => {
    if(!canWarrant(actor)) return fail('Only supervisors and admins can change the Most Wanted list.');
    const w = await db().desWarrant.findUnique({ where: { id: clean(input.id, 64) }, include: { subject: true } });
    if(!w || w.status !== 'ACTIVE') return fail('Only active warrants can be on the Most Wanted list.');
    const on = input.onWantedList === true;
    await db().desWarrant.update({ where: { id: w.id }, data: { onWantedList: on } });
    refreshWanted();
    await audit(actor.id, on ? 'Added to Most Wanted' : 'Removed from Most Wanted', w.subject.robloxUsername, `${w.number} · ${actor.badgeId}`);
    return { ok: true, msg: on ? 'Added to the public Most Wanted page.' : 'Removed from the Most Wanted page.' };
}

/** Every active warrant, for the staff Wanted List page. Any member can see it; supervisors and admins can change it. */
export const listWarrants = async (actor: any, input: any): Promise<Result> => {
    const warrants = await db().desWarrant.findMany({ where: { status: 'ACTIVE' }, orderBy: { issuedAt: 'desc' }, include: { subject: true }, take: 200 });
    const list = await Promise.all(warrants.filter((w: any) => !w.subject.removed).map(async (w: any) => ({
        ... warrantView(w),
        subjectId: w.subject.id,
        username: w.subject.robloxUsername,
        characterName: w.subject.characterName,
        avatar: await headshot(w.subject.robloxUserId),
    })));
    return { ok: true, data: { warrants: list, canManage: canWarrant(actor) } };
}

// ---------------------------------------------------------------- the public Most Wanted page (no login)

export const getWantedList = async () => {
    if(wantedCache.body && Date.now() - wantedCache.at < 30_000) return wantedCache.body;
    const warrants = await db().desWarrant.findMany({
        where: { status: 'ACTIVE', onWantedList: true },
        orderBy: [ { danger: 'desc' }, { issuedAt: 'asc' } ],
        include: { subject: true },
        take: 60,
    });
    const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const list = await Promise.all(warrants
        .filter((w: any) => !w.subject.removed)
        .map(async (w: any) => ({
            number: w.number,
            username: w.subject.robloxUsername,
            characterName: w.subject.characterName,
            avatar: await headshot(w.subject.robloxUserId),
            charges: parseList(w.charges),
            summary: w.summary,
            danger: w.danger,
            dangerName: DANGER[w.danger] || w.danger,
            issuedAt: w.issuedAt,
        })));
    list.sort((a, b) => (order[a.danger] ?? 9) - (order[b.danger] ?? 9));
    const body = { success: true, wanted: list, updatedAt: new Date().toISOString() };
    wantedCache.body = body; wantedCache.at = Date.now();
    return body;
}
