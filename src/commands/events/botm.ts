import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { mainColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { getHolder, getMode, getShownStandings, monthKeyOf, monthLabel } from '../../handlers/branchOfTheMonth';

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
            const [ holder, shown ] = await Promise.all([ getHolder(), getShownStandings(current) ]);
            const standings = shown.standings;

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
                .addFields({ name: 'Current holder', value: holderText, inline: false });
            // Manual mode has no live count, so the standings field only shows once a month is set.
            if(lines.length) embed.addFields({ name: `${monthLabel(current)} ${shown.decided ? '(final)' : 'so far'}`, value: lines.join('\n'), inline: false });
            if(!lines.length) embed.addFields({ name: `${monthLabel(current)} so far`, value: 'No events logged yet.', inline: false });
            embed.setFooter({ text: await getMode() === 'automatic'
                ? 'Automatic: events are counted and the month closes at midnight on the 1st.'
                : 'Manual: events are logged by staff and the winner is set by hand.' });

            return ctx.reply({ embeds: [ embed ] });
        } catch (err) {
            console.error('[botm]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BotmCommand;
