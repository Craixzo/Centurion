import { TextChannel } from 'discord.js';
import { discordClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { buildEventEmbed, seedEventReactions } from '../../handlers/events';
import { parseEventTime } from '../../handlers/eventTime';
import { getUnexpectedErrorEmbed, getEventCreatedEmbed, getEventBadTimeEmbed, getEventBadChannelEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';

const channelChoices = () => (config.eventChannels || []).map((channel) => ({
    name: channel.name,
    value: channel.id,
}));

class EventCommand extends Command {
    constructor() {
        super({
            trigger: 'event',
            description: 'Announces an event that members can RSVP to.',
            type: 'ChatInput',
            module: 'events',
            args: [
                    {
                    trigger: 'category',
                    description: 'What category of event?',
                    required: true,
                    type: 'String',
                    choices: [
                        { name: 'Patrol', value: 'patrol' },
                        { name: 'Tryout', value: 'tryout' },
                        { name: 'Training', value: 'training' },
                        { name: 'Scrimmage', value: 'scrimmage' },
                        { name: 'Operation', value: 'operation' },
                        { name: 'Inspection', value: 'inspection' },
                        { name: 'Other', value: 'other' },
                ],
          },
        {
            trigger: 'type',
            description: 'Which specific event type?',
            required: true,
            type: 'String',
            autocomplete: true,
        },
        {
            trigger: 'title',
            description: 'What is the event called?',
            required: true,
            type: 'String',
        },
        {
            trigger: 'starts',
            description: 'When? e.g. 8pm, 20:00, 2026-09-12 20:00, in 2h',
            required: true,
            type: 'String',
        },
        {
            trigger: 'game',
            description: 'Link to the Roblox game or private server.',
            required: true,
            type: 'String',
        },
        {
            trigger: 'details',
            description: 'Any extra information for attendees.',
            required: false,
            type: 'String',
        },
        {
            trigger: 'ping',
            description: 'Role to ping when announcing the event.',
            required: true,
            type: 'DiscordRole',
        },
        {
            trigger: 'channel',
            description: 'Where should it be posted? Defaults to this channel.',
            required: false,
            type: 'String',
            choices: channelChoices(),
        },
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.users,
                    value: true,
                },
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!ctx.guild) return ctx.reply({ content: 'This command only works inside a server.' });

        const eventType = ctx.args['type'] as string;
        const title = ctx.args['title'] as string;
        const details = (ctx.args['details'] as string) || null;
        const gameLink = (ctx.args['game'] as string) || null;
        const pingRole = ctx.args['ping'] as string | null;
        const pingText = pingRole ? `<@&${pingRole}>` : '';

        const startsAt = parseEventTime(ctx.args['starts'] as string);
        if(!startsAt) return ctx.reply({ embeds: [ getEventBadTimeEmbed() ] });

        const allowed = config.eventChannels || [];
        const requested = ctx.args['channel'] as string;

        if(requested && allowed.length > 0 && !allowed.some((c) => c.id === requested)) {
            return ctx.reply({ embeds: [ getEventBadChannelEmbed() ] });
        }

        try {
            const channel = (requested
                ? await discordClient.channels.fetch(requested)
                : ctx.subject.channel) as TextChannel;

            if(!channel || !channel.isTextBased()) {
                return ctx.reply({ embeds: [ getEventBadChannelEmbed() ] });
            }

            // Post first so we have a message ID, then attach the reactions.
            const draft = { title, details, type: eventType, gameLink, startsAt, closed: false, hostId: ctx.user.id };
            const message = await channel.send({
                   content: pingText || undefined,
                    embeds: [ await buildEventEmbed(draft, []) ]
            });

            const event = await provider.createEvent({
                guildId: ctx.guild.id,
                channelId: channel.id,
                messageId: message.id,
                title,
                details,
                type: eventType,
                gameLink,
                startsAt,
                hostId: ctx.user.id,
            });

            await message.edit({ embeds: [ await buildEventEmbed(event, []) ] });
            await seedEventReactions(message);

            logAction('Event Created' as any, ctx.user, `${eventType}: ${title} (${event.id})`);
            return ctx.reply({ embeds: [ await getEventCreatedEmbed(event, message.url) ] });
        } catch (err) {
            console.error('[event]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default EventCommand;
