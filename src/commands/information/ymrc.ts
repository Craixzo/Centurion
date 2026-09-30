import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { provider } from '../../database';
import { YMRC_LEVELS, DEFAULT_YMRC } from '../../resources/ymrc';
import { getYmrcEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class YmrcLevelCommand extends Command {
    constructor() {
        super({
            trigger: 'ymrc-level',
            description: 'Displays the current Yellonia Military Readiness Condition.',
            type: 'ChatInput',
            module: 'information',
            aliases: [ 'ymrc' ],
            // No permissions block = available to everyone.
        });
    }

    async run(ctx: CommandContext) {
        try {
            const stored = await provider.getMeta('ymrcLevel');
            const level = stored ? Number(stored) : DEFAULT_YMRC;
            const data = YMRC_LEVELS[level] || YMRC_LEVELS[DEFAULT_YMRC];
            return ctx.reply({ embeds: [ getYmrcEmbed(data) ] });
        } catch (err) {
            console.error('[ymrc-level]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default YmrcLevelCommand;
