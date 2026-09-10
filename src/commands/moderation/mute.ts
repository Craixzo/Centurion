import ms from 'ms';
import { GuildMember } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { recordAction } from '../../handlers/moderation';
import { getModActionEmbed, getUnexpectedErrorEmbed, getMuteBadDurationEmbed } from '../../handlers/locale';

const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000; // Discord's hard cap

class MuteCommand extends Command {
    constructor() {
        super({
            trigger: 'mute',
            description: 'Time a member out (Discord only).',
            type: 'ChatInput',
            module: 'moderation',
            args: [
                { trigger: 'user', description: 'Who to mute.', required: true, type: 'DiscordUser' },
                { trigger: 'duration', description: 'e.g. 10m, 1h, 1d. Max 28 days.', required: true, type: 'String' },
                { trigger: 'reason', description: 'Why?', required: true, type: 'String' },
            ],
            permissions: [ { type: 'role', ids: config.permissions.ranking, value: true } ],
        });
    }

    async run(ctx: CommandContext) {
        if(!ctx.guild) return ctx.reply({ content: 'Server only.' });
        const targetId = typeof ctx.args['user'] === 'string' ? ctx.args['user'] : (ctx.args['user'] as any)?.id;
        const reason = ctx.args['reason'] as string;

        let duration: number;
        try { duration = Number(ms(ctx.args['duration'] as any)); } catch { return ctx.reply({ embeds: [ getMuteBadDurationEmbed() ] }); }
        if(!duration || Number.isNaN(duration) || duration <= 0 || duration > MAX_TIMEOUT) {
            return ctx.reply({ embeds: [ getMuteBadDurationEmbed() ] });
        }

        try {
            const member = await ctx.guild.members.fetch(targetId);
            await member.timeout(duration, reason);
            const result = await recordAction(ctx.guild.id, ctx.member as GuildMember, targetId, 'mute', reason);
            return ctx.reply({ embeds: [ getModActionEmbed('Muted', targetId, ctx.user.id, reason, result) ] });
        } catch (err) {
            console.error('[mute]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default MuteCommand;
