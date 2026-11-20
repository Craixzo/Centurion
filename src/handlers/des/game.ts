import { provider } from '../../database';
import { refreshWanted, nextWarrantNumber, listWarrants } from './records';
import { board, getIncident, createIncident, closeIncident, addNote, goOnDuty, goOffDuty, setUnitStatus, assignUnit, clearUnit } from './cad';
import { audit } from './auth';

/**
 * The game's side of DES. Called by the game servers (the CenturionDES module in
 * Roblox) with the same API key the website uses; all routes sit after the API
 * key check in api.ts.
 *
 *   records    every arrest, citation, conviction and acquittal made in-game is
 *              added to the person's Criminal Database record (charges are the
 *              Imperial Penal Code, e.g. "R-5 Bank robbery")
 *   warrants   in-game warrants appear here; warrants issued on the website are
 *              picked up by the game (feed); serving or recalling on either side
 *              closes it on the other
 *   mdt        the in-game MDT: an officer in-game works the CAD as their DES
 *              member account (matched by Roblox username), with the same
 *              permissions as on the website
 *
 * Records and warrants made in-game use officerId / issuedBy "game:<robloxUserId>".
 */

const db = () => (provider as any).db;
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const robloxId = (value: unknown) => { const t = String(value ?? ''); return /^\d{1,20}$/.test(t) ? t : null; };
const username = (value: unknown) => { const t = clean(value, 20); return /^[A-Za-z0-9_]{3,20}$/.test(t) ? t : null; };
const chargeList = (value: unknown) => (Array.isArray(value) ? value : []).map((c) => clean(c, 80)).filter(Boolean).slice(0, 25);
const parseList = (raw: unknown): string[] => { try { const a = JSON.parse(String(raw || '[]')); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };

const GAME_KINDS = [ 'ARREST', 'CITATION', 'CONVICTION', 'ACQUITTAL', 'NOTE' ];

/** The person's Criminal Database entry, created the first time the game reports something about them. */
const subjectFor = async (id: string, name: string) => {
    const existing = await db().desSubject.findUnique({ where: { robloxUserId: id } });
    if(existing) {
        const data: any = { updatedAt: new Date() };
        if(existing.removed) data.removed = false;
        if(name && existing.robloxUsername !== name) data.robloxUsername = name;
        return db().desSubject.update({ where: { id: existing.id }, data });
    }
    return db().desSubject.create({ data: { robloxUserId: id, robloxUsername: name || id, createdBy: 'game' } });
};

/** Which DES member an in-game player is (by Roblox username), if they're active personnel. */
const memberCache = new Map<string, { at: number; member: any }>();
const memberFor = async (name: string) => {
    const key = name.toLowerCase();
    const hit = memberCache.get(key);
    if(hit && Date.now() - hit.at < 60_000) return hit.member;
    const all = await db().desMember.findMany({ where: { status: 'ACTIVE' } });
    const member = all.find((m: any) => String(m.robloxUsername).toLowerCase() === key) || null;
    memberCache.set(key, { at: Date.now(), member });
    return member;
};

/** Actions the in-game MDT may run, as the officer's own DES account. */
const MDT: Record<string, (actor: any, body: any) => Promise<any>> = {
    'cad': board,
    'cad-incident': getIncident,
    'cad-create': createIncident,
    'cad-close': closeIncident,
    'cad-note': addNote,
    'cad-duty-on': goOnDuty,
    'cad-duty-off': goOffDuty,
    'cad-status': setUnitStatus,
    'cad-assign': assignUnit,
    'cad-clear': clearUnit,
    'warrants': listWarrants,
};

export const registerDesGameRoutes = (app: any) => {
    const wrap = (where: string, run: (req: any) => Promise<any>) => async (req: any, res: any) => {
        try {
            const result = await run(req);
            if(result && result.ok === false) return res.json({ success: false, msg: result.msg });
            return res.json({ success: true, ... (result || {}) });
        } catch (err) {
            console.error(`[api] ${where}`, err);
            return res.status(500).json({ success: false, msg: 'Something went wrong in Centurion.' });
        }
    };

    // ------------------------------------------------------------------ records

    /** Add an in-game record. `ref` (the game's case number, e.g. YC-26-00012) lets the game remove it later. */
    app.post('/des/game/record', wrap('/des/game/record', async (req) => {
        const b = req.body || {};
        const id = robloxId(b.robloxId);
        if(!id) return { ok: false, msg: 'Bad Roblox ID.' };
        const kind = clean(b.kind, 20).toUpperCase();
        if(!GAME_KINDS.includes(kind)) return { ok: false, msg: 'Bad record kind.' };
        const ref = clean(b.ref, 24);
        const summary = cleanLong(b.summary, 1800);
        const subject = await subjectFor(id, username(b.username) || '');
        await db().desRecord.create({ data: {
            subjectId: subject.id, kind,
            charges: JSON.stringify(chargeList(b.charges)),
            summary: (ref ? `[${ref}] ` : '') + (summary || '(no details)'),
            location: clean(b.location, 120) || null,
            officerId: `game:${robloxId(b.officerId) || '0'}`,
            officerName: `${clean(b.officerName, 60) || 'Imperial Court'} (in-game)`,
        } });
        return {};
    }));

    /** Hide the records for a game case (expunged, or overturned on appeal). Kept, like any removal. */
    app.post('/des/game/record-remove', wrap('/des/game/record-remove', async (req) => {
        const b = req.body || {};
        const id = robloxId(b.robloxId);
        const ref = clean(b.ref, 24);
        if(!id || !ref) return { ok: false, msg: 'Bad request.' };
        const subject = await db().desSubject.findUnique({ where: { robloxUserId: id } });
        if(!subject) return { removed: 0 };
        const rows = await db().desRecord.findMany({ where: { subjectId: subject.id, removed: false } });
        const mine = rows.filter((r: any) => ref === 'ALL' ? String(r.officerId).startsWith('game:') : String(r.summary).startsWith(`[${ref}]`));
        for(const r of mine) {
            await db().desRecord.update({ where: { id: r.id }, data: { removed: true, removedBy: 'game', removedReason: clean(b.reason, 200) || 'Removed in-game' } });
        }
        if(mine.length) await audit(null, 'Record removed (in-game)', subject.robloxUsername, `${ref} · ${clean(b.reason, 200)}`);
        return { removed: mine.length };
    }));

    // ------------------------------------------------------------------ warrants

    /** A warrant issued in-game by a judge. Returns its DES id and number. */
    app.post('/des/game/warrant', wrap('/des/game/warrant', async (req) => {
        const b = req.body || {};
        const id = robloxId(b.robloxId);
        if(!id) return { ok: false, msg: 'Bad Roblox ID.' };
        const charges = chargeList(b.charges);
        if(!charges.length) return { ok: false, msg: 'No charges.' };
        const danger = [ 'LOW', 'MEDIUM', 'HIGH' ].includes(String(b.danger)) ? String(b.danger) : 'MEDIUM';
        const subject = await subjectFor(id, username(b.username) || '');
        const number = await nextWarrantNumber();
        const w = await db().desWarrant.create({ data: {
            number, subjectId: subject.id, charges: JSON.stringify(charges),
            summary: cleanLong(b.summary, 1000) || charges.join(', '), danger,
            onWantedList: b.onWantedList === true,
            issuedBy: `game:${robloxId(b.judgeId) || '0'}`,
            issuedByName: `${clean(b.judgeName, 60) || 'Imperial Court'} (in-game)`,
        } });
        refreshWanted();
        await audit(null, 'Warrant issued (in-game)', subject.robloxUsername, number);
        return { id: w.id, number };
    }));

    /** Served (arrested) or recalled in-game. */
    app.post('/des/game/warrant-close', wrap('/des/game/warrant-close', async (req) => {
        const b = req.body || {};
        const w = await db().desWarrant.findUnique({ where: { id: clean(b.id, 64) }, include: { subject: true } });
        if(!w) return { ok: false, msg: 'No such warrant.' };
        if(w.status !== 'ACTIVE') return { already: true };
        const served = b.served === true;
        await db().desWarrant.update({ where: { id: w.id }, data: {
            status: served ? 'SERVED' : 'RECALLED', onWantedList: false,
            closedBy: 'game', closedAt: new Date(), closedNote: clean(b.note, 200) || (served ? 'Served in-game' : 'Recalled in-game'),
        } });
        refreshWanted();
        await audit(null, served ? 'Warrant served (in-game)' : 'Warrant recalled (in-game)', w.subject.robloxUsername, w.number);
        return {};
    }));

    /**
     * Warrants issued or closed since `since` (ms). since=0 gives every active
     * warrant plus anything closed in the last 7 days. The game polls this.
     */
    app.get('/des/game/warrants', wrap('/des/game/warrants', async (req) => {
        const now = Date.now();
        const since = Math.max(0, Math.floor(Number(req.query.since) || 0));
        const after = new Date(since ? since - 5_000 : now - 7 * 86400_000);  // small overlap so nothing slips between polls
        const rows = await db().desWarrant.findMany({
            where: since
                ? { OR: [ { issuedAt: { gt: after } }, { closedAt: { gt: after } } ] }
                : { OR: [ { status: 'ACTIVE' }, { closedAt: { gt: after } } ] },
            include: { subject: true },
            orderBy: { issuedAt: 'asc' },
            take: 500,
        });
        return {
            now,
            warrants: rows.filter((w: any) => !w.subject.removed || w.status !== 'ACTIVE').map((w: any) => ({
                id: w.id, number: w.number, status: w.status,
                robloxId: w.subject.robloxUserId, username: w.subject.robloxUsername,
                charges: parseList(w.charges), summary: w.summary, danger: w.danger,
                issuedByName: w.issuedByName, fromGame: String(w.issuedBy).startsWith('game:'),
            })),
        };
    }));

    // ------------------------------------------------------------------ CAD for the game

    /** New calls since `since` (ms), so the game can alert officers in-game. */
    app.get('/des/game/calls', wrap('/des/game/calls', async (req) => {
        const now = Date.now();
        const since = Math.max(0, Math.floor(Number(req.query.since) || 0)) || now - 60_000;
        const rows = await db().desIncident.findMany({
            where: { createdAt: { gt: new Date(since - 5_000) }, status: { in: [ 'PENDING', 'ACTIVE' ] } },
            orderBy: { createdAt: 'asc' }, take: 50,
        });
        return { now, calls: rows.map((i: any) => ({ id: i.id, number: i.number, priority: i.priority, type: i.type, location: i.location })) };
    }));

    /** The in-game MDT. The game passes the player's Roblox ID and username; the player never talks to Centurion directly. */
    app.post('/des/game/mdt', wrap('/des/game/mdt', async (req) => {
        const b = req.body || {};
        const name = username(b.username);
        if(!robloxId(b.robloxId) || !name) return { ok: false, msg: 'Bad request.' };
        const member = await memberFor(name);
        if(!member) return { ok: false, notMember: true, msg: 'You aren\'t on the DES personnel roster, so you can\'t use dispatch. Ask a DES admin to add you.' };
        const action = clean(b.action, 24);
        if(action === 'whoami') {
            return { member: { rank: member.rank, username: member.robloxUsername, badgeId: member.badgeId, department: member.department } };
        }
        const run = MDT[action];
        if(!run) return { ok: false, msg: 'Unknown action.' };
        const result = await run(member, (b.body && typeof b.body === 'object') ? b.body : {});
        if(result.ok === false) return result;
        return { msg: result.msg, ... (result.data || {}) };
    }));
};
