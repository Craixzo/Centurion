import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getLoaListEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class LoasCommand extends Command {
    constructor() {
        super({
            trigger: 'loas',
            description: 'Lists everyone currently on leave.',
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
            const loas = await provider.findActiveLoas(ctx.guild.id);
            return ctx.reply({ embeds: [ await getLoaListEmbed(loas) ] });
        } catch (err) {
            console.error('[loas]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default LoasCommand;
