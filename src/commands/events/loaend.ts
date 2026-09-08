import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getLoaEndedEmbed, getLoaNotFoundEmbed, getNoPermissionEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class LoaEndCommand extends Command {
    constructor() {
        super({
            trigger: 'loaend',
            description: 'Ends a leave of absence early.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'user',
                    description: 'Whose leave? Defaults to your own. Ending someone else\'s needs admin.',
                    required: false,
                    type: 'DiscordUser',
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

        const targetId = typeof ctx.args['user'] === 'string'
            ? ctx.args['user']
            : (ctx.args['user'] as any)?.id || ctx.user.id;

        // Ending someone else's leave is an admin action.
        if(targetId !== ctx.user.id) {
            const isAdmin = ctx.member.roles.cache.some((role) => config.permissions.admin.includes(role.id)
                || config.permissions.all.includes(role.id));
            if(!isAdmin) return ctx.reply({ embeds: [ getNoPermissionEmbed() ] });
        }

        try {
            const loa = await provider.findActiveLoa(ctx.guild.id, targetId);
            if(!loa) return ctx.reply({ embeds: [ getLoaNotFoundEmbed() ] });

            await provider.endLoa(loa.id);
            return ctx.reply({ embeds: [ await getLoaEndedEmbed(loa) ] });
        } catch (err) {
            console.error('[loaend]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default LoaEndCommand;
