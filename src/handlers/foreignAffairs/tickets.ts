import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    CategoryChannel,
    ChannelType,
    Client,
    EmbedBuilder,
    Guild,
    Message,
    MessageComponentInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    OverwriteResolvable,
    PermissionFlagsBits,
    PermissionsBitField,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    StringSelectMenuOptionBuilder,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { FOREIGN_AFFAIRS_SETTINGS as S, ForeignAffairsOption } from './settings';

/**
 * Foreign Affairs tickets: a dropdown panel in the foreign affairs server.
 *
 *   Pick an option   -> modal asks for the group's name (plus optional link and details)
 *   Submit           -> private channel in the embassy or event category
 *                       (nationname-embassy / event-req-groupname)
 *   Close button     -> transcript to the transcript channel and delete,
 *                       or lock and keep if no transcript channel is set
 *
 * Custom IDs all start with "fa:". Open tickets are tracked by a marker in the
 * channel topic (fa|userId|optionKey), so no database is needed.
 */

const SELECT_ID = 'fa:select';
const CLOSE_ID = 'fa:close';
const CLOSE_CONFIRM_ID = 'fa:close:confirm';
const MODAL_PREFIX = 'fa:modal:';

const OPEN_MARKER = /fa\|(\d+)\|([\w-]+)/;

const MEMBER_ALLOW = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
];

// ---------------------------------------------------------------- emojis

/** Application emojis by name, loaded on startup. */
let appEmojis = new Map<string, { id: string; name: string; animated: boolean }>();

const loadEmojis = async (client: Client) => {
    try {
        const emojis = await client.application.emojis.fetch();
        appEmojis = new Map(emojis.map((e) => [ e.name, { id: e.id, name: e.name, animated: !!e.animated } ]));
    } catch (err) {
        console.error('[foreign affairs] could not load application emojis:', err);
    }
};

const emojiFor = (option: ForeignAffairsOption) => appEmojis.get(option.emoji) || null;

const emojiText = (option: ForeignAffairsOption) => {
    const e = emojiFor(option);
    return e ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}> ` : '';
};

// ---------------------------------------------------------------- panel

const findOption = (key: string) => S.options.find((o) => o.key === key) || null;

const panelEmbed = () => new EmbedBuilder()
    .setColor(S.panelColor)
    .setTitle(S.panelTitle)
    .setDescription(S.panelDescription);

const panelComponents = () => {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder(S.placeholder)
        .addOptions(S.options.slice(0, 25).map((option) => {
            const built = new StringSelectMenuOptionBuilder()
                .setLabel(option.label.slice(0, 100))
                .setValue(option.key)
                .setDescription(option.description.slice(0, 100));
            const emoji = emojiFor(option);
            if(emoji) built.setEmoji(emoji);
            return built;
        }));
    return [ new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) ];
};

/** Posts the panel, or edits Centurion's existing one so restarts don't duplicate it. */
const postPanel = async (client: Client) => {
    try {
        const channel: any = await client.channels.fetch(S.panelChannelId).catch((): null => null);
        if(!channel || !channel.isTextBased()) {
            console.error('[foreign affairs] panel channel not found:', S.panelChannelId);
            return;
        }
        const recent = await channel.messages.fetch({ limit: 50 });
        const existing = recent.find((m: Message) => m.author.id === client.user.id
            && m.components.some((row: any) => row.components?.some((c: any) => c.customId === SELECT_ID)));
        const payload = { embeds: [ panelEmbed() ], components: panelComponents() };
        if(existing) await existing.edit(payload);
        else await channel.send(payload);
    } catch (err) {
        console.error('[foreign affairs] could not post the panel:', err);
    }
};

// ---------------------------------------------------------------- helpers

const slug = (text: string) => text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'group';

const channelNameFor = (option: ForeignAffairsOption, groupName: string) => option.kind === 'embassy'
    ? `${slug(groupName)}-embassy`
    : `event-req-${slug(groupName)}`;

const openTicketsOf = (guild: Guild, userId: string) => guild.channels.cache.filter((c) => {
    if(c.type !== ChannelType.GuildText) return false;
    if(!Object.values(S.categoryIds).includes(c.parentId || '')) return false;
    const match = (c as TextChannel).topic?.match(OPEN_MARKER);
    return !!match && match[1] === userId;
}).map((c) => c as TextChannel);

const ticketInfo = (channel: any): { userId: string; key: string } | null => {
    const match = channel?.topic?.match?.(OPEN_MARKER);
    return match ? { userId: match[1], key: match[2] } : null;
};

const closeRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CLOSE_ID).setStyle(ButtonStyle.Danger).setLabel('Close ticket'),
);

// ---------------------------------------------------------------- select -> modal

const handleSelect = async (interaction: StringSelectMenuInteraction) => {
    const option = findOption(interaction.values[0]);
    if(!option) {
        await interaction.reply({ content: 'That option no longer exists.', flags: MessageFlags.Ephemeral });
        return;
    }
    if(option.comingSoon) {
        await interaction.reply({ content: `**${option.label}** isn't open for requests yet. Check back soon.`, flags: MessageFlags.Ephemeral });
        return resetPanel(interaction);
    }
    if(openTicketsOf(interaction.guild, interaction.user.id).length >= S.maxOpenPerUser) {
        await interaction.reply({ content: `You already have ${S.maxOpenPerUser} open requests. Finish or close one first.`, flags: MessageFlags.Ephemeral });
        return resetPanel(interaction);
    }

    const isEmbassy = option.kind === 'embassy';
    const modal = new ModalBuilder()
        .setCustomId(MODAL_PREFIX + option.key)
        .setTitle(option.label.slice(0, 45))
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
                .setCustomId('group')
                .setLabel(isEmbassy ? 'Nation or clan name' : 'Your group\'s name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(50)),
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
                .setCustomId('link')
                .setLabel('Group link (Roblox group or Discord invite)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(200)),
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
                .setCustomId('details')
                .setLabel(isEmbassy ? 'Tell us about your group' : 'Event details')
                .setPlaceholder(isEmbassy
                    ? 'Size, what you do, why you want relations...'
                    : 'Joint training, battle, or other? Game, preferred date and time...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1000)),
        );

    await interaction.showModal(modal);
    await resetPanel(interaction);
};

/** Re-renders the panel so the menu goes back to its placeholder. */
const resetPanel = async (interaction: MessageComponentInteraction) => {
    await interaction.message.edit({ embeds: [ panelEmbed() ], components: panelComponents() }).catch((): null => null);
};

// ---------------------------------------------------------------- modal -> channel

const buildOverwrites = (guild: Guild, category: CategoryChannel | null, userId: string, option: ForeignAffairsOption): OverwriteResolvable[] => {
    const overwrites: OverwriteResolvable[] = [];
    const everyoneId = guild.roles.everyone.id;
    let everyoneSeen = false;

    // Copy the category's permissions, so staff who can see the category see the ticket.
    for(const o of category?.permissionOverwrites.cache.values() || []) {
        const deny = new PermissionsBitField(o.deny);
        if(o.id === everyoneId) {
            deny.add(PermissionFlagsBits.ViewChannel);
            everyoneSeen = true;
        }
        overwrites.push({ id: o.id, type: o.type, allow: o.allow, deny });
    }
    if(!everyoneSeen) overwrites.push({ id: everyoneId, deny: [ PermissionFlagsBits.ViewChannel ] });

    for(const roleId of option.extraRoleIds || []) {
        if(roleId && guild.roles.cache.has(roleId)) overwrites.push({ id: roleId, allow: MEMBER_ALLOW });
    }
    overwrites.push({ id: userId, allow: MEMBER_ALLOW });
    overwrites.push({ id: guild.client.user.id, allow: [ ... MEMBER_ALLOW, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages ] });
    return overwrites;
};

const handleModal = async (interaction: ModalSubmitInteraction) => {
    const option = findOption(interaction.customId.slice(MODAL_PREFIX.length));
    if(!option || option.comingSoon) {
        await interaction.reply({ content: 'That option isn\'t available.', flags: MessageFlags.Ephemeral });
        return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if(openTicketsOf(guild, interaction.user.id).length >= S.maxOpenPerUser) {
        await interaction.editReply(`You already have ${S.maxOpenPerUser} open requests. Finish or close one first.`);
        return;
    }

    const groupName = interaction.fields.getTextInputValue('group').trim();
    const link = interaction.fields.getTextInputValue('link').trim();
    const details = interaction.fields.getTextInputValue('details').trim();

    const categoryId = S.categoryIds[option.kind];
    const category = guild.channels.cache.get(categoryId);
    const parent = category && category.type === ChannelType.GuildCategory ? category as CategoryChannel : null;
    if(!parent) console.error(`[foreign affairs] category ${categoryId} not found, creating without one`);

    let channel: TextChannel;
    try {
        channel = await guild.channels.create({
            name: channelNameFor(option, groupName),
            type: ChannelType.GuildText,
            parent: parent?.id,
            topic: `${option.label} from ${groupName}, opened by ${interaction.user.tag}. fa|${interaction.user.id}|${option.key}`,
            permissionOverwrites: buildOverwrites(guild, parent, interaction.user.id, option),
        });
    } catch (err) {
        console.error('[foreign affairs] could not create ticket channel:', err);
        await interaction.editReply('Something went wrong opening your request. Please let a staff member know.');
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(S.panelColor)
        .setTitle(`${emojiText(option)}${option.label}`)
        .setDescription(`Thanks for reaching out, <@${interaction.user.id}>. Our staff will be with you shortly.`)
        .addFields(
            { name: option.kind === 'embassy' ? 'Nation / clan' : 'Group', value: groupName.slice(0, 1024), inline: true },
            { name: 'Opened by', value: `<@${interaction.user.id}>`, inline: true },
            ... (link ? [ { name: 'Link', value: link.slice(0, 1024) } ] : []),
            ... (details ? [ { name: option.kind === 'embassy' ? 'About' : 'Event details', value: details.slice(0, 1024) } ] : []),
        )
        .setTimestamp(new Date());

    const pings = (option.pingRoleIds || []).filter(Boolean);
    const control = await channel.send({
        content: [ `<@${interaction.user.id}>`, ... pings.map((id) => `<@&${id}>`) ].join(' '),
        embeds: [ embed ],
        components: [ closeRow() ],
        allowedMentions: { users: [ interaction.user.id ], roles: pings },
    });
    await control.pin().catch((): null => null);

    await interaction.editReply(`Your request is open: <#${channel.id}>`);
};

// ---------------------------------------------------------------- close

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

const formatTranscript = (channel: TextChannel, info: { userId: string; key: string }, closedBy: string, messages: Message[]) => {
    const option = findOption(info.key);
    const header = [
        'YELLONIA FOREIGN AFFAIRS TRANSCRIPT',
        `Channel: #${channel.name}`,
        `Type: ${option?.label || info.key}`,
        `Opened by: ${info.userId}`,
        `Closed by: ${closedBy}`,
        `Opened: ${channel.createdAt.toISOString()}`,
        `Closed: ${new Date().toISOString()}`,
        ''.padEnd(60, '-'),
    ];
    const lines = messages.map((message) => {
        const parts = [ message.content ];
        for(const embed of message.embeds) {
            parts.push(`[embed] ${embed.title || ''} ${embed.description || ''}`.trim());
            for(const field of embed.fields) parts.push(`[${field.name}] ${field.value}`);
        }
        for(const attachment of message.attachments.values()) parts.push(`[attachment] ${attachment.url}`);
        return `[${message.createdAt.toISOString()}] ${message.author.tag}: ${parts.filter(Boolean).join(' ')}`;
    });
    return [ ... header, ... lines ].join('\n');
};

const handleClose = async (interaction: ButtonInteraction) => {
    if(!ticketInfo(interaction.channel)) {
        await interaction.reply({ content: 'This ticket is already closed.', flags: MessageFlags.Ephemeral });
        return;
    }
    await interaction.reply({
        content: 'Close this ticket?',
        components: [ new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(CLOSE_CONFIRM_ID).setStyle(ButtonStyle.Danger).setLabel('Yes, close it'),
        ) ],
        flags: MessageFlags.Ephemeral,
    });
};

const handleCloseConfirm = async (interaction: ButtonInteraction) => {
    const channel = interaction.channel as TextChannel;
    const info = ticketInfo(channel);
    if(!info) {
        await interaction.update({ content: 'This ticket is already closed.', components: [] });
        return;
    }
    await interaction.update({ content: 'Closing...', components: [] });
    await channel.send({ content: `Ticket closed by <@${interaction.user.id}>.`, allowedMentions: { parse: [] } }).catch((): null => null);

    const transcriptChannel: any = S.transcriptChannelId
        ? await interaction.client.channels.fetch(S.transcriptChannelId).catch((): null => null)
        : null;

    if(transcriptChannel?.isTextBased()) {
        try {
            const messages = await fetchAllMessages(channel);
            const file = new AttachmentBuilder(Buffer.from(formatTranscript(channel, info, interaction.user.tag, messages), 'utf-8'), {
                name: `${channel.name}.txt`,
            });
            const option = findOption(info.key);
            await transcriptChannel.send({
                embeds: [ new EmbedBuilder().setColor(S.panelColor)
                    .setTitle(`${emojiText(option || ({} as any))}${option?.label || 'Foreign Affairs ticket'}`)
                    .setDescription(`#${channel.name}\nOpened by <@${info.userId}>, closed by <@${interaction.user.id}>.`)
                    .setTimestamp(new Date()) ],
                files: [ file ],
                allowedMentions: { parse: [] },
            });
            await channel.delete('Foreign Affairs ticket closed');
            return;
        } catch (err) {
            console.error('[foreign affairs] transcript failed, keeping the channel instead:', err);
        }
    }

    // No transcript channel (or it failed): keep the channel, locked, for staff.
    await channel.permissionOverwrites.delete(info.userId).catch((): null => null);
    await channel.edit({
        name: `closed-${channel.name}`.slice(0, 100),
        topic: (channel.topic || '').replace(OPEN_MARKER, `fa-closed|${info.userId}|${info.key}`),
    }).catch((err) => console.error('[foreign affairs] could not mark ticket closed:', err));
};

// ---------------------------------------------------------------- entry points

export const handleForeignAffairsInteraction = async (payload: MessageComponentInteraction | ModalSubmitInteraction) => {
    if(!S.enabled || payload.guildId !== S.guildId) return;
    try {
        if(payload.isStringSelectMenu() && payload.customId === SELECT_ID) await handleSelect(payload);
        else if(payload.isModalSubmit() && payload.customId.startsWith(MODAL_PREFIX)) await handleModal(payload);
        else if(payload.isButton() && payload.customId === CLOSE_ID) await handleClose(payload);
        else if(payload.isButton() && payload.customId === CLOSE_CONFIRM_ID) await handleCloseConfirm(payload);
    } catch (err) {
        console.error('[foreign affairs]', err);
        if(payload.isRepliable() && !payload.replied && !payload.deferred) {
            await payload.reply({ content: 'Something went wrong. Please let a staff member know.', flags: MessageFlags.Ephemeral }).catch((): null => null);
        }
    }
};

export const registerForeignAffairs = (client: Client) => {
    if(!S.enabled) return;
    client.once('ready', async () => {
        await loadEmojis(client);
        await postPanel(client);
    });
};
