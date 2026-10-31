import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { mainColor, redColor, xmarkIconUrl, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { branchName, getEventCredits, isMonthKey, monthKeyOf, monthLabel } from '../../handlers/branchOfTheMonth';

/** Lists every event in a month and which branch it counted for, so wrong counts can be traced. */
class BotmCheckCommand extends Command {
    constructor() {
        super({
            trigger: 'botm-check',
            description: 'Lists each event in a month and which branch it counted for.',
            type: 'ChatInput',
            module: 'admin',
            args: [
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
            if(!isMonthKey(month)) {
                return ctx.reply({ embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setAuthor({ name: 'Invalid Month', iconURL: xmarkIconUrl })
                        .setDescription('Write the month as `YYYY-MM`, like `2026-10`.'),
                ] });
            }

            const credits = await getEventCredits(month);
            const lines = credits.map((credit) => {
                const counted = credit.branch ? `**${branchName(credit.branch)}** (by ${credit.reason})` : '*not counted*';
                return `<t:${Math.floor(credit.createdAt.getTime() / 1000)}:d> ${credit.title.slice(0, 40)} · <#${credit.channelId}> · <@${credit.hostId}> → ${counted}`;
            });

            // Discord embeds hold 4096 characters; cut the list there.
            let description = '';
            let shown = 0;
            for(const line of lines) {
                if(description.length + line.length + 30 > 4000) break;
                description += line + '\n';
                shown++;
            }
            if(shown < lines.length) description += `…and ${lines.length - shown} more.`;

            return ctx.reply({ embeds: [
                new EmbedBuilder()
                    .setColor(mainColor)
                    .setTitle(`Events in ${monthLabel(month)}: ${credits.length}`)
                    .setDescription(description || 'No events were recorded this month.')
                    .setFooter({ text: '"by channel" = posted in that branch\'s events channel. "by host role" = posted elsewhere; the host\'s branch role decided it.' }),
            ] });
        } catch (err) {
            console.error('[botm-check]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BotmCheckCommand;
