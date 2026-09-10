import { discordClient, robloxClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { checkDenylist } from '../../handlers/denylist';
import { resolveXpGroup } from '../../handlers/groupResolver';
import {
    getInvalidRobloxUserEmbed,
    getRobloxUserIsNotMemberEmbed,
    getUnexpectedErrorEmbed,
    getVerificationChecksFailedEmbed,
    getSuccessfulXPRankupEmbed,
    getNoRankupAvailableEmbed,
    getNoPermissionEmbed,
    getDenylistedEmbed,
} from '../../handlers/locale';
import { checkActionEligibility } from '../../handlers/verificationChecks';
import { config } from '../../config';
import { User, PartialUser, GroupMember } from '../../roblox/client';
import { logAction } from '../../handlers/handleLogging';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { provider } from '../../database';
import { findEligibleRole } from '../../handlers/handleXpRankup';

class XPRankupCommand extends Command {
    constructor() {
        super({
            trigger: 'xprankup',
            description: 'Ranks a user up based on their XP.',
            type: 'ChatInput',
            module: 'xp',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to attempt to rankup? This defaults to yourself.',
                    required: false,
                    autocomplete: true,
                    type: 'RobloxUser',
                },
            ]
        });
    }

    async run(ctx: CommandContext) {
        const robloxGroup = await resolveXpGroup(ctx.guild?.id);
        let robloxUser: User | PartialUser;
        try {
            if(!ctx.args['roblox-user']) {
                robloxUser = await getLinkedRobloxUser(ctx.user.id);
                if(!robloxUser) throw new Error();
            } else {
                robloxUser = await robloxClient.getUser(ctx.args['roblox-user'] as number);
            }
        } catch (err) {
            if(!ctx.args['roblox-user']) return ctx.reply({ embeds: [ getInvalidRobloxUserEmbed() ]});
            try {
                const robloxUsers = await robloxClient.getUsersByUsernames([ ctx.args['roblox-user'] as string ]);
                if(robloxUsers.length === 0) throw new Error();
                robloxUser = robloxUsers[0];
            } catch (err) {
                try {
                    const idQuery = ctx.args['roblox-user'].replace(/[^0-9]/gm, '');
                    const discordUser = await discordClient.users.fetch(idQuery);
                    const linkedUser = await getLinkedRobloxUser(discordUser.id);
                    if(!linkedUser) throw new Error();
                    robloxUser = linkedUser;
                } catch (err) {
                    return ctx.reply({ embeds: [ getInvalidRobloxUserEmbed() ]});
                }
            }
        }

        let robloxMember: GroupMember;
        try {
            robloxMember = await robloxGroup.getMember(robloxUser.id);
            if(!robloxMember) throw new Error();
        } catch (err) {
            return ctx.reply({ embeds: [ getRobloxUserIsNotMemberEmbed() ]});
        }

        const groupRoles = await robloxGroup.getRoles();
        const denied = ctx.guild ? await checkDenylist(ctx.guild.id, robloxUser.id) : null;
        if(denied) return ctx.reply({ embeds: [ getDenylistedEmbed(denied) ] });

        const userData = await provider.findUser(robloxUser.id.toString(), robloxGroup.id);
        const role = await findEligibleRole(robloxMember, groupRoles, userData.xp);
        if(!role) return ctx.reply({ embeds: [ getNoRankupAvailableEmbed() ] });

        if(ctx.args['roblox-user']) {
            if(!ctx.member.roles.cache.some((role) => config.permissions.users.includes(role.id)) && (config.permissions.all ? !ctx.member.roles.cache.some((role) => config.permissions.all.includes(role.id)) : false)) {
                return ctx.reply({ embeds: [ getNoPermissionEmbed() ] });
            }
            if(config.verificationChecks.enabled) {
                const actionEligibility = await checkActionEligibility(robloxGroup, ctx.user.id, ctx.member.roles.cache.map((r) => r.id), ctx.guild.id, robloxMember, robloxMember.role.rank);
                if(!actionEligibility) return ctx.reply({ embeds: [ getVerificationChecksFailedEmbed() ] });
            }
        }

        try {
            await robloxGroup.updateMember(robloxUser.id, role.id);
            ctx.reply({ embeds: [ await getSuccessfulXPRankupEmbed(robloxUser, role.name) ]});
            logAction('XP Rankup', ctx.user, null, robloxUser, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
        } catch (err) {
            console.log(err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ]});
        }
    }
}

export default XPRankupCommand;
