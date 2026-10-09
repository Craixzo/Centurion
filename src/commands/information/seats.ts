import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { mainColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { getParliament, seatsHeld, OPEN_SEATS, TOTAL_SEATS } from '../../handlers/parliament';

class SeatsCommand extends Command {
    constructor() {
        super({
            trigger: 'seats',
            description: 'Displays which parties hold seats in Parliament.',
            type: 'ChatInput',
            module: 'information',
            aliases: [ 'parliament' ],
            // No permissions block = available to everyone.
        });
    }

    async run(ctx: CommandContext) {
        try {
            const parliament = await getParliament();
            const held = seatsHeld(parliament);
            const unfilled = OPEN_SEATS - held;

            const lines = [ ... parliament.parties ]
                .sort((a, b) => b.seats - a.seats)
                .map((party) => `**${party.name}**: ${party.seats} seat${party.seats === 1 ? '' : 's'}`);
            if(lines.length === 0) lines.push('No parties hold seats.');
            if(unfilled > 0) lines.push(`Open, not yet filled: ${unfilled}`);

            const embed = new EmbedBuilder()
                .setColor(mainColor)
                .setTitle('Parliament of Yellonia')
                .setDescription(lines.join('\n'))
                .setFooter({ text: `${held} of ${OPEN_SEATS} open seats held. ${TOTAL_SEATS} seats in the chamber.` });
            if(parliament.updatedAt) embed.setTimestamp(new Date(parliament.updatedAt));

            return ctx.reply({ embeds: [ embed ] });
        } catch (err) {
            console.error('[seats]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default SeatsCommand;
