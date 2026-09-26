import { GuildMember, TextChannel } from 'discord.js';
import { discordClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getNotificationEmbed, getResetStrikesEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';

const groupIdForGuild = (guildId: string): number => {
    const map = config.guildGroups || {};
    return (map[guildId] as number) || config.groupId;
}

const weekKey = (): string => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString().slice(0, 10);
}

const dmReset = async (discordId: string) => {
    try {
        const user = await discordClient.users.fetch(discordId);
        await user.send({ embeds: [ getNotificationEmbed(
            'IT WAS A MISINPUT MY CALM DOWN, YOU CALM THE FUCK DOWN. IT WAS A MISINPUT - CRAIXZO',
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
            ],
            permissions: [
                { type: 'role', ids: config.permissions.admin, value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!ctx.guild) return ctx.reply({ content: 'Server only.' });
        const groupId = String(groupIdForGuild(ctx.guild.id));

        try {
            const targetId = typeof ctx.args['user'] === 'string'
                ? ctx.args['user']
                : (ctx.args['user'] as any)?.id;

            // Single officer
            if(targetId) {
                await provider.setQuotaStrikes(ctx.guild.id, groupId, targetId, 0, weekKey(), false);
                await dmReset(targetId);
                logAction('Reset Strikes' as any, ctx.user, 'Strikes reset', { id: targetId } as any);
                return ctx.reply({ embeds: [ await getResetStrikesEmbed([ targetId ]) ] });
            }

            // Everyone with a strike record in this group
            const all = await provider.getAllStrikes(ctx.guild.id, groupId);
            const affected = all.filter((r: any) => r.strikes > 0 || r.fired);
            for(const rec of affected) {
                await provider.setQuotaStrikes(ctx.guild.id, groupId, rec.discordId, 0, weekKey(), false);
                await dmReset(rec.discordId);
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
