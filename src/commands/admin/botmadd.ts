import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { addToTally, branchChoices, branchName, isMonthDecided, monthKeyOf, monthLabel } from '../../handlers/branchOfTheMonth';

/** Logs events toward Branch of the Month by hand, for the current month. */
class BotmAddCommand extends Command {
    constructor() {
        super({
            trigger: 'botm-add',
            description: 'Logs events for a branch toward this month\'s Branch of the Month.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'branch',
                    description: 'The branch that hosted the event.',
                    required: true,
                    type: 'String',
                    choices: branchChoices(),
                },
                {
                    trigger: 'amount',
                    description: 'How many events to add. Defaults to 1. Use a negative number to remove.',
                    required: false,
                    type: 'Number',
                },
            ],
            permissions: [
                { type: 'role', ids: config.permissions.admin, value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const raw = ctx.args['amount'];
            const amount = raw === undefined || raw === null || raw === '' ? 1 : Number(raw);
            if(!Number.isInteger(amount) || amount === 0) {
                return ctx.reply({ embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setAuthor({ name: 'Not Changed', iconURL: xmarkIconUrl })
                        .setDescription('The amount must be a whole number other than 0, like `1`, `3` or `-1`.'),
                ] });
            }

            const month = monthKeyOf();
            const branch = String(ctx.args['branch']);
            const total = await addToTally(month, branch, amount);
            const decided = await isMonthDecided(month);
            logAction('Branch of the Month' as any, ctx.user, `${amount > 0 ? 'Added' : 'Removed'} ${Math.abs(amount)} event${Math.abs(amount) === 1 ? '' : 's'} for ${branchName(branch)} (${monthLabel(month)}: ${total})`);

            return ctx.reply({ embeds: [
                new EmbedBuilder()
                    .setColor(greenColor)
                    .setAuthor({ name: amount > 0 ? 'Events Logged' : 'Events Removed', iconURL: checkIconUrl })
                    .setDescription(`**${branchName(branch)}** now has **${total}** event${total === 1 ? '' : 's'} logged for ${monthLabel(month)}.`
                        + (decided ? `\n\n${monthLabel(month)}'s winner is already set, so this doesn't change it. Run \`/botm-set\` again to update the result.` : '')),
            ] });
        } catch (err) {
            console.error('[botm-add]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BotmAddCommand;
