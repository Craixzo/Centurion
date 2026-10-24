import { provider } from '../../database';
import { DES_SETTINGS } from './settings';
import { audit, parseRoles, Result } from './auth';
import { SUBJECT_FLAGS } from './records';

/**
 * CAD: Computer Aided Dispatch.
 *
 * Incidents (calls for service), the units on duty, and who is on which call.
 * The website polls 'cad' every few seconds, so everyone sees the same board.
 *
 * Who can do what:
 *   any member            see the board and any incident
 *                         go on / off duty under a callsign, change their own unit's status,
 *                         attach themselves to a call or clear from it
 *   a unit on duty        start a call (self-initiated: they're attached to it at once),
 *                         add notes; edit, link subjects to and close calls they're on
 *   dispatcher,           all of the above for every call and every unit: create calls,
 *   supervisor,           assign and clear any unit, change any unit's status,
 *   local/service admin   take a unit off duty, edit, close and reopen any call
 *
 * Incidents are numbered C-YYYY-#####. Every change is written to the call's
 * own log, which is its history; nothing on a call is ever deleted.
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

const has = (m: any, ...roles: string[]) => parseRoles(m.roles).some((r) => roles.includes(r));
const canDispatch = (m: any) => has(m, 'dispatcher', 'supervisor', 'local-admin', 'service-admin');

export const PRIORITIES: Record<number, string> = { 1: 'Emergency', 2: 'Urgent', 3: 'Routine', 4: 'Low' };
export const UNIT_STATUS: Record<string, string> = {
    AVAILABLE: 'Available', ENROUTE: 'En route', ONSCENE: 'On scene', BUSY: 'Busy', OOS: 'Out of service',
};
const OPEN = [ 'PENDING', 'ACTIVE' ];

const parseList = (raw: unknown): string[] => { try { const a = JSON.parse(String(raw || '[]')); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const deptShort = (d: string) => DES_SETTINGS.departments[d]?.short || d;
const allTypes = () => Object.values(DES_SETTINGS.callTypes).flat();

// ---------------------------------------------------------------- helpers

const myUnit = (actor: any) => db().desUnit.findUnique({ where: { memberId: actor.id } });

/** How a member is named in a call log: their callsign if on duty. */
const who = (actor: any, unit: any) => unit ? `${unit.callsign} (${actor.rank} ${actor.robloxUsername})` : `${actor.rank} ${actor.robloxUsername}`;

const log = (incidentId: string, kind: string, text: string, actorName: string) =>
    db().desIncidentLog.create({ data: { incidentId, kind, text: text.slice(0, 1000), actorName } });

/** PENDING with no units, ACTIVE with some. Closed calls stay closed. */
const restatus = async (incidentId: string) => {
    const i = await db().desIncident.findUnique({ where: { id: incidentId } });
    if(!i || i.status === 'CLOSED') return;
    const count = await db().desUnit.count({ where: { incidentId } });
    const status = count ? 'ACTIVE' : 'PENDING';
    if(status !== i.status) await db().desIncident.update({ where: { id: i.id }, data: { status } });
}

const touch = (incidentId: string) => db().desIncident.update({ where: { id: incidentId }, data: { updatedAt: new Date() } });

const nextNumber = async (): Promise<string> => {
    const prefix = `C-${new Date().getFullYear()}-`;
    const latest = await db().desIncident.findMany({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, take: 1 });
    const n = latest.length ? Number(String(latest[0].number).slice(prefix.length)) + 1 : 1;
    return prefix + String(n).padStart(5, '0');
}

/** Is this member working this call (dispatcher, or one of its units)? */
const onCall = (actor: any, unit: any, incident: any) => canDispatch(actor) || (unit && unit.incidentId === incident.id);

/** Takes off duty any unit left untouched for hours, or whose member has left DES. */
const tidyUnits = async () => {
    const units = await db().desUnit.findMany({});
    if(!units.length) return;
    const cutoff = Date.now() - DES_SETTINGS.autoOffDutyHours * 3600_000;
    const members = await db().desMember.findMany({ where: { id: { in: units.map((u: any) => u.memberId) }, status: 'ACTIVE' } });
    const active = new Set(members.map((m: any) => m.id));
    for(const u of units) {
        const stale = new Date(u.updatedAt).getTime() < cutoff;
        if(!stale && active.has(u.memberId)) continue;
        await db().desUnit.delete({ where: { id: u.id } });
        if(u.incidentId) {
            await log(u.incidentId, 'SYSTEM', `${u.callsign} taken off duty automatically.`, 'CAD');
            await restatus(u.incidentId);
        }
    }
}

// ---------------------------------------------------------------- views

const unitView = (u: any) => ({
    id: u.id, callsign: u.callsign, memberId: u.memberId, memberName: u.memberName,
    department: u.department, deptShort: deptShort(u.department),
    status: u.status, statusName: UNIT_STATUS[u.status] || u.status,
    incidentId: u.incidentId, since: u.since,
});

const incidentRow = (i: any, units: any[]) => ({
    id: i.id, number: i.number, priority: i.priority, priorityName: PRIORITIES[i.priority] || '',
    type: i.type, location: i.location, status: i.status, disposition: i.disposition,
    createdAt: i.createdAt, updatedAt: i.updatedAt, closedAt: i.closedAt,
    units: units.filter((u) => u.incidentId === i.id).map((u) => ({ id: u.id, callsign: u.callsign, status: u.status })),
    subjectCount: parseList(i.subjects).length,
});

/** Linked Criminal Database subjects, with what a unit needs to know before contact. */
const subjectsFor = async (ids: string[]) => {
    if(!ids.length) return [];
    const rows = await db().desSubject.findMany({ where: { id: { in: ids } }, include: { warrants: true } });
    return rows.filter((s: any) => !s.removed).map((s: any) => {
        const active = (s.warrants || []).filter((w: any) => w.status === 'ACTIVE');
        const danger = active.some((w: any) => w.danger === 'HIGH') ? 'HIGH' : active.some((w: any) => w.danger === 'MEDIUM') ? 'MEDIUM' : active.length ? 'LOW' : null;
        return {
            id: s.id, username: s.robloxUsername, characterName: s.characterName,
            flags: parseList(s.flags).map((f) => SUBJECT_FLAGS[f] || f), activeWarrants: active.length, danger,
        };
    });
}

// ---------------------------------------------------------------- board

/**
 * Everything the console needs in one call; the website polls this.
 * With an id, the selected call comes back too (as 'incident'), so the
 * website makes one request per refresh, not two.
 */
export const board = async (actor: any, input: any = {}): Promise<Result> => {
    await tidyUnits();
    const unitsRaw = await db().desUnit.findMany({ orderBy: { callsign: 'asc' } });
    const units = unitsRaw.map(unitView);
    const open = await db().desIncident.findMany({ where: { status: { in: OPEN } }, orderBy: [ { priority: 'asc' }, { createdAt: 'asc' } ] });
    const recent = await db().desIncident.findMany({ where: { status: 'CLOSED' }, orderBy: { closedAt: 'desc' }, take: 10 });
    const mine = units.find((u: any) => u.memberId === actor.id) || null;
    return { ok: true, data: {
        incidents: open.map((i: any) => incidentRow(i, units)),
        recent: recent.map((i: any) => incidentRow(i, [])),
        units,
        me: { unit: mine, canDispatch: canDispatch(actor), department: actor.department, defaultCallsign: `${deptShort(actor.department)}-${actor.badgeId}` },
        callTypes: DES_SETTINGS.callTypes,
        departments: Object.fromEntries(Object.entries(DES_SETTINGS.departments).map(([k, v]) => [ k, v.short ])),
        priorities: PRIORITIES, unitStatus: UNIT_STATUS,
        now: new Date(),
        ... (input.id ? await selectedCall(actor, input.id) : {}),
    } };
}

const selectedCall = async (actor: any, id: unknown) => {
    const found = await getIncident(actor, { id });
    return found.ok === false ? { incident: null } : (found as any).data;
}

export const getIncident = async (actor: any, input: any): Promise<Result> => {
    const i = await db().desIncident.findUnique({ where: { id: clean(input.id, 64) } });
    if(!i) return fail('That call doesn\'t exist.');
    const logRows = await db().desIncidentLog.findMany({ where: { incidentId: i.id }, orderBy: { createdAt: 'asc' } });
    const units = (await db().desUnit.findMany({ where: { incidentId: i.id } })).map(unitView);
    const unit = await myUnit(actor);
    return { ok: true, data: { incident: {
        ... incidentRow(i, units), description: i.description, caller: i.caller,
        units, subjects: await subjectsFor(parseList(i.subjects)),
        log: logRows.slice(-300).map((l: any) => ({ id: l.id, kind: l.kind, text: l.text, actorName: l.actorName, createdAt: l.createdAt })),
        canWork: !!onCall(actor, unit, i), canDispatch: canDispatch(actor),
    } } };
}

// ---------------------------------------------------------------- calls

export const createIncident = async (actor: any, input: any): Promise<Result> => {
    const unit = await myUnit(actor);
    const dispatch = canDispatch(actor);
    if(!dispatch && !unit) return fail('Go on duty first to start a call.');
    const type = clean(input.type, 60);
    if(!allTypes().includes(type)) return fail('Pick a call type.');
    const location = clean(input.location, 120);
    if(location.length < 2) return fail('Enter a location.');
    const priority = Number(input.priority);
    if(!PRIORITIES[priority]) return fail('Pick a priority.');
    const description = cleanLong(input.description, 2000) || null;
    const caller = clean(input.caller, 80) || null;
    // A unit starting a call is on it; a dispatcher can choose
    const attach = !!unit && (!dispatch || input.attach === true);

    const number = await nextNumber();
    const i = await db().desIncident.create({ data: { number, priority, type, location, description, caller, createdBy: actor.id, status: 'PENDING' } });
    await log(i.id, 'SYSTEM', `Call created: P${priority} ${type} at ${location}.`, who(actor, unit));
    if(attach) {
        await db().desUnit.update({ where: { id: unit.id }, data: { incidentId: i.id, status: 'ONSCENE', since: new Date() } });
        await log(i.id, 'ASSIGN', `${unit.callsign} self-initiated, on scene.`, who(actor, unit));
        await restatus(i.id);
    }
    return { ok: true, msg: `Call ${number} created.`, data: { id: i.id } };
}

export const updateIncident = async (actor: any, input: any): Promise<Result> => {
    const i = await db().desIncident.findUnique({ where: { id: clean(input.id, 64) } });
    if(!i) return fail('That call doesn\'t exist.');
    const unit = await myUnit(actor);
    if(!onCall(actor, unit, i)) return fail('Only dispatch and units on this call can change it.');
    if(i.status === 'CLOSED') return fail('That call is closed.');

    const data: any = {}; const changes: string[] = [];
    if(input.priority !== undefined) {
        const p = Number(input.priority);
        if(!PRIORITIES[p]) return fail('Pick a priority.');
        if(p !== i.priority) { data.priority = p; changes.push(`priority P${i.priority} → P${p}`); }
    }
    if(input.type !== undefined) {
        const t = clean(input.type, 60);
        if(!allTypes().includes(t)) return fail('Pick a call type.');
        if(t !== i.type) { data.type = t; changes.push(`type → ${t}`); }
    }
    if(input.location !== undefined) {
        const l = clean(input.location, 120);
        if(l.length < 2) return fail('Enter a location.');
        if(l !== i.location) { data.location = l; changes.push(`location → ${l}`); }
    }
    if(input.description !== undefined) {
        const d = cleanLong(input.description, 2000) || null;
        if(d !== i.description) { data.description = d; changes.push('details updated'); }
    }
    if(!changes.length) return { ok: true, msg: 'Nothing changed.' };
    await db().desIncident.update({ where: { id: i.id }, data });
    await log(i.id, 'SYSTEM', `Changed: ${changes.join(', ')}.`, who(actor, unit));
    return { ok: true, msg: 'Call updated.' };
}

export const closeIncident = async (actor: any, input: any): Promise<Result> => {
    const i = await db().desIncident.findUnique({ where: { id: clean(input.id, 64) } });
    if(!i) return fail('That call doesn\'t exist.');
    const unit = await myUnit(actor);
    if(!onCall(actor, unit, i)) return fail('Only dispatch and units on this call can close it.');
    if(i.status === 'CLOSED') return fail('That call is already closed.');
    const disposition = clean(input.disposition, 200);
    if(disposition.length < 2) return fail('Give a disposition (how the call ended).');

    const attached = await db().desUnit.findMany({ where: { incidentId: i.id } });
    for(const u of attached) await db().desUnit.update({ where: { id: u.id }, data: { incidentId: null, status: 'AVAILABLE', since: new Date() } });
    await db().desIncident.update({ where: { id: i.id }, data: { status: 'CLOSED', disposition, closedAt: new Date() } });
    await log(i.id, 'SYSTEM', `Call closed: ${disposition}.${attached.length ? ` Cleared ${attached.map((u: any) => u.callsign).join(', ')}.` : ''}`, who(actor, unit));
    return { ok: true, msg: `Call ${i.number} closed.` };
}

export const reopenIncident = async (actor: any, input: any): Promise<Result> => {
    if(!canDispatch(actor)) return fail('Only dispatch can reopen a call.');
    const i = await db().desIncident.findUnique({ where: { id: clean(input.id, 64) } });
    if(!i || i.status !== 'CLOSED') return fail('That call isn\'t closed.');
    await db().desIncident.update({ where: { id: i.id }, data: { status: 'PENDING', disposition: null, closedAt: null } });
    const unit = await myUnit(actor);
    await log(i.id, 'SYSTEM', 'Call reopened.', who(actor, unit));
    await audit(actor.id, 'CAD call reopened', i.number, actor.badgeId);
    return { ok: true, msg: `Call ${i.number} reopened.` };
}

export const addNote = async (actor: any, input: any): Promise<Result> => {
    const i = await db().desIncident.findUnique({ where: { id: clean(input.id, 64) } });
    if(!i) return fail('That call doesn\'t exist.');
    const unit = await myUnit(actor);
    if(!canDispatch(actor) && !unit) return fail('Go on duty to add notes.');
    const text = cleanLong(input.text, 1000);
    if(!text) return fail('Write a note.');
    await log(i.id, 'NOTE', text, who(actor, unit));
    await touch(i.id);
    return { ok: true, msg: 'Note added.' };
}

export const linkSubject = async (actor: any, input: any): Promise<Result> => {
    const i = await db().desIncident.findUnique({ where: { id: clean(input.id, 64) } });
    if(!i) return fail('That call doesn\'t exist.');
    const unit = await myUnit(actor);
    if(!onCall(actor, unit, i)) return fail('Only dispatch and units on this call can link records.');
    const s = await db().desSubject.findUnique({ where: { id: clean(input.subjectId, 64) } });
    if(!s || s.removed) return fail('That record doesn\'t exist.');
    const list = parseList(i.subjects);
    const remove = input.remove === true;
    if(remove ? !list.includes(s.id) : list.includes(s.id)) return { ok: true, msg: remove ? 'Not linked.' : 'Already linked.' };
    const next = remove ? list.filter((x) => x !== s.id) : [ ... list, s.id ].slice(0, 20);
    await db().desIncident.update({ where: { id: i.id }, data: { subjects: JSON.stringify(next) } });
    await log(i.id, 'SYSTEM', `${remove ? 'Unlinked' : 'Linked'} record: ${s.robloxUsername}.`, who(actor, unit));
    return { ok: true, msg: remove ? 'Record unlinked.' : 'Record linked.' };
}

// ---------------------------------------------------------------- units

/** The unit this request is about: your own, or (for dispatch) any. */
const targetUnit = async (actor: any, unitId: unknown) => {
    const own = await myUnit(actor);
    const id = clean(unitId, 64);
    if(!id || (own && own.id === id)) return { unit: own, own: true };
    if(!canDispatch(actor)) return { unit: null, own: false, denied: true };
    return { unit: await db().desUnit.findUnique({ where: { id } }), own: false };
}

export const goOnDuty = async (actor: any, input: any): Promise<Result> => {
    if(await myUnit(actor)) return fail('You\'re already on duty.');
    const callsign = clean(input.callsign, 16).toUpperCase() || clean(`${deptShort(actor.department)}-${actor.badgeId}`, 16).toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9 -]{0,15}$/.test(callsign)) return fail('Callsigns use letters, numbers, spaces and dashes (up to 16).');
    if(await db().desUnit.findUnique({ where: { callsign } })) return fail(`${callsign} is already on duty. Pick another callsign.`);
    await db().desUnit.create({ data: { callsign, memberId: actor.id, memberName: `${actor.rank} ${actor.robloxUsername}`, department: actor.department, status: 'AVAILABLE' } });
    return { ok: true, msg: `${callsign} on duty.` };
}

export const goOffDuty = async (actor: any, input: any): Promise<Result> => {
    const t = await targetUnit(actor, input.unitId);
    if(t.denied) return fail('Only dispatch can take other units off duty.');
    if(!t.unit) return fail(t.own ? 'You\'re not on duty.' : 'That unit isn\'t on duty.');
    await db().desUnit.delete({ where: { id: t.unit.id } });
    if(t.unit.incidentId) {
        await log(t.unit.incidentId, 'ASSIGN', `${t.unit.callsign} went off duty and cleared.`, who(actor, t.own ? t.unit : await myUnit(actor)));
        await restatus(t.unit.incidentId);
    }
    if(!t.own) await audit(actor.id, 'CAD unit off duty', t.unit.callsign, `${t.unit.memberName} · ${actor.badgeId}`);
    return { ok: true, msg: `${t.unit.callsign} off duty.` };
}

export const setUnitStatus = async (actor: any, input: any): Promise<Result> => {
    const status = clean(input.status, 12).toUpperCase();
    if(!UNIT_STATUS[status]) return fail('Pick a status.');
    const t = await targetUnit(actor, input.unitId);
    if(t.denied) return fail('Only dispatch can change other units.');
    if(!t.unit) return fail(t.own ? 'Go on duty first.' : 'That unit isn\'t on duty.');
    const u = t.unit;
    if((status === 'ENROUTE' || status === 'ONSCENE') && !u.incidentId) return fail('Attach to a call first.');
    if(status === u.status) return { ok: true, msg: 'No change.' };

    // Available or out of service means off the call
    const clears = (status === 'AVAILABLE' || status === 'OOS') && u.incidentId;
    await db().desUnit.update({ where: { id: u.id }, data: { status, since: new Date(), ... (clears ? { incidentId: null } : {}) } });
    if(u.incidentId) {
        const name = who(actor, t.own ? u : await myUnit(actor));
        await log(u.incidentId, clears ? 'ASSIGN' : 'STATUS', clears ? `${u.callsign} cleared (${UNIT_STATUS[status]}).` : `${u.callsign} ${UNIT_STATUS[status].toLowerCase()}.`, name);
        if(clears) await restatus(u.incidentId); else await touch(u.incidentId);
    }
    return { ok: true, msg: `${u.callsign}: ${UNIT_STATUS[status]}.` };
}

export const assignUnit = async (actor: any, input: any): Promise<Result> => {
    const i = await db().desIncident.findUnique({ where: { id: clean(input.id, 64) } });
    if(!i) return fail('That call doesn\'t exist.');
    if(i.status === 'CLOSED') return fail('That call is closed.');
    const t = await targetUnit(actor, input.unitId);
    if(t.denied) return fail('Only dispatch can assign other units.');
    if(!t.unit) return fail(t.own ? 'Go on duty first.' : 'That unit isn\'t on duty.');
    const u = t.unit;
    if(u.incidentId === i.id) return { ok: true, msg: `${u.callsign} is already on this call.` };
    if(u.status === 'OOS' && !t.own) return fail(`${u.callsign} is out of service.`);

    const name = who(actor, t.own ? u : await myUnit(actor));
    const from = u.incidentId;
    await db().desUnit.update({ where: { id: u.id }, data: { incidentId: i.id, status: 'ENROUTE', since: new Date() } });
    if(from) {
        const old = await db().desIncident.findUnique({ where: { id: from } });
        await log(from, 'ASSIGN', `${u.callsign} reassigned to ${i.number}.`, name);
        await restatus(from);
        await log(i.id, 'ASSIGN', `${u.callsign} ${t.own ? 'attached' : 'assigned'}, en route (from ${old?.number || 'another call'}).`, name);
    } else {
        await log(i.id, 'ASSIGN', `${u.callsign} ${t.own ? 'attached' : 'assigned'}, en route.`, name);
    }
    await restatus(i.id);
    return { ok: true, msg: `${u.callsign} on ${i.number}.` };
}

export const clearUnit = async (actor: any, input: any): Promise<Result> => {
    const t = await targetUnit(actor, input.unitId);
    if(t.denied) return fail('Only dispatch can clear other units.');
    if(!t.unit) return fail(t.own ? 'You\'re not on duty.' : 'That unit isn\'t on duty.');
    const u = t.unit;
    if(!u.incidentId) return fail(`${u.callsign} isn't on a call.`);
    await db().desUnit.update({ where: { id: u.id }, data: { incidentId: null, status: 'AVAILABLE', since: new Date() } });
    await log(u.incidentId, 'ASSIGN', `${u.callsign} cleared.`, who(actor, t.own ? u : await myUnit(actor)));
    await restatus(u.incidentId);
    return { ok: true, msg: `${u.callsign} cleared.` };
}
