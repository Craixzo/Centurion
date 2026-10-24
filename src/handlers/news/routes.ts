import fs from 'fs';
import path from 'path';
import { NEWS_MEDIA_DIR, MEDIA_FILE_PATTERN, MEDIA_TYPES } from './media';
import { isSlug, listOutlets, listLatest, getOutletFront, getArticle, publicOutlet, articleSummary, cleanBody } from './store';
import { getPreview } from './articles';

/**
 * Public, read-only news routes. The website's news pages read these.
 * They only return approved outlets and published articles, and cannot
 * change anything, so they sit above the API key check like /parliament.
 */
export const registerNewsRoutes = (app: any) => {
    const fail = (res: any, where: string, err: unknown) => {
        console.error(`[api] ${where}`, err);
        return res.status(500).json({ success: false, msg: 'Could not load the news.' });
    }

    app.get('/news/outlets', async (req: any, res: any) => {
        try {
            res.set('Cache-Control', 'public, max-age=30');
            return res.json({ success: true, outlets: await listOutlets() });
        } catch (err) { return fail(res, '/news/outlets', err); }
    });

    app.get('/news/latest', async (req: any, res: any) => {
        try {
            const limit = Number(req.query.limit) || 12;
            res.set('Cache-Control', 'public, max-age=30');
            return res.json({ success: true, articles: await listLatest(limit) });
        } catch (err) { return fail(res, '/news/latest', err); }
    });

    app.get('/news/outlets/:slug', async (req: any, res: any) => {
        try {
            if(!isSlug(req.params.slug)) return res.status(404).json({ success: false, msg: 'Outlet not found.' });
            const front = await getOutletFront(req.params.slug);
            if(!front) return res.status(404).json({ success: false, msg: 'Outlet not found.' });
            res.set('Cache-Control', 'public, max-age=30');
            return res.json({ success: true, ... front });
        } catch (err) { return fail(res, '/news/outlets/:slug', err); }
    });

    app.get('/news/outlets/:slug/articles/:article', async (req: any, res: any) => {
        try {
            if(!isSlug(req.params.slug) || !isSlug(req.params.article)) return res.status(404).json({ success: false, msg: 'Article not found.' });
            const found = await getArticle(req.params.slug, req.params.article);
            if(!found) return res.status(404).json({ success: false, msg: 'Article not found.' });
            res.set('Cache-Control', 'public, max-age=30');
            return res.json({ success: true, ... found });
        } catch (err) { return fail(res, '/news/outlets/:slug/articles/:article', err); }
    });

    // An unpublished article, by the random key in a review link. Not cached, never listed anywhere.
    app.get('/news/preview/:key', async (req: any, res: any) => {
        try {
            const article = await getPreview(String(req.params.key || ''));
            if(!article) return res.status(404).json({ success: false, msg: 'Preview not found.' });
            res.set('Cache-Control', 'no-store');
            res.set('X-Robots-Tag', 'noindex');
            return res.json({
                success: true,
                status: article.status,
                outlet: publicOutlet(article.outlet),
                article: { ... articleSummary(article), body: cleanBody(article.body) },
                more: [],
            });
        } catch (err) { return fail(res, '/news/preview/:key', err); }
    });

    // Uploaded images. Only file names the bot itself generated are served.
    app.get('/news/media/:file', (req: any, res: any) => {
        const file = String(req.params.file || '');
        if(!MEDIA_FILE_PATTERN.test(file)) return res.sendStatus(404);
        const fullPath = path.join(NEWS_MEDIA_DIR, file);
        if(!fs.existsSync(fullPath)) return res.sendStatus(404);
        res.set('Content-Type', MEDIA_TYPES[file.split('.').pop()]);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('X-Content-Type-Options', 'nosniff');
        return res.sendFile(fullPath);
    });
}

/**
 * Protected routes the website uses on behalf of a logged-in user.
 * Registered inside the API key check in api.ts, so only the website
 * (which holds the key) can call them. The website puts the logged-in
 * user's Discord ID in every request; it comes from Discord's login, not
 * from anything the visitor typed.
 */
export const registerNewsManageRoutes = (app: any) => {
    const { getMine, registerOutlet, addWriter, removeWriter } = require('./manage');

    const handle = (where: string, run: (body: any) => Promise<any>) => async (req: any, res: any) => {
        try {
            const body = req.body || {};
            if(!/^\d{15,22}$/.test(String(body.discordId || ''))) return res.status(400).json({ success: false, msg: 'Missing user.' });
            const result = await run(body);
            if(!result.ok) return res.json({ success: false, msg: result.msg });
            return res.json({ success: true, msg: result.msg || null, ... (result.data || {}) });
        } catch (err) {
            console.error(`[api] ${where}`, err);
            return res.status(500).json({ success: false, msg: 'Something went wrong. Please try again.' });
        }
    }

    app.post('/news/manage/mine', handle('/news/manage/mine', (b) => getMine(String(b.discordId))));
    app.post('/news/manage/register', handle('/news/manage/register', (b) => registerOutlet(String(b.discordId), b)));
    app.post('/news/manage/add-writer', handle('/news/manage/add-writer', (b) => addWriter(String(b.discordId), b.outlet, String(b.username || ''))));
    app.post('/news/manage/remove-writer', handle('/news/manage/remove-writer', (b) => removeWriter(String(b.discordId), b.outlet, String(b.writerId || ''))));

    const A = require('./articles');
    app.post('/news/manage/upload', handle('/news/manage/upload', (b) => A.upload(String(b.discordId), b.outlet, b.data)));
    app.post('/news/manage/outlet-settings', handle('/news/manage/outlet-settings', (b) => A.getOutletSettings(String(b.discordId), b.outlet)));
    app.post('/news/manage/outlet-update', handle('/news/manage/outlet-update', (b) => A.updateOutlet(String(b.discordId), b.outlet, b)));
    app.post('/news/manage/articles', handle('/news/manage/articles', (b) => A.listArticles(String(b.discordId), b.outlet)));
    app.post('/news/manage/article', handle('/news/manage/article', (b) => A.getArticleForEditing(String(b.discordId), b.outlet, b.id)));
    app.post('/news/manage/article-save', handle('/news/manage/article-save', (b) => A.saveArticle(String(b.discordId), b.outlet, b)));
    app.post('/news/manage/article-submit', handle('/news/manage/article-submit', (b) => A.submitArticle(String(b.discordId), b.outlet, b.id)));
    app.post('/news/manage/article-delete', handle('/news/manage/article-delete', (b) => A.deleteArticle(String(b.discordId), b.outlet, b.id)));
}
