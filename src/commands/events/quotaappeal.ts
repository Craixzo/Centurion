import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getNotificationEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { strikeScope } from '../../handlers/quota';
import { fileAppeal } from '../../handlers/quotaJagc';

/**
 * Appeal your most recent quota strike to JAGC. Same as the button on the
 * strike DM, for officers whose DMs are closed. No role gate: fileAppeal only
 * accepts people who actually hold a strike (including officers already fired).
 */
class QuotaAppealCommand extends Command {
    constructor() {
        super({
            trigger: 'quotaappeal',
            description: 'Appeal your most recent quota strike to JAGC.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'reason',
                    description: 'Why should this strike be removed?',
                    required: true,
                    type: 'String',
                },
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!ctx.guild) return ctx.reply({ content: 'This command only works inside a server.' });
        try {
            const reason = String(ctx.args['reason'] || '').trim();
            if(reason.length < 10) return ctx.reply({ embeds: [ getNotificationEmbed('Please explain your appeal in at least a sentence.', 'Appeal Not Filed') ] });

            const result = await fileAppeal(ctx.user.id, strikeScope(ctx.guild.id), reason);
            return ctx.reply({ embeds: [ getNotificationEmbed(result.msg, result.ok ? 'Appeal Filed' : 'Appeal Not Filed') ] });
        } catch (err) {
            console.error('[quotaappeal]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default QuotaAppealCommand;
