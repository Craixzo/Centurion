import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getUnexpectedErrorEmbed } from '../../handlers/locale';
import { runTrade } from '../../handlers/economy/trade-command';

class BuyCommand extends Command {
    constructor() {
        super({
            trigger: 'buy',
            description: 'Buys shares with your brokerage balance (deposit Y$ in-game first).',
            type: 'ChatInput',
            module: 'economy',
            args: [
                { trigger: 'ticker', description: 'The corporation\'s ticker, e.g. KLBR.', required: true, type: 'String' },
                { trigger: 'shares', description: 'How many shares.', required: true, type: 'Number' },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            return await runTrade(ctx, true);
        } catch (err) {
            console.error('[buy]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BuyCommand;
