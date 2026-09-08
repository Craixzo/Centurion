import { robloxClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getXpLeaderboardEmbed, getUnexpectedErrorEmbed, getNoPermissionEmbed } from '../../handlers/locale';

class XPLeaderboardCommand extends Command {
    constructor() {
        super({
            trigger: 'xpleaderboard',
            description: 'Displays the users with the most XP.',
            type: 'ChatInput',
            module: 'xp',
            aliases: [ 'xplb', 'leaderboard' ],
            args: [
                {
                    trigger: 'count',
                    description: 'How many users to show? Defaults to 10, maximum 25.',
                    required: false,
                    type: 'Number',
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
        if(!config.xpSystem.enabled) return ctx.reply({ embeds: [ getNoPermissionEmbed() ] });

        const requested = Number(ctx.args['count']) || 10;
        const limit = Math.min(Math.max(requested, 1), 25);

        try {
            const top = await provider.getTopXp(limit);
            if(top.length === 0) return ctx.reply({ embeds: [ await getXpLeaderboardEmbed([]) ] });

            // One batched lookup rather than one request per entry.
            const users = await robloxClient.getUsersByIds(top.map((entry) => Number(entry.robloxId)));
            const namesById = new Map(users.map((user) => [ user.id, user.name ]));

            const rows = top.map((entry, index) => ({
                position: index + 1,
                robloxId: entry.robloxId,
                name: namesById.get(Number(entry.robloxId)) || entry.robloxId,
                xp: entry.xp,
            }));

            return ctx.reply({ embeds: [ await getXpLeaderboardEmbed(rows) ] });
        } catch (err) {
            console.error('[xpleaderboard]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default XPLeaderboardCommand;
