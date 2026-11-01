import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, greenColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { BotmMode, setMode } from '../../handlers/branchOfTheMonth';

/** Switches Branch of the Month between manual and automatic. The choice is saved across restarts. */
class BotmModeCommand extends Command {
    constructor() {
        super({
            trigger: 'botm-mode',
            description: 'Switches Branch of the Month between manual and automatic.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'mode',
                    description: 'Manual: you log events and pick the winner. Automatic: Centurion counts and decides.',
                    required: true,
                    type: 'String',
                    choices: [
                        { name: 'Manual', value: 'manual' },
                        { name: 'Automatic', value: 'automatic' },
                    ],
                },
            ],
            permissions: [
                { type: 'role', ids: config.permissions.admin, value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const mode = String(ctx.args['mode']) === 'automatic' ? 'automatic' : 'manual' as BotmMode;
            await setMode(mode);
            logAction('Branch of the Month' as any, ctx.user, `Mode set to ${mode}`);

            const text = mode === 'automatic'
                ? 'Centurion now counts the events it records (plus anything logged with `/botm-add`) and picks the winner at midnight on the 1st. `/botm-set` still overrides it.'
                : 'Nothing is counted or decided on its own. Log events with `/botm-add` and pick the winner with `/botm-set`.';

            return ctx.reply({ embeds: [
                new EmbedBuilder()
                    .setColor(greenColor)
                    .setAuthor({ name: `Branch of the Month: ${mode === 'automatic' ? 'Automatic' : 'Manual'}`, iconURL: checkIconUrl })
                    .setDescription(text),
            ] });
        } catch (err) {
            console.error('[botm-mode]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BotmModeCommand;
