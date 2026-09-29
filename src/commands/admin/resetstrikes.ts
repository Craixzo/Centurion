import { GuildMember, TextChannel } from 'discord.js';
import { discordClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getNotificationEmbed, getResetStrikesEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { getWeekStart } from '../../handlers/quota';

const groupIdForGuild = (guildId: string): number => {
    const map = config.guildGroups || {};
    return (map[guildId] as number) || config.groupId;
}

// Must match the week quotaStrikes evaluates: the COMPLETED week (this week's
// start minus 7 days). Stamping the current week would leave last week
// un-stamped, so the next strike run would re-strike everyone. This is the bug
// behind "I reset strikes and they come back."
const weekKey = (): string => {
    const start = getWeekStart();
    const lastWeekStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
    return lastWeekStart.toISOString().slice(0, 10);
}

const dmReset = async (discordId: string) => {
    try {
        const user = await discordClient.users.fetch(discordId);
        await user.send({ embeds: [ getNotificationEmbed(
            'Your quota strikes have been reset to zero. You are back in good standing.',
            'Strikes Reset',
        ) ] });
    } catch (err) { /* DMs closed */ }
}

class ResetStrikesCommand extends Command {
    constructor() {
        super({
            trigger: 'resetstrikes',
            description: 'Reset quota strikes for one officer, or everyone.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'user',
                    description: 'Whose strikes to reset. Leave blank to reset ALL officers.',
                    required: false,
                    type: 'DiscordUser',
                },
                {
                    trigger: 'silent',
                    description: 'Reset without DMing the officer(s). Defaults to false.',
                    required: false,
                    type: 'Boolean',
                },
            ],
            permissions: [
                { type: 'role', ids: config.permissions.admin, value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!ctx.guild) return ctx.reply({ content: 'Server only.' });
        // Global quota stores strikes under the fixed 'global' guild key and the
        // main group; per-server mode uses the actual guild + its group.
        const isGlobal = Boolean(config.quota?.global);
        const strikeGuildKey = isGlobal ? 'global' : ctx.guild.id;
        const groupId = String(isGlobal ? config.groupId : groupIdForGuild(ctx.guild.id));

        try {
            const targetId = typeof ctx.args['user'] === 'string'
                ? ctx.args['user']
                : (ctx.args['user'] as any)?.id;
            const silent = Boolean(ctx.args['silent']);

            // Single officer
            if(targetId) {
                await provider.setQuotaStrikes(strikeGuildKey, groupId, targetId, 0, weekKey(), false);
                if(!silent) await dmReset(targetId);
                logAction('Reset Strikes' as any, ctx.user, 'Strikes reset', { id: targetId } as any);
                return ctx.reply({ embeds: [ await getResetStrikesEmbed([ targetId ]) ] });
            }

            // Everyone with a strike record in this group
            const all = await provider.getAllStrikes(strikeGuildKey, groupId);
            const affected = all.filter((r: any) => r.strikes > 0 || r.fired);
            for(const rec of affected) {
                await provider.setQuotaStrikes(strikeGuildKey, groupId, rec.discordId, 0, weekKey(), false);
                if(!silent) await dmReset(rec.discordId);
            }
            logAction('Reset Strikes' as any, ctx.user, `Reset all (${affected.length} officers)`, null as any);
            return ctx.reply({ embeds: [ await getResetStrikesEmbed(affected.map((r: any) => r.discordId)) ] });
        } catch (err) {
            console.error('[resetstrikes]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default ResetStrikesCommand;
