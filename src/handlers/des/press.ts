import { provider } from '../../database';
import { NEWS_SETTINGS } from '../news/settings';
import { DES_SETTINGS } from './settings';
import { audit, parseRoles, Result } from './auth';

/**
 * DES News: DES's own outlet in Yellonia News.
 *
 * Articles are written in the normal newsroom editor (editor.html) and go
 * through the normal Ministry of Commerce review before they're published.
 * This file only manages the outlet itself and who writes for it, based on
 * DES roles, so nobody has to register or request writer access by hand.
 *
 *   service admin             set the outlet up (once), remove writers
 *   PIO, supervisor, admins   join as a writer, leave
 *   leaving DES               takes away writer access automatically
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const has = (m: any, ...roles: string[]) => parseRoles(m.roles).some((r) => roles.includes(r));
const canWrite = (m: any) => has(m, 'pio', 'supervisor', 'local-admin', 'service-admin');
const isService = (m: any) => has(m, 'service-admin');
const who = (m: any) => `${m.rank} ${m.robloxUsername}`;

const getOutlet = () => db().newsOutlet.findUnique({ where: { slug: DES_SETTINGS.newsOutletSlug } });
const isDesOutlet = (o: any) => o && o.status === 'APPROVED';

export const newsStatus = async (actor: any): Promise<Result> => {
    const outlet = await getOutlet();
    const base = { slug: DES_SETTINGS.newsOutletSlug, name: DES_SETTINGS.newsOutletName, siteUrl: NEWS_SETTINGS.siteUrl,
        canWrite: canWrite(actor), canSetup: isService(actor) };
    if(!outlet) return { ok: true, data: { ... base, exists: false } };

    const members = await db().newsMember.findMany({ where: { outletId: outlet.id, status: 'ACTIVE' } });
    const me = members.find((m: any) => m.discordId === actor.discordId) || null;
    const articles = await db().newsArticle.findMany({ where: { outletId: outlet.id, status: { not: 'REMOVED' } }, orderBy: { updatedAt: 'desc' }, take: 30 });
    return { ok: true, data: { ... base,
        exists: true, approved: isDesOutlet(outlet), outletName: outlet.name, ownedByMe: outlet.ownerId === actor.discordId,
        isWriter: !!me,
        writers: members.map((m: any) => ({ discordId: m.discordId, name: m.displayName, role: m.role, me: m.discordId === actor.discordId })),
        articles: articles.map((a: any) => ({ id: a.id, slug: a.slug, headline: a.headline, status: a.status, authorName: a.authorName,
            mine: a.authorId === actor.discordId, updatedAt: a.updatedAt, publishedAt: a.publishedAt })),
    } };
}

/** Creates DES's outlet, already approved, owned by this Service Admin. */
export const newsSetup = async (actor: any): Promise<Result> => {
    if(!isService(actor)) return fail('Only a Service Admin can set up DES News.');
    const existing = await getOutlet();
    if(existing) return fail(existing.status === 'APPROVED' ? 'DES News is already set up.' : 'An outlet with that address already exists but isn\'t approved. Ask the Ministry of Commerce to approve or remove it.');
    await db().newsOutlet.create({ data: {
        slug: DES_SETTINGS.newsOutletSlug, name: DES_SETTINGS.newsOutletName,
        tagline: 'News from the Yellonia Police and Fire Departments',
        accentColor: '#3f95ce', sections: JSON.stringify([ 'Police', 'Fire', 'Announcements' ]),
        ownerId: actor.discordId, status: 'APPROVED', approvedAt: new Date(), reviewedBy: actor.discordId,
        reviewNote: 'Set up from the DES back-end',
        members: { create: { discordId: actor.discordId, displayName: who(actor), role: 'OWNER', status: 'ACTIVE', addedBy: actor.discordId, approvedAt: new Date() } },
    } });
    await audit(actor.id, 'DES News set up', DES_SETTINGS.newsOutletSlug, actor.badgeId);
    return { ok: true, msg: 'DES News is set up. You own the outlet; writers can join from this page.' };
}

export const newsJoin = async (actor: any): Promise<Result> => {
    if(!canWrite(actor)) return fail('Only PIOs, supervisors and admins can write for DES News.');
    const outlet = await getOutlet();
    if(!isDesOutlet(outlet)) return fail('DES News isn\'t set up yet.');
    const existing = await db().newsMember.findUnique({ where: { outletId_discordId: { outletId: outlet.id, discordId: actor.discordId } } });
    if(existing && existing.status === 'ACTIVE') return { ok: true, msg: 'You already write for DES News.' };
    if(existing) await db().newsMember.update({ where: { id: existing.id }, data: { status: 'ACTIVE', displayName: who(actor), approvedAt: new Date() } });
    else await db().newsMember.create({ data: { outletId: outlet.id, discordId: actor.discordId, displayName: who(actor), role: 'WRITER', status: 'ACTIVE', addedBy: actor.discordId, approvedAt: new Date() } });
    return { ok: true, msg: 'You can now write for DES News.' };
}

/** Leave (yourself), or as a Service Admin remove someone. The owner stays. */
export const newsRemove = async (actor: any, input: any): Promise<Result> => {
    const outlet = await getOutlet();
    if(!outlet) return fail('DES News isn\'t set up yet.');
    const target = String(input.discord || actor.discordId);
    if(target !== actor.discordId && !isService(actor)) return fail('Only a Service Admin can remove writers.');
    if(target === outlet.ownerId) return fail('The outlet\'s owner can\'t be removed.');
    const m = await db().newsMember.findUnique({ where: { outletId_discordId: { outletId: outlet.id, discordId: target } } });
    if(!m || m.status !== 'ACTIVE') return fail('That person doesn\'t write for DES News.');
    await db().newsMember.update({ where: { id: m.id }, data: { status: 'REMOVED' } });
    if(target !== actor.discordId) await audit(actor.id, 'DES News writer removed', m.displayName, actor.badgeId);
    return { ok: true, msg: target === actor.discordId ? 'You no longer write for DES News.' : `${m.displayName} removed.` };
}

/** Called when someone leaves DES: they stop being a DES News writer (unless they own the outlet). */
export const dropWriter = async (discordId: string) => {
    try {
        const outlet = await getOutlet();
        if(!outlet || outlet.ownerId === discordId) return;
        await db().newsMember.updateMany({ where: { outletId: outlet.id, discordId, status: 'ACTIVE' }, data: { status: 'REMOVED' } });
    } catch (err) {
        console.error('[des] couldn\'t remove a DES News writer', err);
    }
}
