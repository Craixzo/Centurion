import { Command } from '../../structures/Command';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { provider } from '../../database';
import { robloxClient } from '../../main';

class LeaderboardCommand extends Command {
    constructor() {
        super({
            trigger: 'leaderboard',
            aliases: ['lb'], // Support both /leaderboard and /lb
            description: 'Displays the top 10 users with the most XP.',
            type: 'ChatInput',
            module: 'xp',
        });
    }

    async run(ctx: CommandContext) {
        await ctx.defer(); // Handle longer processing

        let users;
        try {
            users = await provider.getTopUsers?.(10);
        } catch (error) {
            console.error('Failed to get top users:', error);
            return ctx.reply({
                content: '❌ An error occurred while fetching the leaderboard.',
                ephemeral: true
            });
        }

        if (!users || users.length === 0) {
            return ctx.reply({
                content: '📭 No users with XP found in the database.',
                ephemeral: true
            });
        }

        const leaderboardLines = await Promise.all(users.map(async (user: any, index: number) => {
            let robloxUser;
            try {
                robloxUser = await robloxClient.getUser(user.id);
            } catch {
                robloxUser = { name: 'Unknown User' };
            }
            return `**${index + 1}.** ${robloxUser.name} — ${user.xp} XP`;
        }));

        await ctx.reply({
            content: `🏆 **Top 10 XP Leaderboard**\n\n${leaderboardLines.join('\n')}`
        });
    }
}

export default LeaderboardCommand;
