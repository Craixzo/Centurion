import { EmbedBuilder, Guild, GuildMember, Message, TextChannel } from 'discord.js';
import { mainColor } from '../locale';
import { discordClient } from '../../main';
import { provider } from '../../database';
import {
    Status,
    CLAIMED_STATUSES,
    OTHER_DIVISION,
    settings,
    isEnabled,
    getBranch,
    getGeneralBranch,
    branchName,
    placedRoleIds,
    canHandleBranch,
    hoursToMs,
} from './common';
import {
    getCandidateDmEmbed,
    getBranchSelectRow,
    getRecruitNoticeDm,
    getTicketEmbed,
    getTicketComponents,
    getNoticeEmbed,
    getNoticeComponents,
    getReminderEmbed,
    getReminderComponents,
} from './views';
import {
    getRecruitmentGuild,
    getTicketChannel,
    createTicketChannel,
    grantOfficerAccess,
    revokeAccess,
    archiveTicket,
} from './tickets';
import { scheduleDashboardUpdate } from './dashboard';

export type Result = { ok: boolean; message: string };
const ok = (message: string): Result => ({ ok: true, message });
const fail = (message: string): Result => ({ ok: false, message });

const UNKNOWN_MEMBER = 10007;

// ---------------------------------------------------------------- helpers

const dmUser = async (userId: string, embed: EmbedBuilder, components: any[] = []): Promise<Message | null> => {
    try {
        const user = await discordClient.users.fetch(userId);
        return await user.send({ embeds: [ embed ], components });
    } catch (err) {
        return null;
    }
};

const postInTicket = async (guild: Guild, request: any, text: string, mention?: string) => {
    const channel = getTicketChannel(guild, request.channelId);
    if(!channel) return;
    await channel.send({
        content: mention ? `<@${mention}>` : undefined,
        embeds: [ new EmbedBuilder().setColor(mainColor).setDescription(text) ],
        allowedMentions: { users: mention ? [ mention ] : [] },
    }).catch((err) => console.error('[recruitment] ticket post:', err));
};

/** Resolves a member, distinguishing "left the server" from a failed fetch. */
const fetchMember = async (guild: Guild, userId: string): Promise<GuildMember | 'gone' | null> => {
    const cached = guild.members.cache.get(userId);
    if(cached) return cached;
    try {
        return await guild.members.fetch(userId);
    } catch (err: any) {
        return err?.code === UNKNOWN_MEMBER ? 'gone' : null;
    }
};

const log = (requestId: string, actorId: string | null, action: string, detail?: string) =>
    provider.logRecruitment(requestId, actorId, action, detail).catch((err) => console.error('[recruitment] log:', err));

/** Re-renders the pinned ticket message and the officer notice. */
export const refreshViews = async (guild: Guild, requestId: string) => {
    const request = await provider.findRecruitment(requestId);
    if(!request) return;

    const channel = getTicketChannel(guild, request.channelId);
    if(channel && request.controlMessageId) {
        const message = await channel.messages.fetch(request.controlMessageId).catch((): null => null);
        if(message) await message.edit({ embeds: [ getTicketEmbed(request) ], components: getTicketComponents(request) }).catch((): null => null);
    }

    if(request.noticeChannelId && request.noticeMessageId) {
        const noticeChannel = guild.channels.cache.get(request.noticeChannelId) as TextChannel | undefined;
        const notice = await noticeChannel?.messages.fetch(request.noticeMessageId).catch((): null => null);
        if(notice) await notice.edit({ embeds: [ getNoticeEmbed(request) ], components: getNoticeComponents(request) }).catch((): null => null);
    }

    scheduleDashboardUpdate();
};

/** Replaces the officer notice with a fresh one, so returned recruits are not buried. */
const postNotice = async (guild: Guild, request: any) => {
    if(request.noticeChannelId && request.noticeMessageId) {
        const oldChannel = guild.channels.cache.get(request.noticeChannelId) as TextChannel | undefined;
        await oldChannel?.messages.delete(request.noticeMessageId).catch((): null => null);
    }

    const branch = getBranch(request.branch) || getGeneralBranch();
    const channelId = branch?.notifyChannelId || getGeneralBranch()?.notifyChannelId;
    const channel = channelId ? guild.channels.cache.get(channelId) as TextChannel | undefined : undefined;
    if(!channel) {
        console.warn(`[recruitment] no notify channel for branch ${request.branch}; request ${request.id} is only on the dashboard.`);
        await provider.updateRecruitment(request.id, { noticeChannelId: null, noticeMessageId: null });
        return;
    }

    const message = await channel.send({ embeds: [ getNoticeEmbed(request) ], components: getNoticeComponents(request) }).catch((err) => {
        console.error('[recruitment] notice:', err);
        return null;
    });
    await provider.updateRecruitment(request.id, { noticeChannelId: channel.id, noticeMessageId: message?.id || null });
};

/** Creates the ticket (if missing) and the officer notice for a request entering the queue. */
const openRequest = async (guild: Guild, requestId: string, ticketNote?: string) => {
    let request = await provider.findRecruitment(requestId);
    if(!request) return;

    if(!getTicketChannel(guild, request.channelId)) {
        const created = await createTicketChannel(guild, request, ticketNote);
        if(created) {
            request = await provider.updateRecruitment(request.id, {
                channelId: created.channel.id,
                controlMessageId: created.controlMessage.id,
            });
        }
    }

    await postNotice(guild, request);
    await refreshViews(guild, request.id);
};

const releaseFields = (flag: string) => ({
    status: Status.Awaiting,
    officerId: null as string | null,
    claimedAt: null as Date | null,
    reminderSentAt: null as Date | null,
    extendedAt: null as Date | null,
    recruitSpoke: false,
    officerSpoke: false,
    flag,
    lastActivityAt: new Date(),
});

// ---------------------------------------------------------------- lifecycle

/** Entry point: the member was given the Military Candidate role. */
export const startRecruitment = async (member: GuildMember, source = 'role'): Promise<void> => {
    if(!isEnabled() || member.user.bot) return;
    if(member.guild.id !== settings().guildId) return;

    if(member.roles.cache.some((role) => placedRoleIds().includes(role.id))) {
        console.log(`[recruitment] ${member.user.tag} already holds a branch or division role; not starting recruitment.`);
        return;
    }

    const request = await provider.createRecruitment({
        guildId: member.guild.id,
        discordId: member.id,
        username: member.user.username,
        displayName: member.displayName,
    });
    if(!request) return; // already has an active request: role re-added, restart, etc.

    await log(request.id, null, 'CREATED', source);

    const dm = await dmUser(member.id, getCandidateDmEmbed(), [ getBranchSelectRow(request.id) ]);
    if(dm) {
        scheduleDashboardUpdate();
        return;
    }

    // DMs closed: straight into the general queue, marked, with a channel so
    // the officer can still reach them.
    const general = getGeneralBranch();
    await provider.updateRecruitment(request.id, {
        dmReachable: false,
        branch: general?.key || null,
        status: Status.Awaiting,
        lastActivityAt: new Date(),
    });
    await log(request.id, null, 'DM_FAILED');
    await openRequest(member.guild, request.id, 'Welcome to the Yellonian Military recruitment process. An officer will help you choose a branch here.');
};

export const selectBranch = async (requestId: string, userId: string, branchKey: string): Promise<Result & { request?: any }> => {
    const guild = await getRecruitmentGuild();
    if(!guild) return fail('Recruitment is not available right now.');
    if(!getBranch(branchKey)) return fail('That branch is no longer available.');

    const request = await provider.findRecruitment(requestId);
    if(!request || request.discordId !== userId) return fail('This recruitment request could not be found.');

    const changed = await provider.updateRecruitmentIf(requestId, { status: Status.PendingBranch }, {
        branch: branchKey,
        status: Status.Awaiting,
        lastActivityAt: new Date(),
    });
    if(!changed) {
        if(!request.activeKey) return fail('This recruitment request is no longer active.');
        return fail(request.channelId
            ? `You have already chosen a branch. Use <#${request.channelId}> to change it or talk to your officer.`
            : 'You have already chosen a branch.');
    }

    await log(requestId, userId, 'BRANCH_SELECTED', branchKey);
    await openRequest(guild, requestId);
    return { ... ok('Branch selected.'), request: await provider.findRecruitment(requestId) };
};

export const claim = async (requestId: string, member: GuildMember): Promise<Result> => {
    const request = await provider.findRecruitment(requestId);
    if(!request || !request.activeKey) return fail('This recruitment request is no longer active.');
    if(!canHandleBranch(member, request.branch)) return fail(`You are not authorized to claim ${branchName(request.branch)} recruits.`);
    if(member.id === request.discordId) return fail('You cannot claim your own recruitment request.');

    const now = new Date();
    // branch is part of the condition so a branch change mid-click cannot slip an
    // officer onto a branch they are not authorized for.
    const claimed = await provider.updateRecruitmentIf(requestId, { status: Status.Awaiting, officerId: null, branch: request.branch }, {
        status: Status.Assigned,
        officerId: member.id,
        claimedAt: now,
        lastActivityAt: now,
        reminderSentAt: null,
        extendedAt: null,
        recruitSpoke: false,
        officerSpoke: false,
        flag: null,
    });
    if(!claimed) {
        const current = await provider.findRecruitment(requestId);
        return fail(current?.officerId ? `This recruit has already been claimed by <@${current.officerId}>.` : 'This recruit can no longer be claimed.');
    }

    const guild = member.guild;
    const channel = getTicketChannel(guild, request.channelId);
    if(channel) await grantOfficerAccess(channel, member.id);

    await log(requestId, member.id, 'CLAIMED');
    await refreshViews(guild, requestId);
    await postInTicket(guild, request, `Your recruitment request has been claimed by <@${member.id}>. They will be assisting you with your military onboarding. Please reply here.`, request.discordId);
    if(request.dmReachable) {
        await dmUser(request.discordId, getRecruitNoticeDm(`Your recruitment request has been claimed by <@${member.id}>. They will be assisting you with your military onboarding.${request.channelId ? `\n\nContinue in <#${request.channelId}>.` : ''}`));
    }
    await dmUser(member.id, getRecruitNoticeDm(`You are now responsible for **${request.username}** (${branchName(request.branch)}).${request.channelId ? `\n\nRecruitment channel: <#${request.channelId}>` : ''}\n\nIf you cannot continue, release the recruit so another officer can help them.`));

    return ok(`You claimed ${request.username}.${request.channelId ? ` Their channel is <#${request.channelId}>.` : ''}`);
};

/**
 * Returns a recruit to the queue. actorId null means the system did it
 * (timeout, LOA, officer left or lost their role).
 */
export const release = async (requestId: string, actorId: string | null, reason: string): Promise<Result> => {
    const request = await provider.findRecruitment(requestId);
    if(!request || !request.activeKey || !request.officerId) return fail('This recruit is not currently claimed.');

    const released = await provider.updateRecruitmentIf(requestId,
        { officerId: request.officerId, status: { in: CLAIMED_STATUSES } },
        releaseFields(`Returned to queue: ${reason}`));
    if(!released) return fail('This recruit is not currently claimed.');

    const guild = await getRecruitmentGuild();
    if(guild) {
        const channel = getTicketChannel(guild, request.channelId);
        if(channel) await revokeAccess(channel, request.officerId);
        await postNotice(guild, await provider.findRecruitment(requestId));
        await refreshViews(guild, requestId);
        await postInTicket(guild, request, 'Your recruitment officer is no longer assigned to your request. Another officer will pick you up shortly. You do not need to do anything.');
    }

    if(actorId !== request.officerId) {
        await dmUser(request.officerId, getRecruitNoticeDm(`**${request.username}** has been released from your care and returned to the recruitment queue.\n\nReason: ${reason}`));
    }

    await log(requestId, actorId, 'RELEASED', reason);
    return ok(`${request.username} has been returned to the ${branchName(request.branch)} queue.`);
};

const STATUS_STEPS: Record<string, { from: string[]; to: string; action: string; text: string }> = {
    training: {
        from: [ Status.Assigned, Status.Contact ],
        to: Status.Training,
        action: 'TRAINING_STARTED',
        text: 'Your training has started. Follow your officer\'s instructions in this channel.',
    },
    ready: {
        from: [ Status.Training ],
        to: Status.Ready,
        action: 'TRAINING_COMPLETED',
        text: 'Your training is complete. Your officer will now place you in a division.',
    },
};

export const advance = async (requestId: string, member: GuildMember, step: 'training' | 'ready'): Promise<Result> => {
    const config = STATUS_STEPS[step];
    const request = await provider.findRecruitment(requestId);
    if(!request || !request.activeKey) return fail('This recruitment request is no longer active.');

    const changed = await provider.updateRecruitmentIf(requestId, { status: { in: config.from } }, {
        status: config.to,
        lastActivityAt: new Date(),
        reminderSentAt: null,
        extendedAt: null,
    });
    if(!changed) return fail('This request has already moved on.');

    await log(requestId, member.id, config.action);
    await refreshViews(member.guild, requestId);
    await postInTicket(member.guild, request, config.text);
    return ok('Status updated.');
};

export const changeBranch = async (requestId: string, member: GuildMember, branchKey: string): Promise<Result> => {
    const branch = getBranch(branchKey);
    if(!branch) return fail('That branch is no longer available.');

    const request = await provider.findRecruitment(requestId);
    if(!request || !request.activeKey) return fail('This recruitment request is no longer active.');
    if(request.branch === branchKey) return fail(`This request is already for ${branch.name}.`);

    const allowed = [ Status.Awaiting, Status.Assigned, Status.Contact ] as string[];
    const officer = request.officerId ? await fetchMember(member.guild, request.officerId) : null;
    const officerKeeps = officer && officer !== 'gone' && canHandleBranch(officer, branchKey);

    const data: any = officerKeeps || !request.officerId
        ? { branch: branchKey, lastActivityAt: new Date(), flag: request.officerId ? null : request.flag }
        : { ... releaseFields(`Branch changed to ${branch.name}`), branch: branchKey };

    const changed = await provider.updateRecruitmentIf(requestId, { status: { in: allowed }, branch: request.branch }, data);
    if(!changed) return fail('The branch can no longer be changed at this stage.');

    await log(requestId, member.id, 'BRANCH_CHANGED', `${request.branch} -> ${branchKey}`);

    const channel = getTicketChannel(member.guild, request.channelId);
    if(request.officerId && !officerKeeps) {
        if(channel) await revokeAccess(channel, request.officerId);
        await dmUser(request.officerId, getRecruitNoticeDm(`**${request.username}** changed to ${branch.name}, which you do not handle. They have been returned to the queue.`));
    }

    const updated = await provider.findRecruitment(requestId);
    if(updated.status === Status.Awaiting) await postNotice(member.guild, updated);
    await refreshViews(member.guild, requestId);
    await postInTicket(member.guild, request, `Requested branch changed to **${branch.name}**.`);
    return ok(`Branch changed to ${branch.name}.`);
};

const applyPlacementRoles = async (guild: Guild, request: any, division: string) => {
    const member = await fetchMember(guild, request.discordId);
    if(!member || member === 'gone') return;

    const branch = getBranch(request.branch);
    const divisionRole = branch?.divisions?.find((entry) => entry.name === division)?.roleId;
    const add = [ branch?.roleId, divisionRole ].filter(Boolean) as string[];

    for(const roleId of add) {
        await member.roles.add(roleId, 'Recruitment completed').catch((err) => console.error(`[recruitment] add role ${roleId}:`, err));
    }
    if(settings().removeCandidateRoleOnComplete && settings().candidateRoleId) {
        await member.roles.remove(settings().candidateRoleId, 'Recruitment completed').catch((err) => console.error('[recruitment] remove candidate role:', err));
    }
};

const summaryEmbed = (request: any): EmbedBuilder => getNoticeEmbed(request).setTitle(`RECRUITMENT ${request.status === Status.Completed ? 'COMPLETED' : 'CLOSED'}: ${request.username}`);

export const complete = async (requestId: string, member: GuildMember, division: string): Promise<Result> => {
    const request = await provider.findRecruitment(requestId);
    if(!request || !request.activeKey) return fail('This recruitment request is no longer active.');

    const branch = getBranch(request.branch);
    if(!branch || branch.general) return fail('Set the recruit\'s branch with Change Branch before completing recruitment.');
    const valid = [ ... (branch.divisions || []).map((entry) => entry.name), OTHER_DIVISION ];
    if(!valid.includes(division)) return fail('That division is not available for this branch.');

    const done = await provider.updateRecruitmentIf(requestId, { status: Status.Ready, officerId: request.officerId }, {
        status: Status.Completed,
        division,
        completedAt: new Date(),
        activeKey: null,
        flag: null,
    });
    if(!done) return fail('This recruit is not ready for placement.');

    await log(requestId, member.id, 'COMPLETED', division);
    const finished = await provider.findRecruitment(requestId);

    await applyPlacementRoles(member.guild, finished, division);
    await dmUser(finished.discordId, getRecruitNoticeDm(`Your recruitment is complete. Welcome to the **${branch.name}**.\n\nDivision: ${division}\nRecruitment officer: <@${member.id}>`));
    await refreshViews(member.guild, requestId);
    await archiveTicket(member.guild, finished, summaryEmbed(finished));
    return ok(`${finished.username} has been placed in ${division}.`);
};

export const close = async (requestId: string, actorId: string | null, reason: string, notifyRecruit = true): Promise<Result> => {
    const request = await provider.findRecruitment(requestId);
    if(!request || !request.activeKey) return fail('This recruitment request is no longer active.');

    const closed = await provider.updateRecruitmentIf(requestId, { activeKey: { not: null } }, {
        status: Status.Closed,
        closeReason: reason,
        closedAt: new Date(),
        activeKey: null,
    });
    if(!closed) return fail('This recruitment request is no longer active.');

    await log(requestId, actorId, 'CLOSED', reason);
    const finished = await provider.findRecruitment(requestId);

    if(notifyRecruit && request.dmReachable) {
        await dmUser(request.discordId, getRecruitNoticeDm(`Your military recruitment request has been closed.\n\nReason: ${reason}\n\nIf you believe this is a mistake, contact a recruitment officer.`));
    }
    if(request.officerId && actorId !== request.officerId) {
        await dmUser(request.officerId, getRecruitNoticeDm(`The recruitment request for **${request.username}** was closed.\n\nReason: ${reason}`));
    }

    const guild = await getRecruitmentGuild();
    if(guild) {
        await refreshViews(guild, requestId);
        await archiveTicket(guild, finished, summaryEmbed(finished));
    }
    return ok(`Request for ${request.username} closed.`);
};

export const continueRecruitment = async (requestId: string, userId: string): Promise<Result> => {
    const request = await provider.findRecruitment(requestId);
    if(!request || !request.activeKey || request.officerId !== userId) return fail('You are no longer assigned to this recruit.');
    if(request.extendedAt) return fail('You have already extended this once. Send a message in the recruitment channel to reset the timer.');

    const now = new Date();
    const extended = await provider.updateRecruitmentIf(requestId, { officerId: userId, extendedAt: null }, { reminderSentAt: now, extendedAt: now });
    if(!extended) return fail('This request has changed. Check the recruitment channel.');

    await log(requestId, userId, 'EXTENDED');
    return ok(`Noted. You have another ${Math.max(settings().autoReleaseHours - settings().reminderHours, 0)} hours before this recruit is returned to the queue.`);
};

// ---------------------------------------------------------------- activity

/** Called for every message in a recruitment channel. */
export const recordActivity = async (message: Message) => {
    if(message.author.bot || !message.guild) return;
    const request = await provider.findRecruitmentByChannel(message.channel.id);
    if(!request) return;

    const isRecruit = message.author.id === request.discordId;
    const isOfficer = message.author.id === request.officerId;
    if(!isRecruit && !isOfficer) return;

    const data: any = { lastActivityAt: new Date(), reminderSentAt: null, extendedAt: null };
    if(request.officerId) {
        if(isRecruit) data.recruitSpoke = true;
        if(isOfficer) data.officerSpoke = true;
    }
    await provider.updateRecruitment(request.id, data);

    const recruitSpoke = request.recruitSpoke || data.recruitSpoke;
    const officerSpoke = request.officerSpoke || data.officerSpoke;
    if(request.status === Status.Assigned && recruitSpoke && officerSpoke) {
        const moved = await provider.updateRecruitmentIf(request.id, { status: Status.Assigned }, { status: Status.Contact });
        if(moved) {
            await log(request.id, null, 'CONTACT_ESTABLISHED');
            await refreshViews(message.guild, request.id);
        }
    }
};

export const recreateTicket = async (guild: Guild, request: any) => {
    const created = await createTicketChannel(guild, request, 'The previous recruitment channel was removed. The recruitment continues here.');
    if(!created) return;
    await provider.updateRecruitment(request.id, { channelId: created.channel.id, controlMessageId: created.controlMessage.id });
    await log(request.id, null, 'CHANNEL_RECREATED');
    await refreshViews(guild, request.id);
};

// ---------------------------------------------------------------- member events

export const handleMemberLeft = async (guildId: string, userId: string) => {
    if(!isEnabled() || guildId !== settings().guildId) return;

    const own = await provider.findActiveRecruitmentByUser(userId);
    if(own) await close(own.id, null, 'Left the server', false);

    for(const request of await provider.findRecruitmentsByOfficer(userId)) {
        await release(request.id, null, 'Officer left the server');
    }
};

/** Releases anything the officer can no longer handle (role removed). */
export const recheckOfficer = async (member: GuildMember) => {
    for(const request of await provider.findRecruitmentsByOfficer(member.id)) {
        if(!canHandleBranch(member, request.branch)) await release(request.id, null, 'Officer no longer authorized for this branch');
    }
};

// ---------------------------------------------------------------- sweep

let caughtUp = false;

const BASELINE_KEY = 'recruitment:baselineHolders';

/** Refuse to DM more than this many people in one catch-up pass. */
const CATCH_UP_LIMIT = 10;

/** Discord IDs that held the role when recruitment was first enabled, or null if not recorded yet. */
export const getBaseline = async (): Promise<Set<string> | null> => {
    const stored = await provider.getMeta(BASELINE_KEY);
    return stored ? new Set<string>(JSON.parse(stored)) : null;
};

/**
 * Members who got the role while the bot was offline and have never had a
 * request. The very first run only records who already holds the role and
 * DMs nobody; those existing holders are handled manually. Later runs skip
 * everyone on that list, and abort entirely if the result looks like a mass DM.
 */
const catchUpMissedCandidates = async (guild: Guild): Promise<void> => {
    const roleId = settings().candidateRoleId;
    if(!roleId) return;

    // Full member fetch so the role's member list is complete. A partial list
    // would leave people off the baseline and get them DMed later.
    try {
        await guild.members.fetch();
    } catch (err) {
        console.error('[recruitment] could not fetch members; skipping catch-up this run.', err);
        caughtUp = false;
        return;
    }

    const role = guild.roles.cache.get(roleId);
    if(!role) {
        console.warn('[recruitment] Military Candidate role not found; check candidateRoleId.');
        return;
    }

    const baseline = await getBaseline();
    if(!baseline) {
        await provider.setMeta(BASELINE_KEY, JSON.stringify([ ... role.members.keys() ]));
        console.log(`[recruitment] baseline recorded: ${role.members.size} existing candidates will not be DMed.`);
        return;
    }

    const missed: GuildMember[] = [];
    for(const member of role.members.values()) {
        if(baseline.has(member.id)) continue;
        if(await provider.hasAnyRecruitment(member.id)) continue;
        missed.push(member);
    }

    if(missed.length > CATCH_UP_LIMIT) {
        console.warn(`[recruitment] catch-up found ${missed.length} candidates, over the limit of ${CATCH_UP_LIMIT}. DMing nobody. Check the role and baseline.`);
        return;
    }

    for(const member of missed) {
        await startRecruitment(member, 'startup catch-up').catch((err) => console.error('[recruitment] catch-up:', err));
    }
};

export const sweep = async () => {
    if(!isEnabled()) return;
    const guild = await getRecruitmentGuild();
    if(!guild) {
        console.warn('[recruitment] recruitment guild not found; check config.recruitment.guildId.');
        return;
    }

    if(!caughtUp) {
        caughtUp = true;
        await catchUpMissedCandidates(guild);
    }

    const now = Date.now();
    const { reminderHours, autoReleaseHours, branchSelectTimeoutHours, releaseOnLoa } = settings();
    const grace = hoursToMs(Math.max(autoReleaseHours - reminderHours, 0));

    const loas = releaseOnLoa
        ? (await provider.findLoasOverlappingGlobal(new Date(now), new Date(now + 1000))).filter((loa: any) => !loa.endedAt)
        : [];
    const onLeave = new Set(loas.map((loa: any) => loa.discordId));

    for(const request of await provider.findActiveRecruitments()) {
        try {
            if(request.status === Status.PendingBranch) {
                if(now - new Date(request.createdAt).getTime() >= hoursToMs(branchSelectTimeoutHours)) {
                    const moved = await provider.updateRecruitmentIf(request.id, { status: Status.PendingBranch }, {
                        status: Status.Awaiting,
                        branch: getGeneralBranch()?.key || null,
                        flag: 'No branch selected',
                        lastActivityAt: new Date(),
                    });
                    if(moved) {
                        await log(request.id, null, 'BRANCH_TIMEOUT');
                        await openRequest(guild, request.id, 'You did not choose a branch, so an officer will help you here.');
                    }
                }
                continue;
            }

            if(request.channelId && !getTicketChannel(guild, request.channelId)) {
                await recreateTicket(guild, request);
            }

            if(!request.officerId || !CLAIMED_STATUSES.includes(request.status)) continue;

            const officer = await fetchMember(guild, request.officerId);
            if(officer === 'gone') {
                await release(request.id, null, 'Officer left the server');
                continue;
            }
            if(officer && !canHandleBranch(officer, request.branch)) {
                await release(request.id, null, 'Officer no longer authorized for this branch');
                continue;
            }
            if(onLeave.has(request.officerId)) {
                await release(request.id, null, 'Officer is on leave of absence');
                continue;
            }

            const idle = now - new Date(request.lastActivityAt).getTime();
            if(!request.reminderSentAt) {
                if(idle >= hoursToMs(reminderHours)) {
                    const sent = await dmUser(request.officerId, getReminderEmbed(request), getReminderComponents(request));
                    if(!sent) await postInTicket(guild, request, 'Reminder: there has been no recent activity on this recruitment. Please continue or release the recruit.', request.officerId);
                    await provider.updateRecruitment(request.id, { reminderSentAt: new Date() });
                    await log(request.id, null, 'REMINDER_SENT');
                }
            } else if(autoReleaseHours > 0 && now - new Date(request.reminderSentAt).getTime() >= grace) {
                await release(request.id, null, 'No activity (automatic release)');
            }
        } catch (err) {
            console.error(`[recruitment] sweep ${request.id}:`, err);
        }
    }

    scheduleDashboardUpdate(0);
};
