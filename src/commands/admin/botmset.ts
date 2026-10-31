import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { branchChoices, isMonthKey, monthKeyOf, monthLabel, overrideMonth } from '../../handlers/branchOfTheMonth';

class BotmSetCommand extends Command {
    constructor() {
        super({
            trigger: 'botm-set',
            description: 'Sets the Branch of the Month by hand, e.g. to break a tie.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'branch',
                    description: 'The winning branch.',
                    required: true,
                    type: 'String',
                    choices: branchChoices(),
                },
                {
                    trigger: 'events',
                    description: 'How many events the winner hosted. Leave empty to keep the counted number.',
                    required: false,
                    type: 'Number',
                },
                {
                    trigger: 'month',
                    description: 'The month, as YYYY-MM (e.g. 2026-10). Defaults to this month.',
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
            const month = ctx.args['month'] ? String(ctx.args['month']).trim() : monthKeyOf();
            if(!isMonthKey(month) || month > monthKeyOf()) {
                return ctx.reply({ embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setAuthor({ name: 'Not Changed', iconURL: xmarkIconUrl })
                        .setDescription('The month must be this month or an earlier one, written as `YYYY-MM`, like `2026-10`.'),
                ] });
            }

            const rawEvents = ctx.args['events'];
            const events = rawEvents === undefined || rawEvents === null || rawEvents === '' ? undefined : Number(rawEvents);
            if(events !== undefined && (!Number.isInteger(events) || events < 0)) {
                return ctx.reply({ embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setAuthor({ name: 'Not Changed', iconURL: xmarkIconUrl })
                        .setDescription('Events must be a whole number, 0 or more.'),
                ] });
            }

            const result = await overrideMonth(month, String(ctx.args['branch']), events);
            return ctx.reply({ embeds: [
                new EmbedBuilder()
                    .setColor(greenColor)
                    .setAuthor({ name: 'Branch of the Month Set', iconURL: checkIconUrl })
                    .setDescription(`**${result.winners[0].name}** is the Branch of the Month for ${monthLabel(month)} with **${result.winners[0].count}** event${result.winners[0].count === 1 ? '' : 's'} hosted. The website updates within a minute.`),
            ] });
        } catch (err) {
            console.error('[botm-set]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BotmSetCommand;
