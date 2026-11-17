import { GuildMember } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getWeekStart, getWeekEnd, isQuotaEnabled, isUnderQuota } from '../../handlers/quota';
import { getQuotaEmbed, getQuotaDisabledEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class QuotaCommand extends Command {
    constructor() {
        super({
            trigger: 'quota',
            description: 'Shows how many events you have hosted this week.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'user',
                    description: 'Check someone else instead of yourself.',
                    required: false,
                    type: 'DiscordUser',
                },
            ],
            permissions: [
                {
                    type: 'role',
                    // Officers under quota can log events in any server.
                    ids: [ ... config.permissions.users, ... (config.quota?.roleIds || []) ],
                    value: true,
                },
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!isQuotaEnabled()) return ctx.reply({ embeds: [ getQuotaDisabledEmbed() ] });
        if(!ctx.guild) return ctx.reply({ content: 'This command only works inside a server.' });

        try {
            const targetId = typeof ctx.args['user'] === 'string'
                ? ctx.args['user']
                : (ctx.args['user'] as any)?.id || ctx.user.id;

            const member = await ctx.guild.members.fetch(targetId) as GuildMember;
            const weekStart = getWeekStart();
            // Global mode: events in every server count, same as the weekly check.
            const isGlobal = Boolean(config.quota?.global);
            const hosted = isGlobal
                ? await provider.countEventsByHostGlobal(targetId, weekStart)
                : await provider.countEventsByHost(ctx.guild.id, targetId, weekStart);
            const now = new Date();
            const loa = isGlobal
                ? (await provider.findLoasOverlappingGlobal(now, new Date(now.getTime() + 1))).find((l: any) => l.discordId === targetId)
                : await provider.findActiveLoa(ctx.guild.id, targetId);

            return ctx.reply({ embeds: [ await getQuotaEmbed({
                userId: targetId,
                hosted,
                required: config.quota.perWeek,
                exempt: !isUnderQuota(member.roles.cache.map((r) => r.id)),
                onLeave: Boolean(loa),
                weekStart,
                weekEnd: getWeekEnd(),
            }) ] });
        } catch (err) {
            console.error('[quota]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default QuotaCommand;
