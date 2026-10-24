import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { addBill, billOptionArgs, readBillInput, describeBill, LEGISLATION_SETTINGS } from '../../handlers/legislation';

class BillAddCommand extends Command {
    constructor() {
        super({
            trigger: 'bill-add',
            description: 'Adds a bill to the list of bills on the website.',
            type: 'ChatInput',
            module: 'legislation',
            args: [
                { trigger: 'title', description: 'The bill\'s title.', required: true, type: 'String' },
                ...billOptionArgs(false),
                { trigger: 'number', description: 'The bill\'s number. Leave empty to use the next number.', required: false, type: 'String' },
            ],
            permissions: [
                { type: 'role', ids: [ ...(config.permissions.admin || []), ...LEGISLATION_SETTINGS.clerkRoleIds ].filter(Boolean), value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const result = await addBill(readBillInput(ctx.args));
            if(result.ok === false) {
                return ctx.reply({ embeds: [ new EmbedBuilder().setColor(redColor).setAuthor({ name: 'Bill Not Added', iconURL: xmarkIconUrl }).setDescription(result.reason) ] });
            }
            logAction('Bill Added' as any, ctx.user, `Bill ${result.bill.number}: ${result.bill.title}`);
            return ctx.reply({ embeds: [
                new EmbedBuilder().setColor(greenColor).setAuthor({ name: 'Bill Added', iconURL: checkIconUrl })
                    .setDescription(`${describeBill(result.bill)}\n\nThe website updates within a minute. Use \`/bill-update number:${result.bill.number}\` to change it.`),
            ] });
        } catch (err) {
            console.error('[bill-add]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BillAddCommand;
