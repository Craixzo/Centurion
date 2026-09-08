import { discordClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { sendMassDm } from '../../handlers/massDm';
import { getUnexpectedErrorEmbed, getEventDmResultEmbed, getEventNotFoundEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';

class EventDMCommand extends Command {
    constructor() {
        super({
            trigger: 'eventdm',
            description: 'DMs everyone who marked themselves attending a event.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'event-id',
                    description: 'The ID shown when the event was created.',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'message',
                    description: 'What should they be told?',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'close',
                    description: 'Close RSVPs for this event as well?',
                    required: false,
                    type: 'Boolean',
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
        const eventId = ctx.args['event-id'] as string;
        const message = ctx.args['message'] as string;
        const close = Boolean(ctx.args['close']);

        try {
            const event = await provider.findEventById(eventId);
            if(!event) return ctx.reply({ embeds: [ getEventNotFoundEmbed() ] });

            const rsvps = await provider.getRsvps(eventId, true);
            if(rsvps.length === 0) {
                return ctx.reply({ embeds: [ await getEventDmResultEmbed(event, { sent: 0, failed: [], capped: false, total: 0 }) ] });
            }

            const users = [];
            for(const rsvp of rsvps) {
                try {
                    users.push(await discordClient.users.fetch(rsvp.discordId));
                } catch (err) { /* account gone */ }
            }

            const result = await sendMassDm(users, `**${event.title}**\n\n${message}`);

            if(close) await provider.closeEvent(eventId);
            logAction('Event DM' as any, ctx.user, `${event.title} - ${result.sent} sent, ${result.failed.length} failed`);

            try {
                return await ctx.reply({ embeds: [ await getEventDmResultEmbed(event, result) ] });
            } catch (err) {
                console.log(`[eventdm] finished after the interaction expired: ${result.sent} sent.`);
            }
        } catch (err) {
            console.error('[eventdm]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default EventDMCommand;
