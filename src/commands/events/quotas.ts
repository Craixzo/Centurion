import { GuildMember } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getWeekStart, getWeekEnd, isQuotaEnabled } from '../../handlers/quota';
import { getQuotaOverviewEmbed, getQuotaDisabledEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class QuotasCommand extends Command {
    constructor() {
        super({
            trigger: 'quotas',
            description: 'Shows every officer against their weekly event quota.',
            type: 'ChatInput',
            module: 'events',
            aliases: [ 'quotacheck' ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true,
                },
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!isQuotaEnabled()) return ctx.reply({ embeds: [ getQuotaDisabledEmbed() ] });
        if(!ctx.guild) return ctx.reply({ content: 'This command only works inside a server.' });

        try {
            const weekStart = getWeekStart();

            // One query for the whole guild, then match against role holders.
            const counts = await provider.countEventsByAllHosts(ctx.guild.id, weekStart);
            const members = await ctx.guild.members.fetch();

            const officers = [ ... members.values() ]
                .filter((member: GuildMember) => !member.user.bot
                    && member.roles.cache.some((role) => config.quota.roleIds.includes(role.id)))
                .map((member: GuildMember) => ({
                    userId: member.id,
                    hosted: counts[member.id] || 0,
                }))
                .sort((a, b) => b.hosted - a.hosted);

            return ctx.reply({ embeds: [ await getQuotaOverviewEmbed({
                officers,
                required: config.quota.perWeek,
                weekStart,
                weekEnd: getWeekEnd(),
            }) ] });
        } catch (err) {
            console.error('[quotas]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default QuotasCommand;
