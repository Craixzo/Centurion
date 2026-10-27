import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getUnexpectedErrorEmbed } from '../../handlers/locale';
import { companyDetail } from '../../handlers/economy/market';
import { infoEmbed, errorEmbed, price, percent, money, linkButton, linkedRoblox } from '../../handlers/economy/discord';

class StockCommand extends Command {
    constructor() {
        super({
            trigger: 'stock',
            description: 'Shows one corporation on the stock market.',
            type: 'ChatInput',
            module: 'economy',
            args: [
                { trigger: 'ticker', description: 'Its ticker, e.g. KLBR.', required: true, type: 'String' },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const viewer = await linkedRoblox(ctx.user.id);
            const result = await companyDetail(String(ctx.args['ticker'] || ''), '1D', viewer?.robloxId || null);
            if(result.ok === false) return ctx.reply({ embeds: [ errorEmbed('Not Found', result.msg) ] });
            const { company: c, listing } = result.data;

            const embed = infoEmbed()
                .setTitle(`${c.name} (${c.ticker})`)
                .setDescription(c.description || c.typeName)
                .addFields(
                    { name: 'Price', value: `${price(c.price)} (${percent(c.changePct)} today)`, inline: true },
                    { name: 'Status', value: c.stateName, inline: true },
                    { name: 'Type', value: c.typeName, inline: true },
                    { name: 'Shares held', value: `${c.sharesHeld.toLocaleString('en-US')} of ${c.sharesIssued.toLocaleString('en-US')}`, inline: true },
                    { name: 'Treasury', value: money(c.treasury), inline: true },
                    { name: 'Level', value: `${c.levelName} · ${c.memberCount} member${c.memberCount === 1 ? '' : 's'}`, inline: true },
                );
            if(viewer && c.youOwn > 0) embed.addFields({ name: 'You own', value: `${c.youOwn.toLocaleString('en-US')} shares (${money(c.youOwn * c.price)})` });
            if(listing && !listing.met) embed.addFields({ name: 'Before it can list', value: listing.missing.join('\n') });
            return ctx.reply({ embeds: [ embed ], components: [ linkButton('See the chart', `/company.html?t=${encodeURIComponent(c.ticker)}`) ] });
        } catch (err) {
            console.error('[stock]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default StockCommand;
