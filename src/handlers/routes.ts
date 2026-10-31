import { db, siteUser, SiteUser } from './common';
import { myThreads, myThread, sendFromWeb, inbox, staffThread, staffReply, staffClose, openModmailCount } from './modmail';
import { listJobs, getJob, trackJob, jobsMe, applyJob, withdrawJob, postJob, updateJob, closeJob, jobApplications, decideJob, removeJob, openJobCount } from './jobs';
import { listDocuments, getDocument, staffDocuments, staffDocument, saveDocument, setDocumentStatus, deleteDocument } from './documents';

/**
 * Website routes for the staff area, modmail, the job board and official
 * documents. All sit after the API key check in api.ts: only the website
 * calls them, passing the Discord ID of whoever is logged in there.
 *
 *   /site/public/:action   no login needed
 *   /site/user/:action     any logged-in Discord user
 *   /site/staff/:action    staff only (a role in SITE_SETTINGS.staffRoleIds / adminRoleIds)
 */
export const registerSiteRoutes = (app: any) => {
    const send = (res: any, result: any) => result.ok === false
        ? res.json({ success: false, msg: result.msg })
        : res.json({ success: true, msg: result.msg, ... (result.data || {}) });
    const oops = (res: any, where: string, err: unknown) => {
        console.error(`[api] ${where}`, err);
        return res.status(500).json({ success: false, msg: 'Something went wrong in Centurion. Please try again.' });
    };
    const discordIdOf = (body: any) => /^\d{15,22}$/.test(String(body?.discordId || '')) ? String(body.discordId) : null;

    const PUBLIC: Record<string, (b: any) => Promise<any>> = {
        'documents': () => listDocuments(),
        'document': (b) => getDocument(b),
        'jobs': (b) => listJobs(b),
        'job': (b) => getJob(b, discordIdOf(b)),
        'job-track': (b) => trackJob(b),
        'counts': async () => {
            const [ corporations, listed, jobs ] = await Promise.all([
                db().econCompany.count({ where: { NOT: { state: 'PENDING' } } }),
                db().econCompany.count({ where: { state: { in: [ 'LISTED', 'SUSPENDED' ] } } }),
                openJobCount(),
            ]);
            return { ok: true, data: { corporations, listed, jobs } };
        },
    };

    const USER: Record<string, (id: string, b: any) => Promise<any>> = {
        'me': async (id) => {
            const user = await siteUser(id);
            return { ok: true, data: { inServer: !!user, name: user?.name || null, isStaff: !!user?.isStaff, isAdmin: !!user?.isAdmin, isOfficer: !!user?.isOfficer } };
        },
        'modmail-mine': (id) => myThreads(id),
        'modmail-thread': (id, b) => myThread(id, b),
        'modmail-send': (id, b) => sendFromWeb(id, b),
        'jobs-me': (id) => jobsMe(id),
        'job-apply': (id, b) => applyJob(id, b),
        'job-withdraw': (id, b) => withdrawJob(id, b),
        'job-post': (id, b) => postJob(id, b),
        'job-update': (id, b) => updateJob(id, b),
        'job-close': (id, b) => closeJob(id, b),
        'job-apps': (id, b) => jobApplications(id, b),
        'job-decide': (id, b) => decideJob(id, b),
    };

    const STAFF: Record<string, (s: SiteUser, b: any) => Promise<any>> = {
        'overview': async (s) => {
            const [ modmail, jobs, drafts, audit ] = await Promise.all([
                openModmailCount(),
                openJobCount(),
                db().siteDocument.count({ where: { status: 'DRAFT' } }),
                db().siteAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
            ]);
            return { ok: true, data: {
                you: { name: s.name, isAdmin: s.isAdmin },
                counts: { modmailWaiting: modmail, openJobs: jobs, draftDocuments: drafts },
                audit: audit.map((a: any) => ({ actorName: a.actorName, action: a.action, detail: a.detail, createdAt: a.createdAt })),
            } };
        },
        'modmail-inbox': (s, b) => inbox(s, b),
        'modmail-thread': (s, b) => staffThread(s, b),
        'modmail-reply': (s, b) => staffReply(s, b),
        'modmail-close': (s, b) => staffClose(s, b),
        'docs': () => staffDocuments(),
        'doc': (s, b) => staffDocument(s, b),
        'doc-save': (s, b) => saveDocument(s, b),
        'doc-status': (s, b) => setDocumentStatus(s, b),
        'doc-delete': (s, b) => deleteDocument(s, b),
        'job-remove': (s, b) => removeJob(s, b),
    };

    app.post('/site/public/:action', async (req: any, res: any) => {
        try {
            const run = PUBLIC[String(req.params.action)];
            if(!run) return res.status(404).json({ success: false, msg: 'Unknown action.' });
            return send(res, await run(req.body || {}));
        } catch (err) { return oops(res, '/site/public', err); }
    });

    app.post('/site/user/:action', async (req: any, res: any) => {
        try {
            const run = USER[String(req.params.action)];
            if(!run) return res.status(404).json({ success: false, msg: 'Unknown action.' });
            const id = discordIdOf(req.body);
            if(!id) return res.status(400).json({ success: false, msg: 'Missing Discord ID.' });
            return send(res, await run(id, req.body || {}));
        } catch (err) { return oops(res, '/site/user', err); }
    });

    app.post('/site/staff/:action', async (req: any, res: any) => {
        try {
            const run = STAFF[String(req.params.action)];
            if(!run) return res.status(404).json({ success: false, msg: 'Unknown action.' });
            const id = discordIdOf(req.body);
            if(!id) return res.status(400).json({ success: false, msg: 'Missing Discord ID.' });
            const staff = await siteUser(id);
            if(!staff?.isStaff) return res.json({ success: false, notStaff: true, msg: 'This area is for Yellonia staff.' });
            return send(res, await run(staff, req.body || {}));
        } catch (err) { return oops(res, '/site/staff', err); }
    });
};
