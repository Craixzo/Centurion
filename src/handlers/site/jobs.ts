import { EmbedBuilder } from 'discord.js';
import { discordClient } from '../../main';
import { getLinkedRobloxUser } from '../accountLinks';
import { NEWS_SETTINGS } from '../news/settings';
import { SITE_SETTINGS } from './settings';
import { db, fail, clean, cleanLong, Result, siteUser, SiteUser, siteAudit } from './common';

/**
 * The job board (jobs.html).
 *
 *   Anyone        sees open listings
 *   Logged in     applies to a listing (Roblox account from their Discord link)
 *   Officers      post listings and decide on applications to their own listings
 *                 (officer = a role in SITE_SETTINGS.jobOfficerRoleIds, or staff)
 *   Staff         remove any listing
 *
 * A listing either takes applications on the site, or just says how to apply
 * (e.g. "DM a recruiter"). Applicants are told the decision by DM.
 */

const LISTING_STATUS: Record<string, string> = { OPEN: 'Open', CLOSED: 'Closed', REMOVED: 'Removed' };
const APP_STATUS: Record<string, string> = { PENDING: 'Waiting', ACCEPTED: 'Accepted', DECLINED: 'Not selected', WITHDRAWN: 'Withdrawn' };

const isOpen = (l: any) => l.status === 'OPEN' && (!l.closesAt || new Date(l.closesAt).getTime() > Date.now());

const listingView = (l: any, extra: any = {}) => ({
    id: l.id,
    title: l.title,
    organisation: l.organisation,
    category: l.category,
    description: l.description,
    requirements: l.requirements,
    applyOnSite: l.applyOnSite,
    howToApply: l.howToApply,
    status: isOpen(l) ? 'OPEN' : (l.status === 'OPEN' ? 'CLOSED' : l.status),
    statusName: LISTING_STATUS[isOpen(l) ? 'OPEN' : (l.status === 'OPEN' ? 'CLOSED' : l.status)],
    postedName: l.postedName,
    createdAt: l.createdAt,
    closesAt: l.closesAt,
    ... extra,
});

/** The application number people use to follow an application: JOB- and the first 8 characters of its ID */
const appNumber = (id: string) => 'JOB-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();

const appView = (a: any, forPoster: boolean) => ({
    id: a.id,
    number: appNumber(a.id),
    status: a.status,
    statusName: APP_STATUS[a.status] || a.status,
    message: a.message,
    note: a.note,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt,
    ... (forPoster ? { discordName: a.discordName, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId } : {}),
});

const dm = async (discordId: string, title: string, text: string) => {
    try {
        const user = await discordClient.users.fetch(discordId);
        await user.send({ embeds: [ new EmbedBuilder().setColor(0xbed215).setTitle(title).setDescription(text).setURL(`${NEWS_SETTINGS.siteUrl}/jobs.html`) ] });
    } catch { /* DMs closed */ }
};

// ---------------------------------------------------------------- public

export const listJobs = async (input: any): Promise<Result> => {
    const category = clean(input.category, 40);
    const rows = await db().jobListing.findMany({ where: { status: 'OPEN', ... (category ? { category } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
    const open = rows.filter(isOpen);
    const counts = await Promise.all(open.map((l: any) => db().jobApplication.count({ where: { listingId: l.id, status: { not: 'WITHDRAWN' } } })));
    return { ok: true, data: {
        listings: open.map((l: any, i: number) => listingView(l, { applicants: counts[i] })),
        categories: SITE_SETTINGS.jobCategories,
    } };
};

export const getJob = async (input: any, discordId: string | null): Promise<Result> => {
    const l = await db().jobListing.findUnique({ where: { id: clean(input.id, 64) } });
    if(!l || l.status === 'REMOVED') return fail('That listing doesn\'t exist.');
    const mine = discordId ? await db().jobApplication.findFirst({ where: { listingId: l.id, discordId } }) : null;
    return { ok: true, data: { listing: listingView(l, { yours: discordId === l.postedBy }), application: mine ? appView(mine, false) : null } };
};

// ---------------------------------------------------------------- logged in

/** What this person can do on the job board, plus their applications and (for officers) their listings. */
export const jobsMe = async (discordId: string): Promise<Result> => {
    const user = await siteUser(discordId);
    const apps = await db().jobApplication.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const listingsById: Record<string, any> = {};
    for(const l of await db().jobListing.findMany({ where: { id: { in: apps.map((a: any) => a.listingId) } } })) listingsById[l.id] = l;

    let mine: any[] = [];
    if(user?.isOfficer) {
        const rows = await db().jobListing.findMany({ where: { postedBy: discordId, status: { not: 'REMOVED' } }, orderBy: { createdAt: 'desc' }, take: 50 });
        const counts = await Promise.all(rows.map((l: any) => db().jobApplication.count({ where: { listingId: l.id, status: 'PENDING' } })));
        mine = rows.map((l: any, i: number) => listingView(l, { waiting: counts[i] }));
    }
    return { ok: true, data: {
        inServer: !!user,
        isOfficer: !!user?.isOfficer,
        isStaff: !!user?.isStaff,
        applications: apps.map((a: any) => ({ ... appView(a, false), listing: listingsById[a.listingId] ? { id: a.listingId, title: listingsById[a.listingId].title, organisation: listingsById[a.listingId].organisation } : null })),
        listings: mine,
        categories: SITE_SETTINGS.jobCategories,
    } };
};

export const applyJob = async (discordId: string, input: any): Promise<Result> => {
    const l = await db().jobListing.findUnique({ where: { id: clean(input.id, 64) } });
    if(!l || !isOpen(l)) return fail('That listing isn\'t open.');
    if(!l.applyOnSite) return fail('This listing doesn\'t take applications here. See "How to apply".');
    if(l.postedBy === discordId) return fail('You can\'t apply to your own listing.');
    const existing = await db().jobApplication.findFirst({ where: { listingId: l.id, discordId } });
    if(existing && existing.status !== 'WITHDRAWN') return fail('You\'ve already applied.');

    const message = cleanLong(input.message, 1500);
    if(message.length < 20) return fail('Tell them a little about yourself (at least 20 characters).');
    const roblox = await getLinkedRobloxUser(discordId).catch((): null => null);
    if(!roblox) return fail('Your Discord isn\'t linked to a Roblox account yet. Verify in the Yellonia Discord server first.');

    const data = {
        listingId: l.id, discordId, discordName: clean(input.discordName, 60) || 'Discord user',
        robloxUsername: String(roblox.name), robloxUserId: String(roblox.id), message, status: 'PENDING', note: null as string | null, decidedAt: null as Date | null,
    };
    const saved = existing
        ? await db().jobApplication.update({ where: { id: existing.id }, data: { ... data, createdAt: new Date() } })
        : await db().jobApplication.create({ data });
    const number = appNumber(saved.id);
    void dm(l.postedBy, 'New application', `**${roblox.name}** applied to **${l.title}** (${number}). Review it on the job board.`);
    void dm(discordId, 'Application received', `Your application for **${l.title}** (${l.organisation}) was sent.\nYour application number is **${number}**. Use it on the job board to follow it.`);
    return { ok: true, msg: `Application sent. Your application number is ${number}. You'll also get a Discord DM when it's decided.`, data: { number } };
};

/** Public: follow an application by its number (JOB-XXXXXXXX). Shows only the job and the status. */
export const trackJob = async (input: any): Promise<Result> => {
    const m = String(input.number || '').trim().toUpperCase().match(/^(?:JOB-?)?([0-9A-F]{8})$/);
    if(!m) return fail('Application numbers look like JOB-1A2B3C4D.');
    const a = await db().jobApplication.findFirst({ where: { id: { startsWith: m[1].toLowerCase() } } });
    if(!a) return fail('No application has that number. Check it and try again.');
    const l = await db().jobListing.findUnique({ where: { id: a.listingId } });
    return { ok: true, data: { application: {
        number: appNumber(a.id),
        status: a.status,
        statusName: APP_STATUS[a.status] || a.status,
        createdAt: a.createdAt,
        decidedAt: a.decidedAt,
        title: l?.title || 'A removed listing',
        organisation: l?.organisation || '',
    } } };
};

export const withdrawJob = async (discordId: string, input: any): Promise<Result> => {
    const a = await db().jobApplication.findFirst({ where: { id: clean(input.applicationId, 64), discordId } });
    if(!a || a.status !== 'PENDING') return fail('There\'s nothing to withdraw.');
    await db().jobApplication.update({ where: { id: a.id }, data: { status: 'WITHDRAWN' } });
    return { ok: true, msg: 'Application withdrawn.' };
};

// ---------------------------------------------------------------- officers

const readListing = (input: any) => {
    const title = clean(input.title, 80);
    if(title.length < 4) return 'Give the job a title.';
    const organisation = clean(input.organisation, 80);
    if(organisation.length < 2) return 'Say who is hiring (e.g. 1st Army Battalion).';
    const category = clean(input.category, 40);
    if(!SITE_SETTINGS.jobCategories.includes(category)) return 'Pick a category.';
    const description = cleanLong(input.description, 3000);
    if(description.length < 30) return 'Describe the job (at least 30 characters).';
    const requirements = cleanLong(input.requirements, 1500) || null;
    const applyOnSite = input.applyOnSite !== false;
    const howToApply = applyOnSite ? null : cleanLong(input.howToApply, 500);
    if(!applyOnSite && (!howToApply || howToApply.length < 5)) return 'Say how to apply.';
    const days = Math.min(Math.max(Math.floor(Number(input.days) || SITE_SETTINGS.listingDays), 1), 90);
    return { title, organisation, category, description, requirements, applyOnSite, howToApply, closesAt: new Date(Date.now() + days * 86400000) };
};

const officerOrFail = async (discordId: string) => {
    const user = await siteUser(discordId);
    return user?.isOfficer ? user : null;
};

export const postJob = async (discordId: string, input: any): Promise<Result> => {
    const user = await officerOrFail(discordId);
    if(!user) return fail('Only officers can post jobs.');
    const data = readListing(input);
    if(typeof data === 'string') return fail(data);
    const open = await db().jobListing.count({ where: { postedBy: discordId, status: 'OPEN' } });
    if(open >= SITE_SETTINGS.maxOpenListings) return fail(`You can have at most ${SITE_SETTINGS.maxOpenListings} open listings. Close one first.`);
    const l = await db().jobListing.create({ data: { ... data, status: 'OPEN', postedBy: discordId, postedName: user.name } });
    await siteAudit(user, 'Posted job', l.title);
    return { ok: true, msg: 'Listing posted.', data: { id: l.id } };
};

const ownListing = async (user: SiteUser, id: unknown) => {
    const l = await db().jobListing.findUnique({ where: { id: clean(id, 64) } });
    if(!l || l.status === 'REMOVED') return null;
    return l.postedBy === user.discordId || user.isStaff ? l : null;
};

export const updateJob = async (discordId: string, input: any): Promise<Result> => {
    const user = await officerOrFail(discordId);
    if(!user) return fail('Only officers can edit jobs.');
    const l = await ownListing(user, input.id);
    if(!l) return fail('That isn\'t your listing.');
    const data = readListing(input);
    if(typeof data === 'string') return fail(data);
    await db().jobListing.update({ where: { id: l.id }, data: { ... data, status: 'OPEN' } });
    return { ok: true, msg: 'Listing updated.' };
};

export const closeJob = async (discordId: string, input: any): Promise<Result> => {
    const user = await officerOrFail(discordId);
    if(!user) return fail('Only officers can close jobs.');
    const l = await ownListing(user, input.id);
    if(!l) return fail('That isn\'t your listing.');
    await db().jobListing.update({ where: { id: l.id }, data: { status: 'CLOSED' } });
    return { ok: true, msg: 'Listing closed.' };
};

export const jobApplications = async (discordId: string, input: any): Promise<Result> => {
    const user = await officerOrFail(discordId);
    if(!user) return fail('Only officers can see applications.');
    const l = await ownListing(user, input.id);
    if(!l) return fail('That isn\'t your listing.');
    const apps = await db().jobApplication.findMany({ where: { listingId: l.id, status: { not: 'WITHDRAWN' } }, orderBy: { createdAt: 'asc' } });
    return { ok: true, data: { listing: listingView(l), applications: apps.map((a: any) => appView(a, true)) } };
};

export const decideJob = async (discordId: string, input: any): Promise<Result> => {
    const user = await officerOrFail(discordId);
    if(!user) return fail('Only officers can decide applications.');
    const a = await db().jobApplication.findUnique({ where: { id: clean(input.applicationId, 64) } });
    if(!a) return fail('That application doesn\'t exist.');
    const l = await ownListing(user, a.listingId);
    if(!l) return fail('That isn\'t your listing.');
    if(a.status !== 'PENDING') return fail('That application was already decided.');
    const status = input.accept === true ? 'ACCEPTED' : 'DECLINED';
    const note = cleanLong(input.note, 800) || null;
    await db().jobApplication.update({ where: { id: a.id }, data: { status, note, decidedAt: new Date() } });
    void dm(a.discordId, status === 'ACCEPTED' ? 'Application accepted' : 'Application update',
        `Your application **${appNumber(a.id)}** for **${l.title}** (${l.organisation}) was ${status === 'ACCEPTED' ? '**accepted**' : 'not selected this time'}.${note ? `\n\n${note}` : ''}`);
    return { ok: true, msg: status === 'ACCEPTED' ? 'Accepted. They\'ve been told by DM.' : 'Declined. They\'ve been told by DM.' };
};

// ---------------------------------------------------------------- staff

export const removeJob = async (staff: SiteUser, input: any): Promise<Result> => {
    const l = await db().jobListing.findUnique({ where: { id: clean(input.id, 64) } });
    if(!l || l.status === 'REMOVED') return fail('That listing doesn\'t exist.');
    await db().jobListing.update({ where: { id: l.id }, data: { status: 'REMOVED' } });
    await siteAudit(staff, 'Removed job', `${l.title} (by ${l.postedName})`);
    void dm(l.postedBy, 'Job listing removed', `Staff removed your listing **${l.title}**. Contact staff if you have questions.`);
    return { ok: true, msg: 'Listing removed.' };
};

export const openJobCount = async () => (await db().jobListing.findMany({ where: { status: 'OPEN' } })).filter(isOpen).length;
