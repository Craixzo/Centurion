import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getUnexpectedErrorEmbed } from '../../handlers/locale';
import { runTrade } from '../../handlers/economy/trade-command';

class SellCommand extends Command {
    constructor() {
        super({
            trigger: 'sell',
            description: 'Sells shares. The money goes into your brokerage balance (withdraw it in-game).',
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
            return await runTrade(ctx, false);
        } catch (err) {
            console.error('[sell]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default SellCommand;
