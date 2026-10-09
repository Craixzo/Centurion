import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { setPartySeats, seatsHeld, OPEN_SEATS } from '../../handlers/parliament';

class SeatsSetCommand extends Command {
    constructor() {
        super({
            trigger: 'seats-set',
            description: 'Sets how many Parliament seats a party holds. Creates the party if it is new.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'party',
                    description: 'The party\'s name.',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'seats',
                    description: `How many seats the party holds (0 to ${OPEN_SEATS}).`,
                    required: true,
                    type: 'Number',
                },
                {
                    trigger: 'color',
                    description: 'The party\'s color on the website, as a hex code like #369cd3.',
                    required: false,
                    type: 'String',
                },
            ],
            permissions: [
                { type: 'role', ids: config.permissions.admin, value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const seats = Number(ctx.args['seats']);
            const color = ctx.args['color'] ? String(ctx.args['color']).trim() : undefined;
            const result = await setPartySeats(String(ctx.args['party'] || ''), seats, color);

            if(result.ok === false) {
                return ctx.reply({ embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setAuthor({ name: 'Seats Not Changed', iconURL: xmarkIconUrl })
                        .setDescription(result.reason),
                ] });
            }

            const held = seatsHeld(result.parliament);
            logAction('Parliament Seats' as any, ctx.user, `${result.party.name} set to ${result.party.seats} seat${result.party.seats === 1 ? '' : 's'}`);

            return ctx.reply({ embeds: [
                new EmbedBuilder()
                    .setColor(greenColor)
                    .setAuthor({ name: result.created ? 'Party Added' : 'Seats Updated', iconURL: checkIconUrl })
                    .setDescription(`**${result.party.name}** now holds **${result.party.seats}** seat${result.party.seats === 1 ? '' : 's'}.\n${held} of ${OPEN_SEATS} open seats are held. The website updates within a minute.`),
            ] });
        } catch (err) {
            console.error('[seats-set]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default SeatsSetCommand;
