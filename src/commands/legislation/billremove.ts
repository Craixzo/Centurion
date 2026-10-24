import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { removeBill, LEGISLATION_SETTINGS } from '../../handlers/legislation';

class BillRemoveCommand extends Command {
    constructor() {
        super({
            trigger: 'bill-remove',
            description: 'Removes a bill from the website. Use this for mistakes; failed bills can stay listed as Failed.',
            type: 'ChatInput',
            module: 'legislation',
            args: [
                { trigger: 'number', description: 'The number of the bill to remove.', required: true, type: 'String' },
            ],
            permissions: [
                { type: 'role', ids: [ ...(config.permissions.admin || []), ...LEGISLATION_SETTINGS.clerkRoleIds ].filter(Boolean), value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const result = await removeBill(String(ctx.args['number'] || ''));
            if(result.ok === false) {
                return ctx.reply({ embeds: [ new EmbedBuilder().setColor(redColor).setAuthor({ name: 'Bill Not Removed', iconURL: xmarkIconUrl }).setDescription(result.reason) ] });
            }
            logAction('Bill Removed' as any, ctx.user, `Bill ${result.bill.number}: ${result.bill.title}`);
            return ctx.reply({ embeds: [
                new EmbedBuilder().setColor(greenColor).setAuthor({ name: 'Bill Removed', iconURL: checkIconUrl })
                    .setDescription(`**Bill ${result.bill.number}: ${result.bill.title}** was removed from the website.`),
            ] });
        } catch (err) {
            console.error('[bill-remove]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BillRemoveCommand;
