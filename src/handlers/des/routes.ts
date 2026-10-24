import { login, me, setupStatus, setPassword } from './auth';
import { actorFrom, listPersonnel, getMember, addFromWeb, updateMember, removeFromWeb, reinstateMember, unlockMember, signOutMember, listAudit } from './personnel';
import { searchSubjects, getSubject, addSubject, updateSubject, removeSubject, addRecord, removeRecord, issueWarrant, closeWarrant, setWarrantWanted, listWarrants } from './records';
import { board, getIncident, createIncident, updateIncident, closeIncident, reopenIncident, addNote, linkSubject, goOnDuty, goOffDuty, setUnitStatus, assignUnit, clearUnit } from './cad';
import { submitPublic, myPublic, listCases, getCase, createCase, updateCase, assignCase, setCaseStatus, addCaseNote, linkCaseSubject, caseCounts } from './cases';

/**
 * DES routes. All of them sit after the API key check in api.ts, so only the
 * website (which holds the key) can call them. The website passes the member's
 * session or Discord ID; it never comes from the visitor's browser directly.
 */
export const registerDesRoutes = (app: any) => {
    const handle = (where: string, needsDiscord: boolean, run: (body: any) => Promise<any>) => async (req: any, res: any) => {
        try {
            const body = req.body || {};
            if(needsDiscord && !/^\d{15,22}$/.test(String(body.discordId || ''))) return res.status(400).json({ success: false, msg: 'Missing Discord ID.' });
            const result = await run(body);
            if(result.ok === false) return res.json({ success: false, msg: result.msg });
            return res.json({ success: true, msg: result.msg, ... (result.data || {}) });
        } catch (err) {
            console.error(`[api] ${where}`, err);
            return res.status(500).json({ success: false, msg: 'Something went wrong in Centurion. Please try again.' });
        }
    };

    app.post('/des/auth/login', handle('/des/auth/login', false, (b) => login(b)));
    app.post('/des/auth/me', handle('/des/auth/me', false, (b) => me(b)));
    app.post('/des/auth/setup-status', handle('/des/auth/setup-status', true, (b) => setupStatus(String(b.discordId))));
    app.post('/des/auth/set-password', handle('/des/auth/set-password', true, (b) => setPassword(String(b.discordId), b)));

    // Public complaint and fire report forms: the website checks the Discord login and passes the ID
    app.post('/des/public/report', handle('/des/public/report', true, (b) => submitPublic(String(b.discordId), b)));
    app.post('/des/public/mine', handle('/des/public/mine', true, (b) => myPublic(String(b.discordId))));

    // Back-end actions: each checks the member's session first, then what their roles allow
    const ACTIONS: Record<string, (actor: any, body: any) => Promise<any>> = {
        'personnel': listPersonnel,
        'member': getMember,
        'member-add': addFromWeb,
        'member-update': updateMember,
        'member-remove': removeFromWeb,
        'member-reinstate': reinstateMember,
        'member-unlock': unlockMember,
        'member-signout': signOutMember,
        'audit': listAudit,
        'subjects': searchSubjects,
        'subject': getSubject,
        'subject-add': addSubject,
        'subject-update': updateSubject,
        'subject-remove': removeSubject,
        'record-add': addRecord,
        'record-remove': removeRecord,
        'warrant-issue': issueWarrant,
        'warrant-close': closeWarrant,
        'warrant-wanted': setWarrantWanted,
        'warrants': listWarrants,
        'cad': board,
        'cad-incident': getIncident,
        'cad-create': createIncident,
        'cad-update': updateIncident,
        'cad-close': closeIncident,
        'cad-reopen': reopenIncident,
        'cad-note': addNote,
        'cad-link': linkSubject,
        'cad-duty-on': goOnDuty,
        'cad-duty-off': goOffDuty,
        'cad-status': setUnitStatus,
        'cad-assign': assignUnit,
        'cad-clear': clearUnit,
        'cases': listCases,
        'case': getCase,
        'case-create': createCase,
        'case-update': updateCase,
        'case-assign': assignCase,
        'case-status': setCaseStatus,
        'case-note': addCaseNote,
        'case-link': linkCaseSubject,
        'case-counts': caseCounts,
    };
    app.post('/des/manage/:action', async (req: any, res: any) => {
        try {
            const run = ACTIONS[String(req.params.action)];
            if(!run) return res.status(404).json({ success: false, msg: 'Unknown action.' });
            const body = req.body || {};
            const actor = await actorFrom(body.session);
            if(!actor) return res.json({ success: false, signedOut: true, msg: 'Your session has ended. Please log in again.' });
            const result = await run(actor, body);
            if(result.ok === false) return res.json({ success: false, msg: result.msg });
            return res.json({ success: true, msg: result.msg, ... (result.data || {}) });
        } catch (err) {
            console.error('[api] /des/manage', err);
            return res.status(500).json({ success: false, msg: 'Something went wrong in Centurion. Please try again.' });
        }
    });
};
