import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { removeParty, seatsHeld, OPEN_SEATS } from '../../handlers/parliament';

class SeatsRemoveCommand extends Command {
    constructor() {
        super({
            trigger: 'seats-remove',
            description: 'Removes a party from Parliament. Its seats become open.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'party',
                    description: 'The name of the party to remove.',
                    required: true,
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
            const result = await removeParty(String(ctx.args['party'] || ''));

            if(result.ok === false) {
                return ctx.reply({ embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setAuthor({ name: 'Party Not Removed', iconURL: xmarkIconUrl })
                        .setDescription(result.reason),
                ] });
            }

            const held = seatsHeld(result.parliament);
            logAction('Parliament Seats' as any, ctx.user, `${result.party.name} removed (held ${result.party.seats})`);

            return ctx.reply({ embeds: [
                new EmbedBuilder()
                    .setColor(greenColor)
                    .setAuthor({ name: 'Party Removed', iconURL: checkIconUrl })
                    .setDescription(`**${result.party.name}** has been removed from Parliament.\n${held} of ${OPEN_SEATS} open seats are held. The website updates within a minute.`),
            ] });
        } catch (err) {
            console.error('[seats-remove]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default SeatsRemoveCommand;
