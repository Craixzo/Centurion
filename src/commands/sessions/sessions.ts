import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getSessionListEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class SessionsCommand extends Command {
    constructor() {
        super({
            trigger: 'sessions',
            description: 'Lists recent sessions and their IDs.',
            type: 'ChatInput',
            module: 'sessions',
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
            const sessions = await provider.findRecentSessions(ctx.guild.id, 10);
            return ctx.reply({ embeds: [ await getSessionListEmbed(sessions) ] });
        } catch (err) {
            console.error('[sessions]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default SessionsCommand;
