import { SITE_SETTINGS } from './settings';
import { db, fail, clean, cleanLong, Result, SiteUser, siteAudit } from './common';
import { slugify } from '../news/manage';

/**
 * Official documents (documents.html, document.html, constitution.html).
 *
 * Site admins write them in the staff area. The body is plain text with a
 * few marks, which the website turns into headings and lists:
 *     ## Article I          a heading (shown in the contents list)
 *     ### Section 1         a smaller heading
 *     - an item             a bulleted list
 *     1. an item            a numbered list
 *     **bold**              bold text
 *
 * The Constitution is the document whose address name (slug) is "constitution".
 * A document is either PUBLISHED (everyone sees it) or DRAFT (staff only).
 */

const MAX_BODY = 200000;

const summaryView = (d: any) => ({
    slug: d.slug,
    title: d.title,
    category: d.category,
    summary: d.summary,
    effectiveDate: d.effectiveDate,
    status: d.status,
    updatedAt: d.updatedAt,
    publishedAt: d.publishedAt,
});

const fullView = (d: any) => ({ ... summaryView(d), body: d.body, updatedName: d.updatedName });

export const listDocuments = async (): Promise<Result> => {
    const rows = await db().siteDocument.findMany({ where: { status: 'PUBLISHED' }, orderBy: [ { category: 'asc' }, { title: 'asc' } ] });
    return { ok: true, data: { documents: rows.map(summaryView), categories: SITE_SETTINGS.documentCategories } };
};

export const getDocument = async (input: any): Promise<Result> => {
    const d = await db().siteDocument.findUnique({ where: { slug: clean(input.slug, 60).toLowerCase() } });
    if(!d || d.status !== 'PUBLISHED') return fail('That document doesn\'t exist.');
    return { ok: true, data: { document: fullView(d) } };
};

// ---------------------------------------------------------------- staff

export const staffDocuments = async (): Promise<Result> => {
    const rows = await db().siteDocument.findMany({ orderBy: { updatedAt: 'desc' } });
    return { ok: true, data: { documents: rows.map(summaryView), categories: SITE_SETTINGS.documentCategories } };
};

export const staffDocument = async (staff: SiteUser, input: any): Promise<Result> => {
    const d = await db().siteDocument.findUnique({ where: { slug: clean(input.slug, 60).toLowerCase() } });
    if(!d) return fail('That document doesn\'t exist.');
    return { ok: true, data: { document: fullView(d) } };
};

/** Creates or updates a document. Only site admins. */
export const saveDocument = async (staff: SiteUser, input: any): Promise<Result> => {
    if(!staff.isAdmin) return fail('Only site admins can write official documents.');
    const title = clean(input.title, 120);
    if(title.length < 3) return fail('Give it a title.');
    const category = clean(input.category, 40);
    if(!SITE_SETTINGS.documentCategories.includes(category)) return fail('Pick a category.');
    const body = cleanLong(input.body, MAX_BODY);
    if(body.length < 20) return fail('Write the document (at least 20 characters).');
    const summary = clean(input.summary, 300) || null;
    const effectiveDate = clean(input.effectiveDate, 40) || null;
    const publish = input.publish === true;

    const original = clean(input.originalSlug, 60).toLowerCase();
    const slug = original || slugify(clean(input.slug, 60) || title) || 'document';
    if(!/^[a-z0-9-]{2,60}$/.test(slug)) return fail('The address name can only use a-z, 0-9 and dashes.');

    const existing = await db().siteDocument.findUnique({ where: { slug } });
    if(!original && existing) return fail('A document with that address name already exists. Choose another.');
    const data: any = { title, category, body, summary, effectiveDate, updatedBy: staff.discordId, updatedName: staff.name };
    if(publish) { data.status = 'PUBLISHED'; if(!existing || existing.status !== 'PUBLISHED') data.publishedAt = new Date(); }
    else if(!existing) data.status = 'DRAFT';

    if(existing) await db().siteDocument.update({ where: { slug }, data });
    else await db().siteDocument.create({ data: { ... data, slug, status: data.status || 'DRAFT' } });
    await siteAudit(staff, existing ? 'Edited document' : 'Created document', `${title}${publish ? ' (published)' : ''}`);
    return { ok: true, msg: publish ? 'Saved and published.' : 'Saved.', data: { slug } };
};

export const setDocumentStatus = async (staff: SiteUser, input: any): Promise<Result> => {
    if(!staff.isAdmin) return fail('Only site admins can publish documents.');
    const d = await db().siteDocument.findUnique({ where: { slug: clean(input.slug, 60).toLowerCase() } });
    if(!d) return fail('That document doesn\'t exist.');
    const publish = input.publish === true;
    await db().siteDocument.update({ where: { slug: d.slug }, data: { status: publish ? 'PUBLISHED' : 'DRAFT', ... (publish && !d.publishedAt ? { publishedAt: new Date() } : {}) } });
    await siteAudit(staff, publish ? 'Published document' : 'Unpublished document', d.title);
    return { ok: true, msg: publish ? 'Published.' : 'Moved back to drafts.' };
};

export const deleteDocument = async (staff: SiteUser, input: any): Promise<Result> => {
    if(!staff.isAdmin) return fail('Only site admins can delete documents.');
    const d = await db().siteDocument.findUnique({ where: { slug: clean(input.slug, 60).toLowerCase() } });
    if(!d) return fail('That document doesn\'t exist.');
    await db().siteDocument.delete({ where: { slug: d.slug } });
    await siteAudit(staff, 'Deleted document', d.title);
    return { ok: true, msg: 'Deleted.' };
};
