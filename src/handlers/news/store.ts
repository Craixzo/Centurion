import { provider } from '../../database';
import { mediaPath } from './media';

/**
 * Read-only queries for the public news pages.
 *
 * Only APPROVED outlets and PUBLISHED articles ever leave this file, and only
 * the fields the website shows. Discord IDs, review notes and request details
 * stay inside the bot.
 */

const db = () => (provider as any).db;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSlug = (value: unknown) => typeof value === 'string' && value.length <= 80 && SLUG_PATTERN.test(value);

const isHexColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

const parseJson = (value: string, fallback: any) => {
    try { return JSON.parse(value); } catch (err) { return fallback; }
}

const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);

// ----------------------------------------------------------------- shapes

export const publicOutlet = (outlet: any) => ({
    slug: outlet.slug,
    name: outlet.name,
    tagline: outlet.tagline || null,
    description: outlet.description || null,
    accentColor: isHexColor(outlet.accentColor) ? outlet.accentColor : '#bed215',
    icon: mediaPath(outlet.iconFile),
    cover: mediaPath(outlet.coverFile),
    sections: (parseJson(outlet.sections || '[]', []) as any[])
        .filter((section) => typeof section === 'string' && section.trim())
        .slice(0, 12),
});

export const articleSummary = (article: any) => ({
    slug: article.slug,
    headline: article.headline,
    summary: article.summary || null,
    section: article.section || null,
    cover: mediaPath(article.coverFile),
    coverCaption: article.coverCaption || null,
    authorName: article.authorName,
    isCoverStory: Boolean(article.isCoverStory),
    publishedAt: iso(article.publishedAt),
});

/** Article body: only the block types the website knows how to draw, with text trimmed to size. */
export const cleanBody = (raw: string) => {
    const blocks = parseJson(raw || '[]', []);
    if(!Array.isArray(blocks)) return [];
    const text = (value: unknown, max: number) => String(value || '').slice(0, max);
    const out = [];
    for(const block of blocks.slice(0, 200)) {
        if(!block || typeof block !== 'object') continue;
        if(block.type === 'p' && block.text) out.push({ type: 'p', text: text(block.text, 6000) });
        else if(block.type === 'h2' && block.text) out.push({ type: 'h2', text: text(block.text, 200) });
        else if(block.type === 'quote' && block.text) out.push({ type: 'quote', text: text(block.text, 1000), by: block.by ? text(block.by, 120) : null });
        else if(block.type === 'img') {
            const src = mediaPath(block.file);
            if(src) out.push({ type: 'img', src, caption: block.caption ? text(block.caption, 300) : null });
        }
    }
    return out;
}

// ---------------------------------------------------------------- queries

const PUBLISHED = { status: 'PUBLISHED' };

/** Every approved outlet, newest activity first. */
export const listOutlets = async () => {
    const outlets = await db().newsOutlet.findMany({
        where: { status: 'APPROVED' },
        include: {
            articles: {
                where: PUBLISHED,
                orderBy: { publishedAt: 'desc' },
                take: 1,
                select: { publishedAt: true },
            },
            _count: { select: { articles: { where: PUBLISHED } } },
        },
    });
    return outlets
        .map((outlet: any) => ({
            ... publicOutlet(outlet),
            articleCount: outlet._count?.articles || 0,
            lastPublishedAt: iso(outlet.articles?.[0]?.publishedAt),
        }))
        .sort((a: any, b: any) => (b.lastPublishedAt || '').localeCompare(a.lastPublishedAt || '') || a.name.localeCompare(b.name));
}

/** The newest published articles across every approved outlet. */
export const listLatest = async (limit: number) => {
    const articles = await db().newsArticle.findMany({
        where: { ... PUBLISHED, outlet: { status: 'APPROVED' } },
        orderBy: { publishedAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 40),
        include: { outlet: true },
    });
    return articles.map((article: any) => ({
        ... articleSummary(article),
        outlet: { slug: article.outlet.slug, name: article.outlet.name, icon: mediaPath(article.outlet.iconFile), accentColor: publicOutlet(article.outlet).accentColor },
    }));
}

/** One outlet's front page: the outlet and its newest published articles. */
export const getOutletFront = async (slug: string) => {
    const outlet = await db().newsOutlet.findFirst({ where: { slug, status: 'APPROVED' } });
    if(!outlet) return null;
    const articles = await db().newsArticle.findMany({
        where: { outletId: outlet.id, ... PUBLISHED },
        orderBy: { publishedAt: 'desc' },
        take: 60,
    });
    return { outlet: publicOutlet(outlet), articles: articles.map(articleSummary) };
}

/** One published article, plus a few more from the same outlet. */
export const getArticle = async (outletSlug: string, articleSlug: string) => {
    const outlet = await db().newsOutlet.findFirst({ where: { slug: outletSlug, status: 'APPROVED' } });
    if(!outlet) return null;
    const article = await db().newsArticle.findFirst({ where: { outletId: outlet.id, slug: articleSlug, ... PUBLISHED } });
    if(!article) return null;
    const more = await db().newsArticle.findMany({
        where: { outletId: outlet.id, ... PUBLISHED, NOT: { id: article.id } },
        orderBy: { publishedAt: 'desc' },
        take: 4,
    });
    return {
        outlet: publicOutlet(outlet),
        article: { ... articleSummary(article), body: cleanBody(article.body) },
        more: more.map(articleSummary),
    };
}
