import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getEventListEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class EventsCommand extends Command {
    constructor() {
        super({
            trigger: 'events',
            description: 'Lists recent events and their IDs.',
            type: 'ChatInput',
            module: 'events',
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
        try {
            const events = await provider.findRecentEvents(ctx.guild.id, 10);
            return ctx.reply({ embeds: [ await getEventListEmbed(events) ] });
        } catch (err) {
            console.error('[events]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default EventsCommand;
