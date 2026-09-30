import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { mainColor, greenColor, redColor } from '../locale';
import {
    Status,
    STATUS_LABELS,
    CLOSE_REASONS,
    OTHER_DIVISION,
    branchName,
    getBranch,
    getBranches,
} from './common';

const colorFor = (status: string): any => {
    if(status === Status.Completed) return greenColor;
    if(status === Status.Closed) return redColor;
    return mainColor;
};

const officerText = (request: any) => request.officerId ? `<@${request.officerId}>` : 'None';

/** Queue note plus the standing DM flag, which survives claims and releases. */
const notesFor = (request: any): string | null => {
    const notes = [ request.flag, request.dmReachable === false ? 'Cannot receive DMs from Centurion' : null ].filter(Boolean);
    return notes.length ? notes.join('\n') : null;
};

const button = (id: string, label: string, style: ButtonStyle = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

const ticketUrl = (request: any) => `https://discord.com/channels/${request.guildId}/${request.channelId}`;

const statusGuidance = (request: any): string => {
    switch(request.status) {
        case Status.Awaiting:
            return 'An officer will claim this recruitment request when available.';
        case Status.Assigned:
            return `${officerText(request)} is your recruitment officer. Send your messages in this channel.`;
        case Status.Contact:
            return 'Contact has been made. Your officer will move you into training.';
        case Status.Training:
            return 'Training is underway. Follow your officer\'s instructions in this channel.';
        case Status.Ready:
            return 'Training is complete. Your officer will place you in a division.';
        case Status.Completed:
            return `Recruitment complete. Placed in ${request.division}.`;
        case Status.Closed:
            return `This recruitment request was closed${request.closeReason ? `: ${request.closeReason}` : '.'}`;
        default:
            return '';
    }
};

// ---------------------------------------------------------------- DM

export const getCandidateDmEmbed = (): EmbedBuilder => new EmbedBuilder()
    .setTitle('YELLONIAN MILITARY RECRUITMENT')
    .setColor(mainColor)
    .setDescription([
        'You have entered the Yellonian Military recruitment process.',
        '',
        'Choose the branch you want to join from the menu below. If you are not sure, choose "I\'m Not Sure" and a recruitment officer will help you decide.',
        '',
        'Once you choose, a private recruitment channel will be opened for you in the server, where an officer will help you through the rest of the process.',
    ].join('\n'))
    .setTimestamp();

export const getBranchSelectRow = (requestId: string, customPrefix = 'recruit:branch', excludeKey?: string) =>
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${customPrefix}:${requestId}`)
            .setPlaceholder('Choose a branch')
            .addOptions(getBranches()
                .filter((branch) => branch.key !== excludeKey)
                .slice(0, 25)
                .map((branch) => ({ label: branch.name, value: branch.key }))),
    );

export const getBranchChosenEmbed = (request: any): EmbedBuilder => new EmbedBuilder()
    .setTitle('YELLONIAN MILITARY RECRUITMENT')
    .setColor(mainColor)
    .setDescription([
        `You chose: **${branchName(request.branch)}**`,
        '',
        request.channelId
            ? `Your recruitment channel is <#${request.channelId}>. Please send your messages there.`
            : 'Your recruitment channel is being set up. You will be notified here when an officer claims your request.',
    ].join('\n'))
    .setTimestamp();

export const getRecruitNoticeDm = (text: string): EmbedBuilder => new EmbedBuilder()
    .setTitle('YELLONIAN MILITARY RECRUITMENT')
    .setColor(mainColor)
    .setDescription(text)
    .setTimestamp();

// ---------------------------------------------------------------- ticket

export const getTicketEmbed = (request: any): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setTitle('YELLONIAN MILITARY RECRUITMENT')
        .setColor(colorFor(request.status))
        .addFields(
            { name: 'Recruit', value: `<@${request.discordId}>`, inline: true },
            { name: 'Requested Branch', value: branchName(request.branch), inline: true },
            { name: 'Status', value: STATUS_LABELS[request.status] || request.status, inline: true },
            { name: 'Recruitment Officer', value: officerText(request), inline: true },
        )
        .setDescription(statusGuidance(request))
        .setFooter({ text: `Request ${request.id.slice(0, 8)}` })
        .setTimestamp();

    if(request.division) embed.addFields({ name: 'Division', value: request.division, inline: true });
    if(notesFor(request)) embed.addFields({ name: 'Note', value: notesFor(request) });
    return embed;
};

export const getTicketComponents = (request: any): ActionRowBuilder<ButtonBuilder>[] => {
    const id = request.id;
    const buttons: ButtonBuilder[] = [];

    switch(request.status) {
        case Status.Awaiting:
            buttons.push(button(`recruit:claim:${id}`, 'Claim Recruit', ButtonStyle.Primary));
            buttons.push(button(`recruit:changebranch:${id}`, 'Change Branch'));
            break;
        case Status.Assigned:
        case Status.Contact:
            buttons.push(button(`recruit:training:${id}`, 'Start Training', ButtonStyle.Primary));
            buttons.push(button(`recruit:changebranch:${id}`, 'Change Branch'));
            buttons.push(button(`recruit:release:${id}`, 'Release Recruit'));
            break;
        case Status.Training:
            buttons.push(button(`recruit:ready:${id}`, 'Training Complete', ButtonStyle.Primary));
            buttons.push(button(`recruit:release:${id}`, 'Release Recruit'));
            break;
        case Status.Ready:
            buttons.push(button(`recruit:complete:${id}`, 'Complete Recruitment', ButtonStyle.Success));
            buttons.push(button(`recruit:release:${id}`, 'Release Recruit'));
            break;
        default:
            return [];
    }

    buttons.push(button(`recruit:close:${id}`, 'Close Request', ButtonStyle.Danger));
    return [ new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) ];
};

// ---------------------------------------------------------------- officer notice

export const getNoticeEmbed = (request: any): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setTitle(`NEW RECRUIT: ${branchName(request.branch).toUpperCase()}`)
        .setColor(colorFor(request.status))
        .addFields(
            { name: 'Recruit', value: `<@${request.discordId}> (${request.username})`, inline: true },
            { name: 'Branch', value: branchName(request.branch), inline: true },
            { name: 'Status', value: STATUS_LABELS[request.status] || request.status, inline: true },
            { name: 'Recruitment Officer', value: officerText(request), inline: true },
        )
        .setTimestamp();

    if(notesFor(request)) embed.addFields({ name: 'Note', value: notesFor(request) });
    if(request.division) embed.addFields({ name: 'Division', value: request.division, inline: true });
    return embed;
};

export const getNoticeComponents = (request: any): ActionRowBuilder<ButtonBuilder>[] => {
    const buttons: ButtonBuilder[] = [];
    if(request.status === Status.Awaiting) {
        buttons.push(button(`recruit:claim:${request.id}`, 'Claim Recruit', ButtonStyle.Primary));
    }
    if(request.channelId && request.status !== Status.Completed && request.status !== Status.Closed) {
        buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open Recruitment Channel').setURL(ticketUrl(request)));
    }
    return buttons.length ? [ new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) ] : [];
};

// ---------------------------------------------------------------- menus

export const getDivisionSelectRow = (request: any) => {
    const divisions = (getBranch(request.branch)?.divisions || []).map((division) => division.name);
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`recruit:division:${request.id}`)
            .setPlaceholder('Choose a division')
            .addOptions([ ... divisions, OTHER_DIVISION ].slice(0, 25).map((name) => ({ label: name, value: name }))),
    );
};

export const getCloseReasonRow = (requestId: string) =>
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`recruit:closereason:${requestId}`)
            .setPlaceholder('Why is this request being closed?')
            .addOptions(CLOSE_REASONS.map((reason) => ({ label: reason, value: reason }))),
    );

// ---------------------------------------------------------------- reminder

export const getReminderEmbed = (request: any): EmbedBuilder => new EmbedBuilder()
    .setTitle('RECRUITMENT REMINDER')
    .setColor(mainColor)
    .setDescription([
        `You claimed **${request.username}** for military recruitment, but there has been no recent activity on the recruitment request.`,
        '',
        'Please continue the recruitment process or release the recruit so another officer can assist them.',
        request.channelId ? `\nRecruitment channel: <#${request.channelId}>` : '',
    ].join('\n'))
    .setTimestamp();

export const getReminderComponents = (request: any) => [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`recruit:continue:${request.id}`, 'Continue Recruitment', ButtonStyle.Primary),
        button(`recruit:release:${request.id}`, 'Release Recruit'),
    ),
];

// ---------------------------------------------------------------- lists

export const describeRequestLine = (request: any): string => {
    const officer = request.officerId ? ` - Officer: <@${request.officerId}>` : '';
    const channel = request.channelId ? ` - <#${request.channelId}>` : '';
    const flag = notesFor(request) ? ` - ${notesFor(request).replace(/\n/g, ', ')}` : '';
    return `<@${request.discordId}> - ${branchName(request.branch)} - ${STATUS_LABELS[request.status]}${officer}${channel}${flag}`;
};

export const getListEmbed = (title: string, requests: any[], empty: string): EmbedBuilder => {
    const lines = requests.slice(0, 30).map(describeRequestLine);
    if(requests.length > 30) lines.push(`...and ${requests.length - 30} more.`);
    return new EmbedBuilder()
        .setTitle(title)
        .setColor(mainColor)
        .setDescription(lines.length ? lines.join('\n') : empty)
        .setTimestamp();
};
