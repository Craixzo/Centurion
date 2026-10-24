import crypto from 'crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, User } from 'discord.js';
import { provider } from '../../database';
import { discordClient } from '../../main';
import { logAction } from '../handleLogging';
import { mainColor, greenColor, redColor } from '../locale';
import { NEWS_SETTINGS } from './settings';
import { mediaExists, saveImage } from './media';
import { slugify, Result } from './manage';
import { announceArticle } from './announce';

/**
 * Writing articles, outlet branding, image uploads, and the review of
 * articles by the Ministry of Commerce.
 *
 * Who can do what:
 *   - Active members of an approved outlet can upload images and write articles.
 *   - Writers edit their own articles; the owner edits every article.
 *   - Only the owner changes the outlet's branding or picks the cover story.
 *   - Nothing appears on the site until a reviewer approves it.
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const isHexColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

const MAX_BODY_BLOCKS = 120;


// ---------------------------------------------------------------- access

/** The outlet, and the person's membership in it, if they're an active member of an approved outlet. */
const access = async (discordId: string, slug: unknown) => {
    const outlet = await db().newsOutlet.findUnique({ where: { slug: String(slug || '') } });
    if(!outlet || outlet.status !== 'APPROVED') return null;
    const member = await db().newsMember.findUnique({ where: { outletId_discordId: { outletId: outlet.id, discordId } } });
    if(!member || member.status !== 'ACTIVE') return null;
    return { outlet, member, isOwner: member.role === 'OWNER' };
}

const canEdit = (who: any, article: any) => who.isOwner || article.authorId === who.member.discordId;


// ---------------------------------------------------------------- images

export const upload = async (discordId: string, slug: unknown, data: unknown): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who) return fail('You can only upload images for an approved outlet you belong to.');
    const saved = saveImage(String(data || ''));
    if(saved.ok === false) return fail(saved.msg);
    return { ok: true, data: { file: saved.file, url: `/news/media/${saved.file}` } };
}


// ---------------------------------------------------------------- branding

export const getOutletSettings = async (discordId: string, slug: unknown): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who || !who.isOwner) return fail('Only the outlet\'s owner can change its settings.');
    const o = who.outlet;
    return { ok: true, data: { outlet: {
        slug: o.slug, name: o.name, tagline: o.tagline, description: o.description, accentColor: o.accentColor,
        iconFile: o.iconFile, coverFile: o.coverFile, sections: JSON.parse(o.sections || '[]'),
    } } };
}

export const updateOutlet = async (discordId: string, slug: unknown, input: any): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who || !who.isOwner) return fail('Only the outlet\'s owner can change its settings.');

    const data: any = {};
    if(input.tagline !== undefined) data.tagline = clean(input.tagline, 120) || null;
    if(input.description !== undefined) data.description = cleanLong(input.description, 600) || null;
    if(input.accentColor !== undefined) {
        if(!isHexColor(input.accentColor)) return fail('The accent color must be a hex code like #369cd3.');
        data.accentColor = String(input.accentColor).toLowerCase();
    }
    if(input.sections !== undefined) {
        const list = (Array.isArray(input.sections) ? input.sections : String(input.sections || '').split(','))
            .map((s: unknown) => clean(s, 24))
            .filter((s: string, i: number, all: string[]) => s && all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
            .slice(0, 8);
        data.sections = JSON.stringify(list);
    }
    for(const key of [ 'iconFile', 'coverFile' ]) {
        if(input[key] === undefined) continue;
        if(input[key] === null || input[key] === '') data[key] = null;
        else if(mediaExists(input[key])) data[key] = input[key];
        else return fail('One of the images couldn\'t be found. Please upload it again.');
    }

    await db().newsOutlet.update({ where: { id: who.outlet.id }, data });
    return { ok: true, msg: 'Your outlet has been updated.' };
}


// ---------------------------------------------------------------- articles

/** Checks and tidies an article's body: paragraphs, sub-headings, quotes and images. */
const cleanBlocks = (raw: unknown): any[] | string => {
    if(!Array.isArray(raw)) return [];
    if(raw.length > MAX_BODY_BLOCKS) return `An article can have at most ${MAX_BODY_BLOCKS} parts.`;
    const out = [];
    for(const block of raw) {
        if(!block || typeof block !== 'object') continue;
        if(block.type === 'p') { const text = cleanLong(block.text, 6000); if(text) out.push({ type: 'p', text }); }
        else if(block.type === 'h2') { const text = clean(block.text, 200); if(text) out.push({ type: 'h2', text }); }
        else if(block.type === 'quote') {
            const text = cleanLong(block.text, 1000);
            if(text) out.push({ type: 'quote', text, by: clean(block.by, 120) || null });
        } else if(block.type === 'img') {
            if(!mediaExists(block.file)) return 'One of the article\'s images couldn\'t be found. Please upload it again.';
            out.push({ type: 'img', file: block.file, caption: clean(block.caption, 300) || null });
        }
    }
    return out;
}

const summaryOf = (article: any) => ({
    id: article.id,
    slug: article.slug,
    headline: article.headline,
    section: article.section,
    status: article.status,
    authorName: article.authorName,
    isCoverStory: article.isCoverStory,
    reviewNote: article.status === 'REJECTED' ? article.reviewNote : null,
    updatedAt: article.updatedAt,
    publishedAt: article.publishedAt,
});

/** The articles someone can see in their newsroom: all of them for the owner, their own for a writer. */
export const listArticles = async (discordId: string, slug: unknown): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who) return fail('You don\'t write for that outlet.');
    const articles = await db().newsArticle.findMany({
        where: { outletId: who.outlet.id, status: { not: 'REMOVED' }, ... (who.isOwner ? {} : { authorId: discordId }) },
        orderBy: { updatedAt: 'desc' },
        take: 100,
    });
    return { ok: true, data: { articles: articles.map(summaryOf), isOwner: who.isOwner } };
}

export const getArticleForEditing = async (discordId: string, slug: unknown, id: unknown): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who) return fail('You don\'t write for that outlet.');
    const outletInfo = { slug: who.outlet.slug, name: who.outlet.name, sections: JSON.parse(who.outlet.sections || '[]'), isOwner: who.isOwner };
    if(!id) return { ok: true, data: { outlet: outletInfo, article: null } };

    const article = await db().newsArticle.findUnique({ where: { id: String(id) } });
    if(!article || article.outletId !== who.outlet.id || article.status === 'REMOVED') return fail('That article doesn\'t exist.');
    if(!canEdit(who, article)) return fail('You can only edit your own articles.');
    return { ok: true, data: { outlet: outletInfo, article: {
        ... summaryOf(article),
        summary: article.summary,
        coverFile: article.coverFile,
        coverCaption: article.coverCaption,
        body: JSON.parse(article.body || '[]'),
        previewKey: article.previewKey,
    } } };
}

export const saveArticle = async (discordId: string, slug: unknown, input: any): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who) return fail('You don\'t write for that outlet.');

    const headline = clean(input.headline, 160);
    if(headline.length < 5) return fail('The headline must be at least 5 characters.');
    const body = cleanBlocks(input.body);
    if(typeof body === 'string') return fail(body);

    const sections = JSON.parse(who.outlet.sections || '[]') as string[];
    const section = input.section ? sections.find((s) => s === input.section) || null : null;
    let coverFile: string | null = null;
    if(input.coverFile) {
        if(!mediaExists(input.coverFile)) return fail('The cover image couldn\'t be found. Please upload it again.');
        coverFile = input.coverFile;
    }

    const data: any = {
        headline,
        summary: cleanLong(input.summary, 400) || null,
        section,
        body: JSON.stringify(body),
        coverFile,
        coverCaption: clean(input.coverCaption, 300) || null,
    };

    let article;
    let wasPublished = false;
    if(input.id) {
        const existing = await db().newsArticle.findUnique({ where: { id: String(input.id) } });
        if(!existing || existing.outletId !== who.outlet.id || existing.status === 'REMOVED') return fail('That article doesn\'t exist.');
        if(!canEdit(who, existing)) return fail('You can only edit your own articles.');
        if(existing.status === 'SUBMITTED') return fail('This article is waiting for review. It can be edited again once it has been reviewed.');
        wasPublished = existing.status === 'PUBLISHED';
        article = await db().newsArticle.update({ where: { id: existing.id }, data: { ... data, status: 'DRAFT' } });
    } else {
        const base = slugify(headline) || 'article';
        let articleSlug = base;
        for(let n = 2; await db().newsArticle.findUnique({ where: { outletId_slug: { outletId: who.outlet.id, slug: articleSlug } } }); n++) articleSlug = `${base}-${n}`;
        article = await db().newsArticle.create({ data: {
            ... data,
            outletId: who.outlet.id,
            slug: articleSlug,
            authorId: discordId,
            authorName: who.member.displayName,
            status: 'DRAFT',
            previewKey: crypto.randomBytes(16).toString('hex'),
        } });
    }

    if(who.isOwner && typeof input.isCoverStory === 'boolean') await setCoverStory(who.outlet.id, article.id, input.isCoverStory);

    return { ok: true, data: { id: article.id, slug: article.slug, status: article.status, previewKey: article.previewKey },
        msg: wasPublished ? 'Saved. The article is back to a draft and off the site until it\'s reviewed again.' : 'Saved as a draft.' };
}

const setCoverStory = async (outletId: string, articleId: string, on: boolean) => {
    if(on) await db().newsArticle.updateMany({ where: { outletId, isCoverStory: true }, data: { isCoverStory: false } });
    await db().newsArticle.update({ where: { id: articleId }, data: { isCoverStory: on } });
}

export const deleteArticle = async (discordId: string, slug: unknown, id: unknown): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who) return fail('You don\'t write for that outlet.');
    const article = await db().newsArticle.findUnique({ where: { id: String(id || '') } });
    if(!article || article.outletId !== who.outlet.id || article.status === 'REMOVED') return fail('That article doesn\'t exist.');
    if(!canEdit(who, article)) return fail('You can only delete your own articles.');
    await db().newsArticle.update({ where: { id: article.id }, data: { status: 'REMOVED', isCoverStory: false } });
    return { ok: true, msg: 'The article has been deleted.' };
}


// ---------------------------------------------------------------- review

const previewUrl = (key: string) => `${NEWS_SETTINGS.siteUrl}/article.html?preview=${key}`;

const articleReviewEmbed = (article: any, outlet: any) => {
    const embed = new EmbedBuilder()
        .setColor(mainColor)
        .setTitle('Article for review')
        .setDescription(`**${article.headline}**${article.summary ? `\n${article.summary}` : ''}`)
        .addFields(
            { name: 'Outlet', value: outlet.name, inline: true },
            { name: 'Author', value: `<@${article.authorId}>`, inline: true },
            { name: 'Section', value: article.section || 'None', inline: true },
            { name: 'Read the full article', value: previewUrl(article.previewKey) },
        )
        .setTimestamp(new Date());
    return embed;
}

export const submitArticle = async (discordId: string, slug: unknown, id: unknown): Promise<Result> => {
    const who = await access(discordId, slug);
    if(!who) return fail('You don\'t write for that outlet.');
    const article = await db().newsArticle.findUnique({ where: { id: String(id || '') } });
    if(!article || article.outletId !== who.outlet.id || article.status === 'REMOVED') return fail('That article doesn\'t exist.');
    if(!canEdit(who, article)) return fail('You can only submit your own articles.');
    if(![ 'DRAFT', 'REJECTED' ].includes(article.status)) return fail(article.status === 'SUBMITTED' ? 'This article is already waiting for review.' : 'This article is already published.');
    if(JSON.parse(article.body || '[]').length === 0) return fail('Write something in the article before sending it for review.');

    const previewKey = article.previewKey || crypto.randomBytes(16).toString('hex');
    const updated = await db().newsArticle.update({ where: { id: article.id }, data: { status: 'SUBMITTED', submittedAt: new Date(), previewKey, reviewNote: null } });

    const channel = await discordClient.channels.fetch(NEWS_SETTINGS.reviewChannelId).catch((): null => null);
    if(channel && channel.isTextBased()) {
        await (channel as TextChannel).send({
            embeds: [ articleReviewEmbed(updated, who.outlet) ],
            components: [ new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`news:approve:article:${article.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`news:deny:article:${article.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
            ) ],
        }).catch((err) => console.error('[news] could not post article for review', err));
    } else {
        console.error('[news] review channel not found:', NEWS_SETTINGS.reviewChannelId);
    }
    return { ok: true, data: { status: 'SUBMITTED' }, msg: 'Sent to the Ministry of Commerce for review.' };
}

/** Approve or deny a submitted article. Only acts once, even if two reviewers press at the same time. */
export const reviewArticle = async (id: string, approve: boolean, reviewer: User, note: string | null): Promise<Result<{ embed: EmbedBuilder }>> => {
    const reason = note ? clean(note, 300) : null;
    const existing = await db().newsArticle.findUnique({ where: { id }, include: { outlet: true } });
    if(!existing) return fail('This article no longer exists.');
    const changed = await db().newsArticle.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: approve
            ? { status: 'PUBLISHED', publishedAt: existing.publishedAt || new Date(), reviewedBy: reviewer.id, reviewNote: null }
            : { status: 'REJECTED', reviewedBy: reviewer.id, reviewNote: reason },
    });
    const article = await db().newsArticle.findUnique({ where: { id } });
    if(changed.count === 0) return fail(`This article was already ${article.status === 'REMOVED' ? 'deleted' : article.status.toLowerCase()}, or was edited after it was sent.`);

    // Posted to the news channels the first time an article goes live (not when an edited article is approved again).
    if(approve && !existing.publishedAt) announceArticle(article, existing.outlet).catch((err) => console.error('[news] announce', err));

    logAction(approve ? 'News Article Approved' : 'News Article Denied' as any, reviewer, `${article.headline} (${existing.outlet.name})${reason ? ` | ${reason}` : ''}`);
    const user = await discordClient.users.fetch(article.authorId).catch((): null => null);
    if(user) {
        await user.send({ embeds: [ approve
            ? new EmbedBuilder().setColor(greenColor).setTitle('Your article was published')
                .setDescription(`**${article.headline}** is now live on ${existing.outlet.name}.\n${NEWS_SETTINGS.siteUrl}/article.html?o=${existing.outlet.slug}&a=${article.slug}`)
            : new EmbedBuilder().setColor(redColor).setTitle('Your article was not approved')
                .setDescription(`**${article.headline}** was not approved by the Ministry of Commerce.${reason ? `\nReason: ${reason}` : ''}\nYou can edit it and send it again from your newsroom.`),
        ] }).catch((): null => null);
    }

    const embed = articleReviewEmbed(article, existing.outlet)
        .setColor(approve ? greenColor : redColor)
        .setFooter({ text: `${approve ? 'Approved' : 'Denied'} by ${reviewer.username}${reason ? ` | ${reason}` : ''}` });
    return { ok: true, data: { embed } };
}

/** Public: an article by its preview key, whatever its status. Used by the review link. */
export const getPreview = async (key: string) => {
    if(!/^[a-f0-9]{32}$/.test(key)) return null;
    const article = await db().newsArticle.findUnique({ where: { previewKey: key }, include: { outlet: true } });
    if(!article || article.status === 'REMOVED') return null;
    return article;
}
