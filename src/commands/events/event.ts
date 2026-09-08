import { TextChannel } from 'discord.js';
import { discordClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { buildEventEmbed, seedEventReactions } from '../../handlers/events';
import { getUnexpectedErrorEmbed, getEventCreatedEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';

class EventCommand extends Command {
    constructor() {
        super({
            trigger: 'event',
            description: 'Announces a event that members can RSVP to.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'title',
                    description: 'What is the event called?',
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
                    trigger: 'starts',
                    description: 'When does it start? Free text, e.g. "8pm EST" or a Discord timestamp.',
                    required: false,
                    type: 'String',
                },
                {
                    trigger: 'channel',
                    description: 'Where should it be posted? Defaults to this channel.',
                    required: false,
                    type: 'DiscordChannel',
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

        const title = ctx.args['title'] as string;
        const details = (ctx.args['details'] as string) || null;
        const startsAt = (ctx.args['starts'] as string) || null;

        const channelId = typeof ctx.args['channel'] === 'string'
            ? ctx.args['channel']
            : (ctx.args['channel'] as any)?.id;

        try {
            const channel = (channelId
                ? await discordClient.channels.fetch(channelId)
                : ctx.subject.channel) as TextChannel;

            if(!channel || !channel.isTextBased()) {
                return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
            }

            // Post first so we have a message ID, then attach the buttons.
            const draft = { title, details, startsAt, closed: false };
            const message = await channel.send({
                embeds: [ await buildEventEmbed(draft, []) ],
            });

            const event = await provider.createEvent({
                guildId: ctx.guild.id,
                channelId: channel.id,
                messageId: message.id,
                title,
                details,
                startsAt,
                hostId: ctx.user.id,
            });

            await message.edit({ embeds: [ await buildEventEmbed(event, []) ] });
            await seedEventReactions(message);

            logAction('Event Created' as any, ctx.user, `${title} (${event.id})`);

            return ctx.reply({ embeds: [ await getEventCreatedEmbed(event, message.url) ] });
        } catch (err) {
            console.error('[event]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default EventCommand;
