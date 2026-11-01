import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, greenColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { setDmsOn } from '../../handlers/branchOfTheMonth';

/** Turns the Branch of the Month congratulation DMs to officers on or off. Saved across restarts. */
class BotmDmsCommand extends Command {
    constructor() {
        super({
            trigger: 'botm-dms',
            description: 'Turns the Branch of the Month congratulation DMs to officers on or off.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'dms',
                    description: 'On: DM the winning branch\'s officers when a winner is set. Off: no DMs.',
                    required: true,
                    type: 'String',
                    choices: [
                        { name: 'On', value: 'on' },
                        { name: 'Off', value: 'off' },
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
            const on = String(ctx.args['dms']) === 'on';
            await setDmsOn(on);
            logAction('Branch of the Month' as any, ctx.user, `Officer DMs turned ${on ? 'on' : 'off'}`);

            return ctx.reply({ embeds: [
                new EmbedBuilder()
                    .setColor(greenColor)
                    .setAuthor({ name: `Officer DMs ${on ? 'On' : 'Off'}`, iconURL: checkIconUrl })
                    .setDescription(on
                        ? 'The winning branch\'s officers will get a congratulations DM whenever a winner is set.'
                        : 'No DMs will be sent when a winner is set. The announcement, role and website still update.'),
            ] });
        } catch (err) {
            console.error('[botm-dms]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default BotmDmsCommand;
