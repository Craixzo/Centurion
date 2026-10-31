import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { mainColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { getHolder, getStandings, monthKeyOf, monthLabel } from '../../handlers/branchOfTheMonth';

class BotmCommand extends Command {
    constructor() {
        super({
            trigger: 'botm',
            description: 'Shows the Branch of the Month and this month\'s event standings.',
            type: 'ChatInput',
            module: 'events',
            aliases: [ 'branchofthemonth' ],
            // No permissions block = available to everyone.
        });
    }

    async run(ctx: CommandContext) {
        try {
            const current = monthKeyOf();
            const [ holder, standings ] = await Promise.all([ getHolder(), getStandings(current) ]);

            const leader = standings[0]?.count || 0;
            const lines = standings.map((entry, index) => {
                const lead = leader > 0 && entry.count === leader ? ' \u{1F451}' : '';
                return `\`${String(index + 1).padStart(2)}\` ${entry.name} - **${entry.count}** event${entry.count === 1 ? '' : 's'}${lead}`;
            });

            const holderText = holder && holder.winners.length
                ? `${holder.winners.map((winner) => `**${winner.name}**`).join(' and ')} (${monthLabel(holder.month)}, ${holder.winners[0].count} events)`
                : 'Not decided yet.';

            const embed = new EmbedBuilder()
                .setColor(mainColor)
                .setTitle('Branch of the Month')
                .addFields(
                    { name: 'Current holder', value: holderText, inline: false },
                    { name: `${monthLabel(current)} so far`, value: lines.join('\n') || 'No branches configured.', inline: false },
                )
                .setFooter({ text: 'Scored on events hosted. The month closes at midnight on the 1st.' });

            return ctx.reply({ embeds: [ embed ] });
        } catch (err) {
            console.error('[botm]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BotmCommand;
