import { Command } from '../../structures/Command';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { provider } from '../../database';
import { MessageEmbed } from 'discord.js';

class LeaderboardCommand extends Command {
    constructor() {
        super({
            trigger: 'leaderboard',
            description: 'Displays the top 10 users with the most XP.',
            type: 'ChatInput',
            module: 'xp',
            args: [],
        });
    }

    async run(ctx: CommandContext) {
        try {
            // Fetch top 10 users sorted by XP in descending order
            const topUsers = await provider.findManyUsers({
                sort: { xp: -1 }, // Sort by XP descending
                limit: 10,       // Limit to top 10 users
            });

            // Create an embed message
            const embed = new MessageEmbed()
                .setTitle('Top 10 XP Leaderboard')
                .setColor('#FFD700')
                .setTimestamp();

            if (topUsers.length === 0) {
                embed.setDescription('No XP data available.');
            } else {
                let description = '';
                topUsers.forEach((user, index) => {
                    description += `**${index + 1}.** ${user.username} - **${user.xp} XP**\n`;
                });
                embed.setDescription(description);
            }

            // Send the embed to the channel
            await ctx.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error generating leaderboard:', error);
            await ctx.reply({ content: 'An error occurred while fetching the leaderboard. Please try again later.' });
        }
    }
}

export default LeaderboardCommand;
