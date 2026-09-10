import { GuildMember } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { recordAction } from '../../handlers/moderation';
import { getModActionEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class KickCommand extends Command {
    constructor() {
        super({
            trigger: 'kick',
            description: 'Kick a member from the Discord (and Roblox group if synced).',
            type: 'ChatInput',
            module: 'moderation',
            args: [
                { trigger: 'user', description: 'Who to kick.', required: true, type: 'DiscordUser' },
                { trigger: 'reason', description: 'Why?', required: true, type: 'String' },
                { trigger: 'sync', description: 'Also remove from Roblox group? Defaults to config.', required: false, type: 'Boolean' },
            ],
            permissions: [ { type: 'role', ids: config.permissions.admin, value: true } ],
        });
    }

    async run(ctx: CommandContext) {
        if(!ctx.guild) return ctx.reply({ content: 'Server only.' });
        const targetId = typeof ctx.args['user'] === 'string' ? ctx.args['user'] : (ctx.args['user'] as any)?.id;
        const reason = ctx.args['reason'] as string;
        const sync = ctx.args['sync'] as boolean | undefined;

        try {
            const member = await ctx.guild.members.fetch(targetId);
            await member.kick(reason);
            const result = await recordAction(ctx.guild.id, ctx.member as GuildMember, targetId, 'kick', reason, sync);
            return ctx.reply({ embeds: [ getModActionEmbed('Kicked', targetId, ctx.user.id, reason, result) ] });
        } catch (err) {
            console.error('[kick]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default KickCommand;
