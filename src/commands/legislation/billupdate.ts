import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { updateBill, billOptionArgs, readBillInput, describeBill, LEGISLATION_SETTINGS } from '../../handlers/legislation';

class BillUpdateCommand extends Command {
    constructor() {
        super({
            trigger: 'bill-update',
            description: 'Changes a bill on the website, e.g. its status or votes. Only the options you fill in change.',
            type: 'ChatInput',
            module: 'legislation',
            args: [
                { trigger: 'number', description: 'The number of the bill to change.', required: true, type: 'String' },
                ...billOptionArgs(true),
            ],
            permissions: [
                { type: 'role', ids: [ ...(config.permissions.admin || []), ...LEGISLATION_SETTINGS.clerkRoleIds ].filter(Boolean), value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const input = readBillInput(ctx.args);
            const result = await updateBill(String(ctx.args['number'] || ''), { ... input, number: undefined });
            if(result.ok === false) {
                return ctx.reply({ embeds: [ new EmbedBuilder().setColor(redColor).setAuthor({ name: 'Bill Not Changed', iconURL: xmarkIconUrl }).setDescription(result.reason) ] });
            }
            logAction('Bill Updated' as any, ctx.user, `Bill ${result.bill.number}: ${result.bill.title}`);
            return ctx.reply({ embeds: [
                new EmbedBuilder().setColor(greenColor).setAuthor({ name: 'Bill Updated', iconURL: checkIconUrl })
                    .setDescription(`${describeBill(result.bill)}\n\nThe website updates within a minute.`),
            ] });
        } catch (err) {
            console.error('[bill-update]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BillUpdateCommand;
