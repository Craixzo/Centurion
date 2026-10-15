import { EmbedBuilder } from 'discord.js';
import { robloxClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { resolveGroup } from '../../handlers/groupResolver';
import {
    getInvalidRobloxUserEmbed,
    getInvalidRobloxGroupEmbed,
    getRoleNotFoundEmbed,
    getUnexpectedErrorEmbed,
    greenColor,
    redColor,
} from '../../handlers/locale';
import { config } from '../../config';
import { Group, PartialUser, User } from '../../roblox/client';
import { logAction } from '../../handlers/handleLogging';
import { grantException, isRankSkipGroup, rankSkipGroupName } from '../../handlers/rankSkip';

class AllowRankSkipCommand extends Command {
    constructor() {
        super({
            trigger: 'allowrankskip',
            description: 'Allows one promotion that skips ranks for a user in a military group.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who may skip ranks?',
                    autocomplete: true,
                    type: 'RobloxUser',
                },
                {
                    trigger: 'roblox-role',
                    description: 'The highest rank they may be promoted to.',
                    autocomplete: true,
                    type: 'RobloxRole',
                },
                {
                    trigger: 'hours',
                    description: 'How long the exception lasts, in hours (default 24).',
                    required: false,
                    type: 'Number',
                },
                {
                    trigger: 'reason',
                    description: 'Why the skip is allowed.',
                    isLegacyFlag: true,
                    required: false,
                    type: 'String',
                },
                {
                    trigger: 'group',
                    description: 'Which secondary group this applies to, if any.',
                    isLegacyFlag: true,
                    autocomplete: true,
                    required: false,
                    type: 'SecondaryGroup',
                },
            ],
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
        let robloxGroup: Group;
        try {
            robloxGroup = await resolveGroup(ctx.guild?.id, ctx.args['group']);
        } catch (err) {
            return ctx.reply({ embeds: [ getInvalidRobloxGroupEmbed() ] });
        }
        if(!isRankSkipGroup(robloxGroup.id)) {
            return ctx.reply({ embeds: [ new EmbedBuilder().setColor(redColor).setDescription('Rank-skip limits do not apply to this group, so no exception is needed.') ] });
        }

        let robloxUser: User | PartialUser;
        try {
            robloxUser = await robloxClient.getUser(ctx.args['roblox-user'] as number);
        } catch (err) {
            try {
                const users = await robloxClient.getUsersByUsernames([ ctx.args['roblox-user'] as string ]);
                if(users.length === 0) throw new Error();
                robloxUser = users[0];
            } catch (err) {
                return ctx.reply({ embeds: [ getInvalidRobloxUserEmbed() ] });
            }
        }

        try {
            const roles = await robloxGroup.getRoles();
            const wanted = String(ctx.args['roblox-role']);
            const role = roles.find((r) => String(r.id) === wanted || String(r.rank) === wanted || r.name.toLowerCase().startsWith(wanted.toLowerCase()));
            if(!role || !role.rank) return ctx.reply({ embeds: [ getRoleNotFoundEmbed() ] });

            const hours = Math.min(Math.max(Number(ctx.args['hours']) || 24, 1), 24 * 14);
            await grantException(robloxGroup.id, robloxUser.id, role.rank, ctx.user.id, hours);

            logAction('Rank Skip Exception', ctx.user, ctx.args['reason'], robloxUser, `[${rankSkipGroupName(robloxGroup.id)}] may be promoted up to ${role.name} (${role.rank}) for ${hours}h`);
            return ctx.reply({ embeds: [ new EmbedBuilder()
                .setTitle('Rank Skip Allowed')
                .setColor(greenColor)
                .setDescription(`**${robloxUser.name}** may be promoted up to **${role.name}** in ${rankSkipGroupName(robloxGroup.id)}, skipping ranks, once within the next ${hours} hours. This works for /setrank, in-game ranking, and changes on the Roblox site.`) ] });
        } catch (err) {
            console.error('[allowrankskip]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default AllowRankSkipCommand;
