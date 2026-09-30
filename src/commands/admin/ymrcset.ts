import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { YMRC_LEVELS } from '../../resources/ymrc';
import { getYmrcEmbed, getYmrcSetEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';

class YmrcSetCommand extends Command {
    constructor() {
        super({
            trigger: 'ymrc-set',
            description: 'Sets the Yellonia Military Readiness Condition.',
            type: 'ChatInput',
            module: 'admin',
            args: [
              {
                trigger: 'level',
                description: 'Which Y-MRC level to set.',
                required: true,
            type: 'Number',
            choices: [
                { name: 'Y-MRC 5 - Routine', value: '5' },
                { name: 'Y-MRC 4 - Elevated', value: '4' },
                { name: 'Y-MRC 3 - High', value: '3' },
                { name: 'Y-MRC 2 - Critical', value: '2' },
                { name: 'Y-MRC 1 - Maximum', value: '1' },
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
        console.log('[ymrc-set] Starting command');

        const level = Number(ctx.args['level']);
        console.log('[ymrc-set] Level:', level);

        if (!YMRC_LEVELS[level]) {
            console.log('[ymrc-set] Invalid level');
            return ctx.reply({ embeds: [getUnexpectedErrorEmbed()] });
        }

        console.log('[ymrc-set] Level is valid');

        const data = YMRC_LEVELS[level];

        console.log('[ymrc-set] Saving to database');

        await provider.setMeta('ymrcLevel', String(level));

        console.log('[ymrc-set] Database saved');

        logAction(
            'Y-MRC Change' as any,
            ctx.user,
            `Set to Y-MRC ${level} (${data.name})`
        );

        console.log('[ymrc-set] Sending response');

        return ctx.reply({
            embeds: [
                getYmrcSetEmbed(data),
                getYmrcEmbed(data)
            ]
        });

    } catch (err) {
        console.error('[ymrc-set] ERROR:', err);
        return ctx.reply({ embeds: [getUnexpectedErrorEmbed()] });
    }
}
export default YmrcSetCommand;
