import { CommandContext } from '../../structures/addons/CommandAddons';
import { trade } from './market';
import { errorEmbed, okEmbed, money, linkedRoblox, NOT_LINKED } from './discord';

/** /buy and /sell. Only the person trading sees the reply. */
export const runTrade = async (ctx: CommandContext, buying: boolean) => {
    const user = await linkedRoblox(ctx.user.id);
    if(!user) return ctx.reply({ embeds: [ errorEmbed('Not Linked', NOT_LINKED) ], ephemeral: true } as any);

    const result = await trade(user.robloxId, user.name, ctx.args['ticker'], ctx.args['shares'], buying, 'DISCORD');
    if(result.ok === false) return ctx.reply({ embeds: [ errorEmbed(buying ? 'Not Bought' : 'Not Sold', result.msg) ], ephemeral: true } as any);

    const c = result.data.company;
    return ctx.reply({ embeds: [
        okEmbed(buying ? 'Shares Bought' : 'Shares Sold', result.msg)
            .addFields(
                { name: 'You now own', value: `${c.youOwn.toLocaleString('en-US')} ${c.ticker}`, inline: true },
                { name: 'Brokerage balance', value: money(result.data.cash), inline: true },
            ),
    ], ephemeral: true } as any);
};
