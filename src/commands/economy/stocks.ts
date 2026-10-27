import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getUnexpectedErrorEmbed } from '../../handlers/locale';
import { listCompanies } from '../../handlers/economy/market';
import { infoEmbed, price, percent, money, linkButton } from '../../handlers/economy/discord';

class StocksCommand extends Command {
    constructor() {
        super({
            trigger: 'stocks',
            description: 'Shows the Yellonia stock market.',
            type: 'ChatInput',
            module: 'economy',
            aliases: [ 'market' ],
            // No permissions block = available to everyone.
        });
    }

    async run(ctx: CommandContext) {
        try {
            const companies = await listCompanies(null);
            const listed = companies.filter((c) => c.state !== 'Raising').slice(0, 15);
            const raising = companies.filter((c) => c.state === 'Raising').slice(0, 5);

            const lines = listed.map((c) => `**${c.ticker}** ${c.name}: ${price(c.price)} (${percent(c.changePct)})${c.state === 'Suspended' ? ' · suspended' : ''}`);
            if(!lines.length) lines.push('Nothing is listed yet.');
            const embed = infoEmbed().setTitle('Yellonia Stock Market').setDescription(lines.join('\n'));
            if(raising.length) {
                embed.addFields({ name: 'Raising (buy in at the IPO price)', value: raising.map((c) => `**${c.ticker}** ${c.name}: ${price(c.price)} · treasury ${money(c.treasury)}`).join('\n') });
            }
            embed.setFooter({ text: 'Change is over the last 24 hours. Trade with /buy and /sell, or on the website.' });
            return ctx.reply({ embeds: [ embed ], components: [ linkButton('Open the market', '/economy.html#stock-market') ] });
        } catch (err) {
            console.error('[stocks]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default StocksCommand;
