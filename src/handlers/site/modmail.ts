import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message, MessageComponentInteraction } from 'discord.js';
import { discordClient } from '../../main';
import { provider } from '../../database';
import { NEWS_SETTINGS } from '../news/settings';
import { SITE_SETTINGS } from './settings';
import { db, fail, clean, cleanLong, Result, siteUser, SiteUser, siteAudit } from './common';

/**
 * Modmail: anyone can message Yellonia staff privately, by DMing Centurion
 * or from contact.html on the website. Each conversation gets a number
 * (MM-0001) and, if a modmail channel is set, its own thread in that channel.
 *
 *   Person DMs Centurion        -> asked to confirm, then a conversation opens
 *   Person writes on the site   -> same conversation, shown in the thread
 *   Staff write in the thread   -> sent to the person by DM, and shown on the site
 *   Staff reply on the site     -> same, and copied into the thread
 *
 * Staff messages in the thread starting with SITE_SETTINGS.modmailNotePrefix
 * stay internal. People in an active recruitment request are left alone:
 * their DMs belong to the recruitment system.
 */

const STATUS_NAMES: Record<string, string> = { OPEN: 'Open', CLOSED: 'Closed' };
const MAX_BODY = 3000;

// ---------------------------------------------------------------- helpers

const nextNumber = async () => {
    const latest = await db().modmailThread.findMany({ orderBy: { number: 'desc' }, take: 1 });
    const n = latest.length ? Number(String(latest[0].number).slice(3)) + 1 : 1;
    return 'MM-' + String(n).padStart(4, '0');
};

const threadView = (t: any, withMessages: any[] | null, forStaff: boolean) => ({
    id: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    statusName: STATUS_NAMES[t.status] || t.status,
    waiting: t.status === 'OPEN' && t.lastFrom === 'USER',
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    closedAt: t.closedAt,
    ... (forStaff ? { discordId: t.discordId, discordName: t.discordName, discordThread: !!t.channelId } : {}),
    ... (withMessages ? { messages: withMessages.filter((m) => forStaff || !m.internal).map((m) => ({
        id: m.id,
        fromStaff: m.fromStaff,
        internal: m.internal,
        authorName: m.fromStaff && !forStaff ? 'Yellonia staff' : m.authorName,
        body: m.body,
        source: m.source,
        createdAt: m.createdAt,
    })) } : {}),
});

const messagesOf = (threadId: string) => db().modmailMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });

const attachmentText = (message: Message) => {
    const urls = [ ... message.attachments.values() ].map((a) => a.url);
    return urls.length ? '\n\n' + urls.join('\n') : '';
};

const getModmailChannel = async (): Promise<any> => {
    if(!SITE_SETTINGS.modmailChannelId) return null;
    try {
        const channel: any = await discordClient.channels.fetch(SITE_SETTINGS.modmailChannelId);
        return channel && channel.isTextBased() && channel.threads ? channel : null;
    } catch {
        return null;
    }
};

const getDiscordThread = async (t: any): Promise<any> => {
    if(!t.channelId) return null;
    try {
        const thread: any = await discordClient.channels.fetch(t.channelId);
        if(thread?.archived) await thread.setArchived(false).catch((): null => null);
        return thread;
    } catch {
        return null;
    }
};

const closeButtons = (t: any) => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`modmail:close:${t.id}`).setStyle(ButtonStyle.Secondary).setLabel('Close conversation'),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open on the website').setURL(`${NEWS_SETTINGS.siteUrl}/staff.html#modmail/${encodeURIComponent(t.id)}`),
);

/** Copies a message into the conversation's Discord thread, creating the thread the first time. */
const mirror = async (t: any, embed: EmbedBuilder) => {
    try {
        let thread = await getDiscordThread(t);
        if(!thread) {
            const channel = await getModmailChannel();
            if(!channel) return;
            const starter = await channel.send({
                content: SITE_SETTINGS.modmailPingRoleId ? `<@&${SITE_SETTINGS.modmailPingRoleId}>` : undefined,
                embeds: [ new EmbedBuilder().setColor(0xbed215)
                    .setTitle(`${t.number}: ${t.subject}`)
                    .setDescription(`From **${t.discordName}** (<@${t.discordId}>).\nWrite in the thread to reply by DM. Start a message with \`${SITE_SETTINGS.modmailNotePrefix}\` to keep it internal.`)
                    .setTimestamp(new Date(t.createdAt)) ],
                components: [ closeButtons(t) ],
                allowedMentions: { roles: SITE_SETTINGS.modmailPingRoleId ? [ SITE_SETTINGS.modmailPingRoleId ] : [] },
            });
            thread = await starter.startThread({ name: `${t.number} ${t.discordName}`.slice(0, 90), autoArchiveDuration: 10080 });
            await db().modmailThread.update({ where: { id: t.id }, data: { channelId: thread.id } });
            t.channelId = thread.id;
        }
        await thread.send({ embeds: [ embed ], allowedMentions: { parse: [] } });
    } catch (err) {
        console.error(`[modmail] couldn't post in the Discord thread for ${t.number}`, err);
    }
};

const userEmbed = (name: string, body: string, source: string) => new EmbedBuilder()
    .setColor(0x3f95ce).setAuthor({ name: `${name}${source === 'WEB' ? ' (website)' : ''}` })
    .setDescription(body.slice(0, 4000)).setTimestamp(new Date());

const staffEmbed = (name: string, body: string) => new EmbedBuilder()
    .setColor(0x5bbf49).setAuthor({ name: `${name} (staff, from the website)` })
    .setDescription(body.slice(0, 4000)).setTimestamp(new Date());

/** Sends a staff reply to the person by DM. Returns false if their DMs are closed. */
const dmPerson = async (t: any, body: string) => {
    try {
        const user = await discordClient.users.fetch(t.discordId);
        await user.send({ embeds: [ new EmbedBuilder().setColor(0xbed215)
            .setAuthor({ name: 'Reply from Yellonia staff' })
            .setDescription(body.slice(0, 4000))
            .setFooter({ text: `${t.number} · Reply here, or on the website's Contact page.` })
            .setTimestamp(new Date()) ] });
        return true;
    } catch {
        return false;
    }
};

const dmNotice = async (discordId: string, text: string) => {
    try {
        const user = await discordClient.users.fetch(discordId);
        await user.send({ embeds: [ new EmbedBuilder().setColor(0xbed215).setDescription(text) ] });
    } catch { /* DMs closed */ }
};

const openCount = (discordId: string) => db().modmailThread.count({ where: { discordId, status: 'OPEN' } });

const startThread = async (discordId: string, name: string, subject: string, body: string, source: 'WEB' | 'DISCORD') => {
    const number = await nextNumber();
    const t = await db().modmailThread.create({ data: { number, discordId, discordName: name.slice(0, 60), subject, status: 'OPEN', lastFrom: 'USER' } });
    await db().modmailMessage.create({ data: { threadId: t.id, fromStaff: false, internal: false, authorId: discordId, authorName: name.slice(0, 60), body, source } });
    void mirror(t, userEmbed(name, body, source));
    return t;
};

const addUserMessage = async (t: any, name: string, body: string, source: 'WEB' | 'DISCORD') => {
    await db().modmailMessage.create({ data: { threadId: t.id, fromStaff: false, internal: false, authorId: t.discordId, authorName: name.slice(0, 60), body, source } });
    await db().modmailThread.update({ where: { id: t.id }, data: { lastFrom: 'USER', discordName: name.slice(0, 60) } });
    void mirror(t, userEmbed(name, body, source));
};

const addStaffMessage = async (t: any, staff: SiteUser, body: string, source: 'WEB' | 'DISCORD', internal: boolean) => {
    await db().modmailMessage.create({ data: { threadId: t.id, fromStaff: true, internal, authorId: staff.discordId, authorName: staff.name.slice(0, 60), body, source } });
    if(internal) return true;
    await db().modmailThread.update({ where: { id: t.id }, data: { lastFrom: 'STAFF' } });
    return dmPerson(t, body);
};

const closeThread = async (t: any, staff: SiteUser) => {
    if(t.status === 'CLOSED') return;
    await db().modmailThread.update({ where: { id: t.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await db().modmailMessage.create({ data: { threadId: t.id, fromStaff: true, internal: true, authorId: staff.discordId, authorName: staff.name, body: `Closed by ${staff.name}.`, source: 'SYSTEM' } });
    await siteAudit(staff, 'Closed modmail', t.number);
    void dmNotice(t.discordId, `Your conversation with Yellonia staff (${t.number}) has been closed. Message here again if you need anything else.`);
    const thread = await getDiscordThread(t);
    if(thread) {
        await thread.send({ content: `Closed by ${staff.name}.`, allowedMentions: { parse: [] } }).catch((): null => null);
        await thread.setLocked(true).catch((): null => null);
        await thread.setArchived(true).catch((): null => null);
    }
};

// ---------------------------------------------------------------- website: the person

export const myThreads = async (discordId: string): Promise<Result> => {
    const rows = await db().modmailThread.findMany({ where: { discordId }, orderBy: { updatedAt: 'desc' }, take: 30 });
    return { ok: true, data: { threads: rows.map((t: any) => threadView(t, null, false)) } };
};

export const myThread = async (discordId: string, input: any): Promise<Result> => {
    const t = await db().modmailThread.findFirst({ where: { number: clean(input.number, 12).toUpperCase(), discordId } });
    if(!t) return fail('That conversation doesn\'t exist.');
    return { ok: true, data: { thread: threadView(t, await messagesOf(t.id), false) } };
};

export const sendFromWeb = async (discordId: string, input: any): Promise<Result> => {
    const name = clean(input.discordName, 60) || 'Discord user';
    const body = cleanLong(input.body, MAX_BODY);
    if(body.length < 5) return fail('Write your message (at least 5 characters).');

    if(input.number) {
        const t = await db().modmailThread.findFirst({ where: { number: clean(input.number, 12).toUpperCase(), discordId } });
        if(!t) return fail('That conversation doesn\'t exist.');
        if(t.status !== 'OPEN') return fail('That conversation is closed. Start a new one.');
        await addUserMessage(t, name, body, 'WEB');
        return { ok: true, msg: 'Sent.', data: { number: t.number } };
    }

    const subject = clean(input.subject, 100);
    if(subject.length < 3) return fail('Give it a subject.');
    if(await openCount(discordId) >= SITE_SETTINGS.maxOpenModmail) return fail('You already have open conversations with staff. Reply in one of those instead.');
    const t = await startThread(discordId, name, subject, body, 'WEB');
    return { ok: true, msg: `Sent. Your reference is ${t.number}. Staff replies show up here and in your Discord DMs.`, data: { number: t.number } };
};

// ---------------------------------------------------------------- website: staff

export const inbox = async (staff: SiteUser, input: any): Promise<Result> => {
    const scope = clean(input.scope, 10);
    const where: any = scope === 'closed' ? { status: 'CLOSED' } : scope === 'all' ? {} : { status: 'OPEN' };
    const rows = await db().modmailThread.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 });
    return { ok: true, data: { threads: rows.map((t: any) => threadView(t, null, true)) } };
};

export const staffThread = async (staff: SiteUser, input: any): Promise<Result> => {
    const t = await db().modmailThread.findUnique({ where: { id: clean(input.id, 64) } });
    if(!t) return fail('That conversation doesn\'t exist.');
    return { ok: true, data: { thread: threadView(t, await messagesOf(t.id), true) } };
};

export const staffReply = async (staff: SiteUser, input: any): Promise<Result> => {
    const t = await db().modmailThread.findUnique({ where: { id: clean(input.id, 64) } });
    if(!t) return fail('That conversation doesn\'t exist.');
    if(t.status !== 'OPEN') return fail('That conversation is closed.');
    const body = cleanLong(input.body, MAX_BODY);
    if(body.length < 1) return fail('Write a reply.');
    const internal = input.internal === true;
    const delivered = await addStaffMessage(t, staff, body, 'WEB', internal);
    void mirror(t, internal
        ? new EmbedBuilder().setColor(0x949ba4).setAuthor({ name: `${staff.name} (internal note, website)` }).setDescription(body.slice(0, 4000))
        : staffEmbed(staff.name, body));
    if(internal) return { ok: true, msg: 'Note added.' };
    return { ok: true, msg: delivered ? 'Sent.' : 'Saved, but their Discord DMs are closed: they\'ll only see it on the website.' };
};

export const staffClose = async (staff: SiteUser, input: any): Promise<Result> => {
    const t = await db().modmailThread.findUnique({ where: { id: clean(input.id, 64) } });
    if(!t) return fail('That conversation doesn\'t exist.');
    if(t.status === 'CLOSED') return fail('It\'s already closed.');
    await closeThread(t, staff);
    return { ok: true, msg: `${t.number} closed.` };
};

export const openModmailCount = () => db().modmailThread.count({ where: { status: 'OPEN', lastFrom: 'USER' } });

// ---------------------------------------------------------------- Discord

/** What someone DMed before confirming they want to contact staff. Kept 10 minutes. */
const pending = new Map<string, { body: string; name: string; at: number }>();

/** Someone DMed Centurion. */
export const handleDm = async (message: Message) => {
    if(message.author.bot || message.guild) return;
    // DMs from people in recruitment belong to the recruitment system.
    const inRecruitment = await Promise.resolve((provider as any).findActiveRecruitmentByUser(message.author.id)).catch((): null => null);
    if(inRecruitment) return;

    const body = cleanLong(message.content + attachmentText(message), MAX_BODY);
    if(!body) return;
    const name = message.author.globalName || message.author.username;

    const open = await db().modmailThread.findFirst({ where: { discordId: message.author.id, status: 'OPEN' }, orderBy: { updatedAt: 'desc' } });
    if(open) {
        await addUserMessage(open, name, body, 'DISCORD');
        await message.react('📨').catch((): null => null);
        return;
    }

    pending.set(message.author.id, { body, name, at: Date.now() });
    await message.reply({
        embeds: [ new EmbedBuilder().setColor(0xbed215)
            .setTitle('Message Yellonia staff?')
            .setDescription('This sends your message privately to the Yellonia staff team. They\'ll reply here.') ],
        components: [ new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('modmail:send').setStyle(ButtonStyle.Primary).setLabel('Send to staff'),
            new ButtonBuilder().setCustomId('modmail:cancel').setStyle(ButtonStyle.Secondary).setLabel('Never mind'),
        ) ],
    }).catch((): null => null);
};

/** A message in a modmail thread in the staff channel. */
export const handleThreadMessage = async (message: Message) => {
    if(message.author.bot || !message.guild) return;
    const channel: any = message.channel;
    if(!channel.isThread?.() || channel.parentId !== SITE_SETTINGS.modmailChannelId || !SITE_SETTINGS.modmailChannelId) return;
    const t = await db().modmailThread.findFirst({ where: { channelId: channel.id } });
    if(!t) return;

    const staff = await siteUser(message.author.id);
    if(!staff?.isStaff) return;
    const raw = message.content.trim();
    const internal = raw.startsWith(SITE_SETTINGS.modmailNotePrefix);
    const body = cleanLong((internal ? raw.slice(SITE_SETTINGS.modmailNotePrefix.length) : raw) + attachmentText(message), MAX_BODY);
    if(!body) return;
    if(t.status !== 'OPEN') {
        await message.reply({ content: 'This conversation is closed, so that wasn\'t sent.', allowedMentions: { parse: [] } }).catch((): null => null);
        return;
    }
    const delivered = await addStaffMessage(t, staff, body, 'DISCORD', internal);
    if(!internal) await message.react(delivered ? '✅' : '⚠️').catch((): null => null);
};

export const handleModmailComponent = async (interaction: MessageComponentInteraction) => {
    const [ , action, id ] = interaction.customId.split(':');

    if(action === 'send' || action === 'cancel') {
        const saved = pending.get(interaction.user.id);
        pending.delete(interaction.user.id);
        if(action === 'cancel') return interaction.update({ embeds: [ new EmbedBuilder().setColor(0x949ba4).setDescription('Not sent.') ], components: [] });
        if(!saved || Date.now() - saved.at > 10 * 60 * 1000) {
            return interaction.update({ embeds: [ new EmbedBuilder().setColor(0x949ba4).setDescription('That message expired. Send it again.') ], components: [] });
        }
        if(await openCount(interaction.user.id) >= SITE_SETTINGS.maxOpenModmail) {
            return interaction.update({ embeds: [ new EmbedBuilder().setColor(0xfa5757).setDescription('You already have open conversations with staff.') ], components: [] });
        }
        const subject = clean(saved.body.split('\n')[0], 80) || 'Message from Discord';
        const t = await startThread(interaction.user.id, saved.name, subject, saved.body, 'DISCORD');
        return interaction.update({ embeds: [ new EmbedBuilder().setColor(0x50c790)
            .setTitle(`Sent to staff: ${t.number}`)
            .setDescription('Staff will reply here. Anything else you send in this DM is added to the same conversation.') ], components: [] });
    }

    if(action === 'close') {
        const staff = await siteUser(interaction.user.id);
        if(!staff?.isStaff) return interaction.reply({ content: 'Only staff can close conversations.', ephemeral: true });
        const t = await db().modmailThread.findUnique({ where: { id: String(id || '') } });
        if(!t) return interaction.reply({ content: 'That conversation no longer exists.', ephemeral: true });
        if(t.status === 'CLOSED') return interaction.reply({ content: 'Already closed.', ephemeral: true });
        await interaction.reply({ content: `${t.number} closed by ${staff.name}.`, allowedMentions: { parse: [] } });
        await closeThread(t, staff);
    }
};
