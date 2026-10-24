import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { DES_SETTINGS } from '../../handlers/des/settings';
import { removeMember } from '../../handlers/des/members';

class DesRemoveCommand extends Command {
    constructor() {
        super({
            trigger: 'des-remove',
            description: 'Removes someone from the DES back-end. They become former personnel and are logged out at once.',
            type: 'ChatInput',
            module: 'des',
            args: [
                { trigger: 'badge', description: 'Their Badge ID.', required: true, type: 'String' },
                { trigger: 'reason', description: 'Why they left (kept in the audit log).', required: false, type: 'String' },
            ],
            permissions: [
                { type: 'role', ids: [ ...(config.permissions.admin || []), ...DES_SETTINGS.adminRoleIds ].filter(Boolean), value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const result = await removeMember(ctx.user.id, ctx.args['badge'], ctx.args['reason']);
            if(result.ok === false) {
                return ctx.reply({ embeds: [ new EmbedBuilder().setColor(redColor).setAuthor({ name: 'Not Removed', iconURL: xmarkIconUrl }).setDescription(result.msg) ] });
            }
            const m = result.data.member;
            logAction('DES Member Removed' as any, ctx.user, `${m.robloxUsername} (${m.badgeId})`);
            return ctx.reply({ embeds: [
                new EmbedBuilder().setColor(greenColor).setAuthor({ name: 'DES Member Removed', iconURL: checkIconUrl })
                    .setDescription(`**${m.robloxUsername}** (Badge ${m.badgeId}) is now former personnel and has been logged out of the back-end.`),
            ] });
        } catch (err) {
            console.error('[des-remove]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default DesRemoveCommand;
