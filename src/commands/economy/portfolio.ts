import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getUnexpectedErrorEmbed } from '../../handlers/locale';
import { portfolio } from '../../handlers/economy/market';
import { infoEmbed, errorEmbed, money, price, linkButton, linkedRoblox, NOT_LINKED } from '../../handlers/economy/discord';

class PortfolioCommand extends Command {
    constructor() {
        super({
            trigger: 'portfolio',
            description: 'Shows your shares, brokerage balance and corporations waiting for payment.',
            type: 'ChatInput',
            module: 'economy',
        });
    }

    async run(ctx: CommandContext) {
        try {
            const user = await linkedRoblox(ctx.user.id);
            if(!user) return ctx.reply({ embeds: [ errorEmbed('Not Linked', NOT_LINKED) ], ephemeral: true } as any);
            const p = await portfolio(user.robloxId);

            const lines = p.holdings.map((h) => `**${h.ticker}** ${h.youOwn.toLocaleString('en-US')} × ${price(h.price)} = ${money(h.youOwn * h.price)}`);
            if(!lines.length) lines.push('You don\'t own any shares yet. Try /stocks.');
            const embed = infoEmbed()
                .setTitle(`${user.name}'s portfolio`)
                .setDescription(lines.join('\n'))
                .addFields(
                    { name: 'Brokerage balance', value: money(p.cash), inline: true },
                    { name: 'Shares worth', value: money(p.holdingsValue), inline: true },
                );
            if(p.pending.length) {
                embed.addFields({ name: 'Waiting for payment', value: p.pending.map((x) => `**${x.ticker}** ${x.name}: ${money(x.cost)}, paid from your Wallet/Bank next time you join the game`).join('\n') });
            }
            embed.setFooter({ text: 'Deposit and withdraw brokerage Y$ in-game.' });
            return ctx.reply({ embeds: [ embed ], components: [ linkButton('Open on the website', '/economy.html#portfolio') ], ephemeral: true } as any);
        } catch (err) {
            console.error('[portfolio]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default PortfolioCommand;
