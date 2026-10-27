import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { provider } from '../../database';
import { discordClient, robloxClient } from '../../main';
import { NEWS_SETTINGS } from '../news/settings';
import { DES_SETTINGS, DES_ROLES } from './settings';
import { audit, parseRoles, Result } from './auth';
import { addMember } from './members';
import { checkRoles } from './personnel';

/**
 * Recruitment: applications to join the Police or Fire Department.
 *
 * The public form (apply.html, Discord login) sends an application with the
 * person's Roblox username (checked with Roblox) and their answers to the
 * questions in settings.ts. Numbered APP-YYYY-####.
 *
 * Status: PENDING (new) -> REVIEW (being looked at / interview) ->
 *         ACCEPTED (they become a DES member) or DECLINED. The applicant can
 *         WITHDRAW while it's open.
 *
 * Who can do what (each only for their own department, Service Admins for all):
 *   supervisor     see applications, add notes, mark one as in review
 *   local admin    all of that, plus accept (with badge, rank, roles) or decline
 *
 * The applicant sees the status and the message they're sent, never the notes.
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const has = (m: any, ...roles: string[]) => parseRoles(m.roles).some((r) => roles.includes(r));
const deptName = (d: string) => DES_SETTINGS.departments[d]?.name || d;
const deptShort = (d: string) => DES_SETTINGS.departments[d]?.short || d;
const who = (m: any) => `${m.rank} ${m.robloxUsername}`;

export const APP_STATUS: Record<string, string> = { PENDING: 'Received', REVIEW: 'In review', ACCEPTED: 'Accepted', DECLINED: 'Declined', WITHDRAWN: 'Withdrawn' };
const OPEN = [ 'PENDING', 'REVIEW' ];

const isService = (m: any) => has(m, 'service-admin');
const canSee = (m: any, app: any) => isService(m) || (has(m, 'supervisor', 'local-admin') && app.department === m.department);
const canDecide = (m: any, app: any) => isService(m) || (has(m, 'local-admin') && app.department === m.department);
const canReview = (m: any) => has(m, 'supervisor', 'local-admin', 'service-admin');

const questionsFor = (dept: string) => [ ... (DES_SETTINGS.applicationQuestions.all || []), ... (DES_SETTINGS.applicationQuestions[dept] || []) ];

const log = (applicationId: string, kind: string, text: string, actorName: string) =>
    db().desApplicationLog.create({ data: { applicationId, kind, text: text.slice(0, 2000), actorName } });

const nextNumber = async (): Promise<string> => {
    const prefix = `APP-${new Date().getFullYear()}-`;
    const latest = await db().desApplication.findMany({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, take: 1 });
    const n = latest.length ? Number(String(latest[0].number).slice(prefix.length)) + 1 : 1;
    return prefix + String(n).padStart(4, '0');
}

const dm = async (discordId: string, embed: EmbedBuilder, link?: { label: string; url: string }) => {
    try {
        const user = await discordClient.users.fetch(discordId);
        const components = link ? [ new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(link.label).setURL(link.url)) ] : [];
        await user.send({ embeds: [ embed ], components });
    } catch { /* DMs closed: they can still see the result on the website */ }
}

const notify = async (app: any) => {
    const id = DES_SETTINGS.recruitmentChannelId;
    if(!id) return;
    try {
        const channel: any = await discordClient.channels.fetch(id);
        if(!channel || !channel.isTextBased() || typeof channel.send !== 'function') return;
        const embed = new EmbedBuilder().setColor(0xbed215).setTitle(`New application: ${app.number}`)
            .setDescription(`${deptName(app.department)}`).setTimestamp(new Date());
        const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Review it').setURL(`${NEWS_SETTINGS.siteUrl}/des/application.html?id=${encodeURIComponent(app.id)}`));
        await channel.send({ embeds: [ embed ], components: [ button ] });
    } catch (err) {
        console.error(`[des] couldn't post application ${app.number}`, err);
    }
}

const headshot = async (userId: string): Promise<string | null> => {
    try {
        const data: any = await robloxClient.apis.thumbnailsAPI.getUsersAvatarHeadShotImages({ userIds: [ Number(userId) ], size: '150x150', format: 'png', isCircular: false });
        return data?.data?.[0]?.imageUrl || null;
    } catch { return null; }
}

// ---------------------------------------------------------------- public

const publicView = (a: any) => ({
    number: a.number, department: a.department, departmentName: deptName(a.department), robloxUsername: a.robloxUsername,
    status: a.status, statusName: APP_STATUS[a.status] || a.status, createdAt: a.createdAt, decidedAt: a.decidedAt,
    publicNote: [ 'ACCEPTED', 'DECLINED' ].includes(a.status) ? a.publicNote : null,
});

/** Can this Discord account apply right now? null = yes, otherwise why not. */
const blockedReason = async (discordId: string, apps: any[]) => {
    const member = await db().desMember.findUnique({ where: { discordId } });
    if(member && member.status === 'ACTIVE') return 'You\'re already a member of DES.';
    if(apps.some((a) => OPEN.includes(a.status))) return 'You already have an application being looked at.';
    const declined = apps.find((a) => a.status === 'DECLINED' && a.decidedAt);
    if(declined) {
        const until = new Date(new Date(declined.decidedAt).getTime() + DES_SETTINGS.reapplyDays * 86400_000);
        if(until.getTime() > Date.now()) return `You can apply again from ${until.toISOString().slice(0, 10)}.`;
    }
    return null;
}

export const applyStatus = async (discordId: string): Promise<Result> => {
    const apps = await db().desApplication.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { ok: true, data: {
        departments: Object.entries(DES_SETTINGS.departments).map(([ key, d ]) => ({
            key, name: d.name, short: d.short, open: DES_SETTINGS.applicationsOpen[key] !== false, questions: questionsFor(key),
        })),
        applications: apps.map(publicView),
        blocked: await blockedReason(discordId, apps),
    } };
}

export const applySubmit = async (discordId: string, input: any): Promise<Result> => {
    const apps = await db().desApplication.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20 });
    const blocked = await blockedReason(discordId, apps);
    if(blocked) return fail(blocked);

    const department = clean(input.department, 20).toUpperCase();
    if(!DES_SETTINGS.departments[department]) return fail('Pick a department.');
    if(DES_SETTINGS.applicationsOpen[department] === false) return fail(`${deptName(department)} isn't taking applications right now.`);

    const username = clean(input.robloxUsername, 20);
    if(!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail('Enter your Roblox username (3–20 letters, numbers or underscores).');
    let found;
    try { found = await robloxClient.getUsersByUsernames([ username ]); }
    catch { return fail('Couldn\'t reach Roblox to check your username. Try again in a minute.'); }
    const user = (found || [])[0];
    if(!user) return fail(`No Roblox account named "${username}" exists.`);

    const questions = questionsFor(department);
    const given = Array.isArray(input.answers) ? input.answers : [];
    const answers: { q: string; a: string }[] = [];
    for(let i = 0; i < questions.length; i++) {
        const a = cleanLong(given[i], 1500);
        if(a.length < 2) return fail(`Answer question ${i + 1}: "${questions[i]}"`);
        answers.push({ q: questions[i], a });
    }

    const number = await nextNumber();
    const app = await db().desApplication.create({ data: {
        number, discordId, discordName: clean(input.discordName, 60) || 'Discord user',
        robloxUserId: String(user.id), robloxUsername: user.name || username, department,
        answers: JSON.stringify(answers), status: 'PENDING',
    } });
    await log(app.id, 'SYSTEM', `Applied through the website (Discord ${discordId}).`, 'Website');
    void notify(app);
    return { ok: true, msg: `Application sent. Your reference number is ${number}.`, data: { number } };
}

export const applyWithdraw = async (discordId: string, input: any): Promise<Result> => {
    const app = await db().desApplication.findUnique({ where: { number: clean(input.number, 20) } });
    if(!app || app.discordId !== discordId) return fail('That application doesn\'t exist.');
    if(!OPEN.includes(app.status)) return fail('That application is already finished.');
    await db().desApplication.update({ where: { id: app.id }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
    await log(app.id, 'STATUS', 'Withdrawn by the applicant.', app.discordName);
    return { ok: true, msg: 'Application withdrawn.' };
}

// ---------------------------------------------------------------- back-end

const rowView = (a: any) => ({
    id: a.id, number: a.number, department: a.department, departmentShort: deptShort(a.department),
    robloxUsername: a.robloxUsername, discordName: a.discordName, status: a.status, statusName: APP_STATUS[a.status] || a.status,
    reviewedName: a.reviewedName, createdAt: a.createdAt, decidedAt: a.decidedAt,
});

export const listApplications = async (actor: any, input: any): Promise<Result> => {
    if(!canReview(actor)) return fail('Only supervisors and admins can see applications.');
    const scope = clean(input.scope, 10).toLowerCase();
    const statuses = scope === 'decided' ? [ 'ACCEPTED', 'DECLINED', 'WITHDRAWN' ] : scope === 'all' ? Object.keys(APP_STATUS) : OPEN;
    const rows = await db().desApplication.findMany({ where: { status: { in: statuses } }, orderBy: { createdAt: 'desc' }, take: 500 });
    let visible = rows.filter((a: any) => canSee(actor, a));
    const q = clean(input.q, 40).toLowerCase();
    if(q) visible = visible.filter((a: any) => [ a.number, a.robloxUsername, a.discordName ].join(' ').toLowerCase().includes(q));
    return { ok: true, data: {
        applications: visible.slice(0, 300).map(rowView),
        open: Object.fromEntries(Object.keys(DES_SETTINGS.departments).map((k) => [ k, DES_SETTINGS.applicationsOpen[k] !== false ])),
    } };
}

export const getApplication = async (actor: any, input: any): Promise<Result> => {
    const a = await db().desApplication.findUnique({ where: { id: clean(input.id, 64) } });
    if(!a || !canSee(actor, a)) return fail('That application doesn\'t exist, or isn\'t for your department.');
    const logRows = await db().desApplicationLog.findMany({ where: { applicationId: a.id }, orderBy: { createdAt: 'asc' } });
    const earlier = (await db().desApplication.findMany({ where: { discordId: a.discordId }, orderBy: { createdAt: 'desc' } }))
        .filter((x: any) => x.id !== a.id).map(rowView);
    const member = await db().desMember.findUnique({ where: { discordId: a.discordId } });
    const record = await db().desSubject.findUnique({ where: { robloxUserId: a.robloxUserId } });
    let warrants = 0;
    if(record && !record.removed) warrants = (await db().desWarrant.findMany({ where: { subjectId: record.id, status: 'ACTIVE' } })).length;
    return { ok: true, data: {
        application: {
            ... rowView(a), departmentName: deptName(a.department), discordId: a.discordId, robloxUserId: a.robloxUserId,
            avatar: await headshot(a.robloxUserId), answers: JSON.parse(a.answers || '[]'), publicNote: a.publicNote, memberId: a.memberId,
            log: logRows.map((l: any) => ({ id: l.id, kind: l.kind, text: l.text, actorName: l.actorName, createdAt: l.createdAt })),
            earlier,
            existingMember: member ? { id: member.id, status: member.status, badgeId: member.badgeId, rank: member.rank, department: deptShort(member.department), leaveReason: member.leaveReason } : null,
            criminalRecord: record && !record.removed ? { id: record.id, activeWarrants: warrants } : null,
        },
        canDecide: canDecide(actor, a),
        roles: Object.entries(DES_ROLES).map(([ key, name ]) => ({ key, name })),
    } };
}

export const noteApplication = async (actor: any, input: any): Promise<Result> => {
    const a = await db().desApplication.findUnique({ where: { id: clean(input.id, 64) } });
    if(!a || !canSee(actor, a)) return fail('That application doesn\'t exist, or isn\'t for your department.');
    const text = cleanLong(input.text, 2000);
    if(!text) return fail('Write a note.');
    await log(a.id, 'NOTE', text, who(actor));
    await db().desApplication.update({ where: { id: a.id }, data: { updatedAt: new Date() } });
    return { ok: true, msg: 'Note added.' };
}

export const reviewApplication = async (actor: any, input: any): Promise<Result> => {
    const a = await db().desApplication.findUnique({ where: { id: clean(input.id, 64) } });
    if(!a || !canSee(actor, a)) return fail('That application doesn\'t exist, or isn\'t for your department.');
    if(a.status !== 'PENDING') return fail(a.status === 'REVIEW' ? 'It\'s already in review.' : 'That application is already finished.');
    await db().desApplication.update({ where: { id: a.id }, data: { status: 'REVIEW', reviewedBy: actor.id, reviewedName: who(actor) } });
    await log(a.id, 'STATUS', `Marked in review by ${who(actor)}.`, who(actor));
    return { ok: true, msg: `${a.number} is in review.` };
}

export const declineApplication = async (actor: any, input: any): Promise<Result> => {
    const a = await db().desApplication.findUnique({ where: { id: clean(input.id, 64) } });
    if(!a || !canSee(actor, a)) return fail('That application doesn\'t exist, or isn\'t for your department.');
    if(!canDecide(actor, a)) return fail('Only admins of this department can decline applications.');
    if(!OPEN.includes(a.status)) return fail('That application is already finished.');
    const note = cleanLong(input.publicNote, 1000);
    if(note.length < 5) return fail('Write a short message for the applicant; they see it.');
    await db().desApplication.update({ where: { id: a.id }, data: { status: 'DECLINED', publicNote: note, decidedAt: new Date(), reviewedBy: actor.id, reviewedName: who(actor) } });
    await log(a.id, 'STATUS', `Declined. Told the applicant: ${note}`, who(actor));
    await audit(actor.id, 'Application declined', a.number, `${a.robloxUsername} · ${actor.badgeId}`);
    void dm(a.discordId, new EmbedBuilder().setColor(0x9aa3ad).setTitle(`Your ${deptShort(a.department)} application`)
        .setDescription(`Thank you for applying to the ${deptName(a.department)}. This time your application (${a.number}) wasn't successful.\n\n${note}`),
        { label: 'See your application', url: `${NEWS_SETTINGS.siteUrl}/apply.html` });
    return { ok: true, msg: `${a.number} declined.` };
}

/** Accepting adds them to DES (like /des-add) with the badge, rank and roles given here. */
export const acceptApplication = async (actor: any, input: any): Promise<Result> => {
    const a = await db().desApplication.findUnique({ where: { id: clean(input.id, 64) } });
    if(!a || !canSee(actor, a)) return fail('That application doesn\'t exist, or isn\'t for your department.');
    if(!canDecide(actor, a)) return fail('Only admins of this department can accept applications.');
    if(!OPEN.includes(a.status)) return fail('That application is already finished.');
    const existing = await db().desMember.findUnique({ where: { discordId: a.discordId } });
    if(existing && existing.status === 'ACTIVE') return fail(`They're already a member (Badge ${existing.badgeId}).`);
    if(existing && existing.department !== a.department && !isService(actor)) return fail('They used to be in another department; a Service Admin needs to accept this one.');
    const roles = checkRoles(actor, input.roles);
    if(typeof roles === 'string') return fail(roles);

    const result = await addMember(actor.id, {
        discordId: a.discordId, robloxUsername: a.robloxUsername, badgeId: input.badgeId, department: a.department,
        rank: input.rank, unit: input.unit, roles,
    });
    if(result.ok === false) return fail(result.msg.replace(/\*\*/g, ''));
    const member = result.data.member;
    const note = cleanLong(input.publicNote, 1000) || null;
    await db().desApplication.update({ where: { id: a.id }, data: { status: 'ACCEPTED', publicNote: note, decidedAt: new Date(), reviewedBy: actor.id, reviewedName: who(actor), memberId: member.id } });
    await log(a.id, 'STATUS', `Accepted. Added as ${member.rank} ${member.robloxUsername}, Badge ${member.badgeId}.${note ? ` Told the applicant: ${note}` : ''}`, who(actor));
    await audit(actor.id, 'Application accepted', a.number, `${a.robloxUsername} · Badge ${member.badgeId} · ${actor.badgeId}`);
    void dm(a.discordId, new EmbedBuilder().setColor(0x5db54a).setTitle(`Welcome to the ${deptName(a.department)}`)
        .setDescription(`Your application (${a.number}) has been accepted. You're ${member.rank}, Badge ${member.badgeId}.\n\nNext, set your back-end password using your Discord account.${note ? `\n\n${note}` : ''}`),
        { label: 'Set your password', url: `${NEWS_SETTINGS.siteUrl}/des/setup.html` });
    return { ok: true, msg: `${a.robloxUsername} accepted and added as Badge ${member.badgeId}.`, data: { memberId: member.id } };
}

/** For the side menu: new applications waiting, for people who can see them */
export const applicationCounts = async (actor: any) => {
    if(!canReview(actor)) return null;
    const rows = await db().desApplication.findMany({ where: { status: 'PENDING' } });
    return { new: rows.filter((a: any) => canSee(actor, a)).length };
}
