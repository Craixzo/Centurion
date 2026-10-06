import {
    AttachmentBuilder,
    ChannelType,
    EmbedBuilder,
    Guild,
    Message,
    OverwriteResolvable,
    PermissionFlagsBits,
    TextChannel,
} from 'discord.js';
import { discordClient } from '../../main';
import { mainColor } from '../locale';
import { settings, branchName, STATUS_LABELS, mainGuildId, officerGuildId } from './common';
import { getTicketEmbed, getTicketComponents } from './views';

const MEMBER_ALLOW = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
];

const MEMBER_EDIT = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true };

const fetchGuild = async (guildId: string): Promise<Guild | null> => {
    if(!guildId) return null;
    return discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId).catch((): null => null);
};

/** Officer server: ModMail channels, notices, dashboard, transcripts. */
export const getRecruitmentGuild = (): Promise<Guild | null> => fetchGuild(officerGuildId());

/** Main server: Military Candidate role and placement roles. */
export const getMainGuild = (): Promise<Guild | null> => fetchGuild(mainGuildId());

export const getTicketChannel = (guild: Guild, channelId?: string | null): TextChannel | null => {
    if(!channelId) return null;
    const channel = guild.channels.cache.get(channelId);
    return channel && channel.type === ChannelType.GuildText ? channel as TextChannel : null;
};

const channelNameFor = (request: any): string => {
    const base = String(request.username || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
    return `recruit-${base || request.discordId.slice(-6)}`;
};

/**
 * Creates the private channel. Tries the configured category first; if the
 * category is missing or full (50 channels), falls back to no category rather
 * than leaving the recruit without a channel.
 */
export const createTicketChannel = async (guild: Guild, request: any, note?: string): Promise<{ channel: TextChannel; controlMessage: Message } | null> => {
    // The recruit is not in the officer server; they take part through DMs.
    const overwrites: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [ PermissionFlagsBits.ViewChannel ] },
        { id: discordClient.user.id, allow: [ ... MEMBER_ALLOW, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages ] },
    ];
    for(const roleId of settings()?.leadershipRoleIds || []) {
        if(roleId && guild.roles.cache.has(roleId)) overwrites.push({ id: roleId, allow: MEMBER_ALLOW });
    }
    if(request.officerId && guild.members.cache.has(request.officerId)) overwrites.push({ id: request.officerId, allow: MEMBER_ALLOW });

    const base = {
        name: channelNameFor(request),
        type: ChannelType.GuildText as const,
        topic: `Military recruitment for ${request.username}. Request ${request.id}`,
        permissionOverwrites: overwrites,
    };

    const categoryId = settings()?.ticketCategoryId;
    let channel: TextChannel;
    try {
        channel = await guild.channels.create({ ... base, parent: categoryId || undefined });
    } catch (err) {
        if(!categoryId) {
            console.error('[recruitment] could not create recruitment channel:', err);
            return null;
        }
        console.error('[recruitment] category unavailable or full, creating without category:', err);
        try {
            channel = await guild.channels.create(base);
        } catch (err2) {
            console.error('[recruitment] could not create recruitment channel:', err2);
            return null;
        }
    }

    const controlMessage = await channel.send({
        content: note || undefined,
        embeds: [ getTicketEmbed({ ... request, channelId: channel.id }) ],
        components: getTicketComponents({ ... request, channelId: channel.id }),
        allowedMentions: { parse: [] },
    });
    await controlMessage.pin().catch((): null => null);

    return { channel, controlMessage };
};

export const grantOfficerAccess = async (channel: TextChannel, officerId: string) => {
    await channel.permissionOverwrites.edit(officerId, MEMBER_EDIT).catch((err) => console.error('[recruitment] grant access:', err));
};

export const revokeAccess = async (channel: TextChannel, userId: string) => {
    await channel.permissionOverwrites.delete(userId).catch((err) => console.error('[recruitment] revoke access:', err));
};

const fetchAllMessages = async (channel: TextChannel, max = 2000): Promise<Message[]> => {
    const all: Message[] = [];
    let before: string | undefined;
    while(all.length < max) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        if(batch.size === 0) break;
        all.push(... batch.values());
        before = batch.last().id;
        if(batch.size < 100) break;
    }
    return all.reverse();
};

const formatTranscript = (request: any, messages: Message[]): string => {
    const header = [
        'YELLONIAN MILITARY RECRUITMENT TRANSCRIPT',
        `Request: ${request.id}`,
        `Recruit: ${request.username} (${request.discordId})`,
        `Branch: ${branchName(request.branch)}`,
        `Officer: ${request.officerId || 'None'}`,
        `Outcome: ${STATUS_LABELS[request.status]}${request.division ? ` - ${request.division}` : ''}${request.closeReason ? ` - ${request.closeReason}` : ''}`,
        `Opened: ${new Date(request.createdAt).toISOString()}`,
        `Archived: ${new Date().toISOString()}`,
        ''.padEnd(60, '-'),
    ];
    const lines = messages.map((message) => {
        const parts = [ message.content ];
        for(const embed of message.embeds) parts.push(`[embed] ${embed.title || ''} ${embed.description || ''}`.trim());
        for(const attachment of message.attachments.values()) parts.push(`[attachment] ${attachment.url}`);
        return `[${message.createdAt.toISOString()}] ${message.author.tag}: ${parts.filter(Boolean).join(' ')}`;
    });
    return [ ... header, ... lines ].join('\n');
};

/**
 * Posts a transcript to the transcript channel, then deletes the ticket.
 * If the transcript cannot be saved, the channel is kept and locked instead,
 * so conversation history is never lost.
 */
export const archiveTicket = async (guild: Guild, request: any, summary: EmbedBuilder): Promise<boolean> => {
    const channel = getTicketChannel(guild, request.channelId);
    const transcriptChannelId = settings()?.transcriptChannelId;
    const transcriptChannel = transcriptChannelId
        ? await guild.channels.fetch(transcriptChannelId).catch((): null => null) as TextChannel | null
        : null;

    if(!channel) {
        if(transcriptChannel) await transcriptChannel.send({ embeds: [ summary ] }).catch((): null => null);
        return true;
    }

    try {
        if(!transcriptChannel) throw new Error('Transcript channel not configured or not found.');
        const messages = await fetchAllMessages(channel);
        const file = new AttachmentBuilder(Buffer.from(formatTranscript(request, messages), 'utf-8'), {
            name: `recruitment-${request.username}-${request.id.slice(0, 8)}.txt`,
        });
        await transcriptChannel.send({ embeds: [ summary ], files: [ file ] });
        await channel.delete('Recruitment archived');
        return true;
    } catch (err) {
        console.error('[recruitment] transcript failed, keeping channel instead:', err);
        if(request.officerId) await revokeAccess(channel, request.officerId);
        await channel.send({ embeds: [ new EmbedBuilder()
            .setColor(mainColor)
            .setDescription('This request is finished, but the transcript could not be saved, so the channel has been kept for leadership. Check the transcript channel configuration.') ] })
            .catch((): null => null);
        return false;
    }
};
