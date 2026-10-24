import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { provider } from '../../database';
import { discordClient } from '../../main';
import { NEWS_SETTINGS } from '../news/settings';
import { DES_SETTINGS } from './settings';
import { audit, parseRoles, Result } from './auth';
import { SUBJECT_FLAGS } from './records';

/**
 * OIA (Office of Internal Affairs) complaints and OFI (Office of Fire
 * Investigations) investigations. Both are "cases" with a number, a status,
 * an investigator, an internal log and an outcome.
 *
 *   OFFICER     complaint about a DES member              OIA-YYYY-####
 *   DEPARTMENT  complaint about a department as a whole   OIA-YYYY-####
 *   FIRE        fire report / fire investigation          OFI-YYYY-####
 *
 * Status: NEW (received, not picked up) -> OPEN (being investigated) -> CLOSED
 * (with a finding, or for fires a cause), or DISMISSED (with a reason).
 *
 * Who can see and work cases:
 *   OIA cases    OIA and Service Admins
 *   OFI cases    OFI and Service Admins
 *   nobody       sees a complaint about themselves, or is assigned to one
 *
 * The public (logged in with Discord) can file complaints and fire reports,
 * and see the status of their own. They never see internal notes, who's
 * investigating, or anyone else's cases.
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const parseList = (raw: unknown): string[] => { try { const a = JSON.parse(String(raw || '[]')); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const has = (m: any, ...roles: string[]) => parseRoles(m.roles).some((r) => roles.includes(r));
const deptName = (d: string | null) => (d && DES_SETTINGS.departments[d]?.name) || d || '';
const deptShort = (d: string | null) => (d && DES_SETTINGS.departments[d]?.short) || d || '';

export const CASE_KINDS: Record<string, string> = { OFFICER: 'Officer complaint', DEPARTMENT: 'Department complaint', FIRE: 'Fire investigation' };
export const CASE_STATUS: Record<string, string> = { NEW: 'Received', OPEN: 'Under investigation', CLOSED: 'Closed', DISMISSED: 'Dismissed' };
const FIRE_STATUS: Record<string, string> = { NEW: 'Reported', OPEN: 'Active investigation', CLOSED: 'Closed', DISMISSED: 'Dismissed' };

/** Outcomes. For fires, the "finding" is the cause. */
export const FINDINGS: Record<string, Record<string, string>> = {
    OFFICER: { SUSTAINED: 'Sustained', NOT_SUSTAINED: 'Not sustained', EXONERATED: 'Exonerated', UNFOUNDED: 'Unfounded', WITHDRAWN: 'Withdrawn' },
    DEPARTMENT: { RESOLVED: 'Resolved', POLICY_CHANGED: 'Policy changed', NO_ACTION: 'No action needed', WITHDRAWN: 'Withdrawn' },
    FIRE: { ACCIDENTAL: 'Accidental', NATURAL: 'Natural', INCENDIARY: 'Incendiary (arson)', UNDETERMINED: 'Undetermined' },
};

/** Which roles work which kind of case */
const office = (kind: string) => kind === 'FIRE' ? 'ofi' : 'oia';
const canWork = (m: any, kind: string) => has(m, office(kind), 'service-admin');
const statusName = (c: any) => (c.kind === 'FIRE' ? FIRE_STATUS : CASE_STATUS)[c.status] || c.status;
const findingName = (c: any) => c.finding ? (FINDINGS[c.kind]?.[c.finding] || c.finding) : null;
const who = (m: any) => `${m.rank} ${m.robloxUsername}`;

const log = (caseId: string, kind: string, text: string, actorName: string) =>
    db().desCaseLog.create({ data: { caseId, kind, text: text.slice(0, 2000), actorName } });

const nextNumber = async (kind: string): Promise<string> => {
    const prefix = `${kind === 'FIRE' ? 'OFI' : 'OIA'}-${new Date().getFullYear()}-`;
    const latest = await db().desCase.findMany({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, take: 1 });
    const n = latest.length ? Number(String(latest[0].number).slice(prefix.length)) + 1 : 1;
    return prefix + String(n).padStart(4, '0');
}

/** Evidence links: http(s) only, up to 6 */
const evidenceFrom = (input: unknown): string[] | string => {
    const list = (Array.isArray(input) ? input : String(input || '').split(/[\n\s,]+/)).map((x) => String(x).trim()).filter(Boolean);
    if(list.length > 6) return 'Add up to 6 evidence links.';
    for(const link of list) {
        if(link.length > 300 || !/^https?:\/\/[^\s<>"']+$/i.test(link)) return 'Evidence must be links starting with https:// (like a Medal, YouTube or Gyazo link).';
    }
    return list;
}

/** Finds the DES member a complaint is about from "KingMS", "2318", "Sgt KingMS #2318"... */
const matchMember = async (text: string) => {
    if(!text) return null;
    for(const badge of text.match(/\d{2,8}/g) || []) {
        const m = await db().desMember.findUnique({ where: { badgeId: badge } });
        if(m) return m;
    }
    const words = text.toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length >= 3);
    if(!words.length) return null;
    const members = await db().desMember.findMany({ where: { status: 'ACTIVE' } });
    return members.find((m: any) => words.includes(String(m.robloxUsername).toLowerCase())) || null;
}

/** Posts "new case" in the OIA or OFI channel: number and type only, never the details */
const notify = async (c: any) => {
    const id = c.kind === 'FIRE' ? DES_SETTINGS.ofiChannelId : DES_SETTINGS.oiaChannelId;
    if(!id) return;
    try {
        const channel: any = await discordClient.channels.fetch(id);
        if(!channel || !channel.isTextBased() || typeof channel.send !== 'function') return;
        const embed = new EmbedBuilder()
            .setColor(c.kind === 'FIRE' ? 0xe8a33d : 0x3f95ce)
            .setTitle(`New ${CASE_KINDS[c.kind].toLowerCase()}: ${c.number}`)
            .setDescription(c.kind === 'DEPARTMENT' ? `About: ${deptName(c.department)}` : c.kind === 'FIRE' ? 'A fire has been reported.' : 'A complaint about an officer has been filed.')
            .setTimestamp(new Date());
        const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open in the back-end').setURL(`${NEWS_SETTINGS.siteUrl}/des/case.html?id=${encodeURIComponent(c.id)}`),
        );
        await channel.send({ embeds: [ embed ], components: [ button ] });
    } catch (err) {
        console.error(`[des] couldn't post new case ${c.number} in channel ${id}`, err);
    }
}

/** Shared checks and clean-up for a new case, public or internal */
const readNewCase = async (input: any) => {
    const kind = clean(input.kind, 12).toUpperCase();
    if(!CASE_KINDS[kind]) return 'Pick what you\'re reporting.';
    const title = clean(input.title, 120);
    if(title.length < 5) return 'Give it a short title (at least 5 characters).';
    const description = cleanLong(input.description, 4000);
    if(description.length < 20) return 'Describe what happened (at least 20 characters).';
    const evidence = evidenceFrom(input.evidence);
    if(typeof evidence === 'string') return evidence;
    const location = clean(input.location, 120) || null;
    const occurredAt = clean(input.occurredAt, 60) || null;

    let department: string | null = null, accusedText: string | null = null, accused: any = null;
    if(kind === 'FIRE') {
        if(!location) return 'Say where the fire was.';
        department = 'FIRE';
    } else if(kind === 'DEPARTMENT') {
        department = clean(input.department, 20).toUpperCase();
        if(!DES_SETTINGS.departments[department]) return 'Pick the department.';
    } else {
        accusedText = clean(input.accused, 120);
        if(accusedText.length < 2) return 'Say which officer: their name, badge number, or what they looked like.';
        accused = await matchMember(accusedText);
        department = accused?.department || (DES_SETTINGS.departments[clean(input.department, 20).toUpperCase()] ? clean(input.department, 20).toUpperCase() : null);
    }
    return { kind, title, description, evidence: JSON.stringify(evidence), location, occurredAt, department, accusedText,
        accusedMemberId: accused?.id || null, accusedName: accused ? `${accused.rank} ${accused.robloxUsername} (#${accused.badgeId})` : null };
}

// ---------------------------------------------------------------- public

/** A complaint or fire report from the public form (Discord login checked by the website). */
export const submitPublic = async (discordId: string, input: any): Promise<Result> => {
    const name = clean(input.discordName, 60) || 'Discord user';
    const since = new Date(Date.now() - 86400_000);
    const today = await db().desCase.count({ where: { submitterDiscordId: discordId, createdAt: { gte: since } } });
    if(today >= DES_SETTINGS.maxReportsPerDay) return fail('You\'ve sent the most reports allowed in a day. Please try again tomorrow.');
    const open = await db().desCase.count({ where: { submitterDiscordId: discordId, status: { in: [ 'NEW', 'OPEN' ] } } });
    if(open >= DES_SETTINGS.maxOpenReports) return fail('You already have several reports being looked at. Please wait for those first.');

    const data = await readNewCase(input);
    if(typeof data === 'string') return fail(data);
    const number = await nextNumber(data.kind);
    const c = await db().desCase.create({ data: { ... data, number, status: 'NEW', submitterDiscordId: discordId, submitterName: name, internal: false } });
    await log(c.id, 'SYSTEM', `Filed through the public form by ${name} (Discord ${discordId}).${data.accusedName ? ` Matched to ${data.accusedName}.` : ''}`, 'Website');
    void notify(c);
    return { ok: true, msg: `Thank you. Your reference number is ${number}.`, data: { number } };
}

/** The status of everything this Discord account has filed. Outcomes only, never internal notes. */
export const myPublic = async (discordId: string): Promise<Result> => {
    const rows = await db().desCase.findMany({ where: { submitterDiscordId: discordId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { ok: true, data: {
        reports: rows.map((c: any) => {
            const done = c.status === 'CLOSED' || c.status === 'DISMISSED';
            return {
                number: c.number, kind: c.kind, kindName: CASE_KINDS[c.kind], title: c.title,
                department: deptShort(c.department), status: c.status, statusName: statusName(c),
                createdAt: c.createdAt, closedAt: done ? c.closedAt : null,
                outcome: done && c.status === 'CLOSED' ? findingName(c) : null,
                publicNote: done ? c.publicNote : null,
            };
        }),
        departments: Object.entries(DES_SETTINGS.departments).map(([ key, v ]) => ({ key, name: v.name, short: v.short })),
    } };
}

// ---------------------------------------------------------------- back-end

const rowView = (c: any) => ({
    id: c.id, number: c.number, kind: c.kind, kindName: CASE_KINDS[c.kind], title: c.title,
    status: c.status, statusName: statusName(c), department: deptShort(c.department),
    accusedName: c.accusedName || (c.accusedText ? `“${c.accusedText}” (not matched)` : null),
    location: c.location, assignedName: c.assignedName, finding: c.finding, findingName: findingName(c),
    internal: c.internal, createdAt: c.createdAt, updatedAt: c.updatedAt, closedAt: c.closedAt,
});

/** A case this member may open, or a reason they can't. Hides complaints about themselves. */
const openable = async (actor: any, id: unknown) => {
    const c = await db().desCase.findUnique({ where: { id: clean(id, 64) } });
    if(!c || !canWork(actor, c.kind) || c.accusedMemberId === actor.id) return null;
    return c;
}

export const listCases = async (actor: any, input: any): Promise<Result> => {
    const kind = clean(input.kind, 12).toUpperCase();
    if(!CASE_KINDS[kind]) return fail('Unknown case type.');
    if(!canWork(actor, kind)) return fail(kind === 'FIRE' ? 'Only OFI can see fire investigations.' : 'Only OIA can see complaints.');
    const scope = clean(input.scope, 10).toLowerCase();
    const status = scope === 'new' ? [ 'NEW' ] : scope === 'active' ? [ 'OPEN' ] : scope === 'open' ? [ 'NEW', 'OPEN' ] : scope === 'closed' ? [ 'CLOSED', 'DISMISSED' ] : [ 'NEW', 'OPEN', 'CLOSED', 'DISMISSED' ];
    let rows = await db().desCase.findMany({ where: { kind, status: { in: status } }, orderBy: { createdAt: 'desc' }, take: 500 });
    rows = rows.filter((c: any) => c.accusedMemberId !== actor.id);
    const q = clean(input.q, 60).toLowerCase();
    if(q) rows = rows.filter((c: any) => [ c.number, c.title, c.location, c.accusedName, c.accusedText, c.submitterName, c.assignedName ].join(' ').toLowerCase().includes(q));
    const finding = clean(input.finding, 20).toUpperCase();
    if(finding) rows = rows.filter((c: any) => c.finding === finding);
    return { ok: true, data: {
        cases: rows.slice(0, 300).map(rowView),
        findings: Object.entries(FINDINGS[kind]).map(([ key, name ]) => ({ key, name })),
        departments: Object.entries(DES_SETTINGS.departments).map(([ key, v ]) => ({ key, name: v.name, short: v.short })),
    } };
}

export const getCase = async (actor: any, input: any): Promise<Result> => {
    const c = await openable(actor, input.id);
    if(!c) return fail('That case doesn\'t exist, or you can\'t open it.');
    const logRows = await db().desCaseLog.findMany({ where: { caseId: c.id }, orderBy: { createdAt: 'asc' } });

    // Who could be assigned: active members with the right office, never the accused
    const members = await db().desMember.findMany({ where: { status: 'ACTIVE' } });
    const investigators = members.filter((m: any) => canWork(m, c.kind) && m.id !== c.accusedMemberId)
        .map((m: any) => ({ id: m.id, name: `${who(m)} (#${m.badgeId})` }));

    // The officer it's about, and their other complaints
    let accused = null, history: any[] = [];
    if(c.accusedMemberId) {
        const m = members.find((x: any) => x.id === c.accusedMemberId) || await db().desMember.findUnique({ where: { id: c.accusedMemberId } });
        if(m) accused = { id: m.id, name: who(m), badgeId: m.badgeId, department: deptShort(m.department), status: m.status };
        const others = await db().desCase.findMany({ where: { accusedMemberId: c.accusedMemberId }, orderBy: { createdAt: 'desc' } });
        history = others.filter((o: any) => o.id !== c.id).map(rowView);
    }

    // Linked Criminal Database records
    const ids = parseList(c.subjects);
    const subjects = ids.length ? (await db().desSubject.findMany({ where: { id: { in: ids } }, include: { warrants: true } }))
        .filter((s: any) => !s.removed)
        .map((s: any) => ({ id: s.id, username: s.robloxUsername, characterName: s.characterName,
            flags: parseList(s.flags).map((f) => SUBJECT_FLAGS[f] || f),
            activeWarrants: (s.warrants || []).filter((w: any) => w.status === 'ACTIVE').length })) : [];

    return { ok: true, data: {
        case: {
            ... rowView(c), description: c.description, occurredAt: c.occurredAt, departmentName: deptName(c.department), departmentKey: c.department,
            evidence: parseList(c.evidence), accusedText: c.accusedText, accused, linkedCall: c.linkedCall,
            submitterName: c.submitterName, submitterDiscordId: c.submitterDiscordId, assignedTo: c.assignedTo, publicNote: c.publicNote,
            subjects, history,
            log: logRows.map((l: any) => ({ id: l.id, kind: l.kind, text: l.text, actorName: l.actorName, createdAt: l.createdAt })),
        },
        investigators,
        findings: Object.entries(FINDINGS[c.kind]).map(([ key, name ]) => ({ key, name })),
        departments: Object.entries(DES_SETTINGS.departments).map(([ key, v ]) => ({ key, name: v.name, short: v.short })),
        me: actor.id,
    } };
}

/** OIA / OFI opening a case themselves (an internal complaint, or a fire they found) */
export const createCase = async (actor: any, input: any): Promise<Result> => {
    const kind = clean(input.kind, 12).toUpperCase();
    if(!CASE_KINDS[kind] || !canWork(actor, kind)) return fail(kind === 'FIRE' ? 'Only OFI can open fire investigations.' : 'Only OIA can open complaints.');
    const data = await readNewCase(input);
    if(typeof data === 'string') return fail(data);
    if(data.accusedMemberId === actor.id) return fail('You can\'t open a complaint about yourself.');
    const number = await nextNumber(kind);
    const c = await db().desCase.create({ data: { ... data, number, status: 'OPEN', internal: true, submitterName: who(actor),
        assignedTo: actor.id, assignedName: who(actor), linkedCall: clean(input.linkedCall, 20) || null } });
    await log(c.id, 'SYSTEM', `Opened internally and assigned to ${who(actor)}.${data.accusedName ? ` About ${data.accusedName}.` : ''}`, who(actor));
    await audit(actor.id, `${kind === 'FIRE' ? 'OFI' : 'OIA'} case opened`, number, actor.badgeId);
    return { ok: true, msg: `${number} opened.`, data: { id: c.id } };
}

export const updateCase = async (actor: any, input: any): Promise<Result> => {
    const c = await openable(actor, input.id);
    if(!c) return fail('That case doesn\'t exist, or you can\'t open it.');
    if(c.status === 'CLOSED' || c.status === 'DISMISSED') return fail('Reopen the case to change it.');
    const data: any = {}; const changes: string[] = [];

    if(input.title !== undefined) { const v = clean(input.title, 120); if(v.length < 5) return fail('The title needs at least 5 characters.'); if(v !== c.title) { data.title = v; changes.push('title'); } }
    if(input.location !== undefined) { const v = clean(input.location, 120) || null; if(v !== c.location) { data.location = v; changes.push(`location → ${v || 'none'}`); } }
    if(input.occurredAt !== undefined) { const v = clean(input.occurredAt, 60) || null; if(v !== c.occurredAt) { data.occurredAt = v; changes.push(`when → ${v || 'unknown'}`); } }
    if(input.linkedCall !== undefined) { const v = clean(input.linkedCall, 20).toUpperCase() || null; if(v !== c.linkedCall) { data.linkedCall = v; changes.push(`CAD call → ${v || 'none'}`); } }
    if(input.department !== undefined && c.kind !== 'FIRE') {
        const v = clean(input.department, 20).toUpperCase() || null;
        if(v && !DES_SETTINGS.departments[v]) return fail('Pick a department.');
        if(v !== c.department) { data.department = v; changes.push(`department → ${deptShort(v) || 'none'}`); }
    }
    if(input.accused !== undefined && c.kind === 'OFFICER') {
        const badge = clean(input.accused, 20);
        if(!badge) { if(c.accusedMemberId) { data.accusedMemberId = null; data.accusedName = null; changes.push('officer unlinked'); } }
        else {
            const m = await db().desMember.findUnique({ where: { badgeId: badge } });
            if(!m) return fail('No member has that badge number.');
            if(m.id === actor.id) return fail('You can\'t link a complaint to yourself. Ask another investigator.');
            if(m.id === c.assignedTo) return fail('That member is assigned to this case. Reassign it first.');
            if(m.id !== c.accusedMemberId) {
                data.accusedMemberId = m.id; data.accusedName = `${who(m)} (#${m.badgeId})`; data.department = m.department;
                changes.push(`officer → ${data.accusedName}`);
            }
        }
    }
    if(!changes.length) return { ok: true, msg: 'Nothing changed.' };
    await db().desCase.update({ where: { id: c.id }, data });
    await log(c.id, 'SYSTEM', `Changed: ${changes.join(', ')}.`, who(actor));
    return { ok: true, msg: 'Case updated.' };
}

export const assignCase = async (actor: any, input: any): Promise<Result> => {
    const c = await openable(actor, input.id);
    if(!c) return fail('That case doesn\'t exist, or you can\'t open it.');
    if(c.status === 'CLOSED' || c.status === 'DISMISSED') return fail('Reopen the case to reassign it.');
    const memberId = clean(input.memberId, 64);
    if(!memberId) {
        if(!c.assignedTo) return { ok: true, msg: 'Nobody was assigned.' };
        await db().desCase.update({ where: { id: c.id }, data: { assignedTo: null, assignedName: null } });
        await log(c.id, 'SYSTEM', `Unassigned ${c.assignedName}.`, who(actor));
        return { ok: true, msg: 'Unassigned.' };
    }
    const m = await db().desMember.findUnique({ where: { id: memberId } });
    if(!m || m.status !== 'ACTIVE' || !canWork(m, c.kind)) return fail(`Only ${c.kind === 'FIRE' ? 'OFI' : 'OIA'} members can be assigned.`);
    if(m.id === c.accusedMemberId) return fail('The member a complaint is about can\'t investigate it.');
    const data: any = { assignedTo: m.id, assignedName: who(m) };
    if(c.status === 'NEW') data.status = 'OPEN';
    await db().desCase.update({ where: { id: c.id }, data });
    await log(c.id, 'SYSTEM', `Assigned to ${who(m)}.${c.status === 'NEW' ? ` Status: ${statusName({ ... c, status: 'OPEN' })}.` : ''}`, who(actor));
    return { ok: true, msg: `Assigned to ${who(m)}.` };
}

export const setCaseStatus = async (actor: any, input: any): Promise<Result> => {
    const c = await openable(actor, input.id);
    if(!c) return fail('That case doesn\'t exist, or you can\'t open it.');
    const status = clean(input.status, 12).toUpperCase();
    const note = cleanLong(input.publicNote, 1000) || null;
    const done = c.status === 'CLOSED' || c.status === 'DISMISSED';
    const tag = c.kind === 'FIRE' ? 'OFI' : 'OIA';

    if(status === 'OPEN') {
        if(c.status === 'OPEN') return { ok: true, msg: 'Already open.' };
        await db().desCase.update({ where: { id: c.id }, data: { status: 'OPEN', closedAt: null, ... (done ? { finding: null, publicNote: null } : {}),
            ... (!c.assignedTo && !done ? { assignedTo: actor.id, assignedName: who(actor) } : {}) } });
        await log(c.id, 'STATUS', done ? 'Case reopened.' : `Investigation started.${!c.assignedTo ? ` Assigned to ${who(actor)}.` : ''}`, who(actor));
        if(done) await audit(actor.id, `${tag} case reopened`, c.number, actor.badgeId);
        return { ok: true, msg: done ? `${c.number} reopened.` : `${c.number} is now under investigation.` };
    }
    if(done) return fail('That case is already finished. Reopen it first.');

    if(status === 'CLOSED') {
        const finding = clean(input.finding, 20).toUpperCase();
        if(!FINDINGS[c.kind][finding]) return fail(c.kind === 'FIRE' ? 'Pick the cause of the fire.' : 'Pick a finding.');
        await db().desCase.update({ where: { id: c.id }, data: { status: 'CLOSED', finding, publicNote: note, closedAt: new Date() } });
        await log(c.id, 'STATUS', `Closed: ${FINDINGS[c.kind][finding]}.${note ? ` Told the reporter: ${note}` : ''}`, who(actor));
        await audit(actor.id, `${tag} case closed`, c.number, `${FINDINGS[c.kind][finding]} · ${actor.badgeId}`);
        return { ok: true, msg: `${c.number} closed: ${FINDINGS[c.kind][finding]}.` };
    }
    if(status === 'DISMISSED') {
        if(!note || note.length < 5) return fail('Give a reason; the person who filed it is told this.');
        await db().desCase.update({ where: { id: c.id }, data: { status: 'DISMISSED', finding: null, publicNote: note, closedAt: new Date() } });
        await log(c.id, 'STATUS', `Dismissed: ${note}`, who(actor));
        await audit(actor.id, `${tag} case dismissed`, c.number, actor.badgeId);
        return { ok: true, msg: `${c.number} dismissed.` };
    }
    return fail('Unknown status.');
}

export const addCaseNote = async (actor: any, input: any): Promise<Result> => {
    const c = await openable(actor, input.id);
    if(!c) return fail('That case doesn\'t exist, or you can\'t open it.');
    const text = cleanLong(input.text, 2000);
    if(!text) return fail('Write a note.');
    await log(c.id, 'NOTE', text, who(actor));
    await db().desCase.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
    return { ok: true, msg: 'Note added.' };
}

export const linkCaseSubject = async (actor: any, input: any): Promise<Result> => {
    const c = await openable(actor, input.id);
    if(!c) return fail('That case doesn\'t exist, or you can\'t open it.');
    const s = await db().desSubject.findUnique({ where: { id: clean(input.subjectId, 64) } });
    if(!s || s.removed) return fail('That record doesn\'t exist.');
    const list = parseList(c.subjects);
    const remove = input.remove === true;
    if(remove ? !list.includes(s.id) : list.includes(s.id)) return { ok: true, msg: remove ? 'Not linked.' : 'Already linked.' };
    const next = remove ? list.filter((x) => x !== s.id) : [ ... list, s.id ].slice(0, 20);
    await db().desCase.update({ where: { id: c.id }, data: { subjects: JSON.stringify(next) } });
    await log(c.id, 'SYSTEM', `${remove ? 'Unlinked' : 'Linked'} record: ${s.robloxUsername}.`, who(actor));
    return { ok: true, msg: remove ? 'Record unlinked.' : 'Record linked.' };
}

/** Counts for the dashboard and menu badges: new and open cases this member can see. */
export const caseCounts = async (actor: any): Promise<Result> => {
    const counts: Record<string, { new: number; open: number }> = {};
    for(const kind of Object.keys(CASE_KINDS)) {
        if(!canWork(actor, kind)) continue;
        const rows = await db().desCase.findMany({ where: { kind, status: { in: [ 'NEW', 'OPEN' ] } } });
        const mine = rows.filter((c: any) => c.accusedMemberId !== actor.id);
        counts[kind] = { new: mine.filter((c: any) => c.status === 'NEW').length, open: mine.filter((c: any) => c.status === 'OPEN').length };
    }
    return { ok: true, data: { counts } };
}
