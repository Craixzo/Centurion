import { EmbedBuilder } from 'discord.js';
import { CommandArgument, DatabaseUser } from '../structures/types';
import { config } from '../config';
import { User, PartialUser, GroupMember, GroupJoinRequest, GroupRole } from '../roblox/client';
import { User as DiscordUser } from 'discord.js';
import { Command } from '../structures/Command';
import { robloxClient } from '../main';
import { textSync } from 'figlet';

export const checkIconUrl = 'https://cdn.lengolabs.com/qbot-icons/check.png';
export const xmarkIconUrl = 'https://cdn.lengolabs.com/qbot-icons/xmark.png';
export const infoIconUrl = 'https://cdn.lengolabs.com/qbot-icons/info.png';
export const quoteIconUrl = 'https://cdn.lengolabs.com/qbot-icons/quote.png';

export const mainColor = '#906FED';
export const greenColor = '#50C790';
export const redColor = '#FA5757';

export const consoleMagenta = '\x1b[35m';
export const consoleGreen = '\x1b[32m';
export const consoleYellow = '\x1b[33m';
export const consoleRed = '\x1b[31m';
export const consoleClear = '\x1b[0m';

export const qbotLaunchTextDisplay = `${consoleMagenta}${textSync('Qbot')}`;
export const welcomeText = `${consoleYellow}Hey, thanks for using Qbot! If you run into any issues, please do not hesitate to join our support server: https://lengolabs.com/discord`;
export const startedText = `\n${consoleGreen}✓  ${consoleClear}Your bot has been started.`;
export const securityText = `\n${consoleRed}⚠  ${consoleClear}URGENT: For security reasons, public bot must be DISABLED for the bot to start. For more information, please refer to this section of our documentation: https://docs.lengolabs.com/qbot/setup/replit-guide#discord`;

export const noFiredRankLog = `Uh oh, you do not have a fired rank with the rank specified in your configuration file.`;
export const noSuspendedRankLog = `Uh oh, you do not have a suspended rank with the rank specified in your configuration file.`;
export const getListeningText = (port) => `${consoleGreen}✓  ${consoleClear}Listening on port ${port}.`;

const getHeadshotImage = async (userId: number) => {
    return (await robloxClient.apis.thumbnailsAPI.getUsersAvatarHeadShotImages({ userIds: [ userId ], size: '48x48', format: 'png' })).data[0];
}

export const getUnknownCommandMessage = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Command Unavailable', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This command is not available here, or there was an unexpected error finding it on our system.');

    return embed;
}

export const getMissingArgumentsEmbed = (cmdName: string, args: CommandArgument[]): EmbedBuilder => {
    let argString = '';
    args.forEach((arg) => {
        if(arg.isLegacyFlag) {
            argString += arg.required || true ? `--<${arg.trigger}> ` : `--[${arg.trigger}] `;
        } else {
            argString += arg.required || true ? `<${arg.trigger}> ` : `[${arg.trigger}] `;
        }
    });
    argString = argString.substring(0, argString.length - 1);

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Invalid Usage', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription(`Command Usage: \`${config.legacyCommands.prefixes[0]}${cmdName} ${argString}\``)
        .setFooter({ text: config.slashCommands ? 'Tip: Slash commands automatically display the required arguments for commands.' : '' });
    
    return embed;
}

export const getInvalidRobloxUserEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Query Unsuccessful', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('The Roblox user you searched for does not exist.');

    return embed;
}

export const getNoDatabaseEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Command Disabled', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This command requires the database to be setup, and one has not been set up for this bot.');

    return embed;
}

export const getRobloxUserIsNotMemberEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Unable to Rank', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('The Roblox user you searched for is not a member of the Roblox group.');

    return embed;
}

export const getNoJoinRequestEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'No Join Request', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user does not have a pending join request to review.');

    return embed;
}

export const getSuccessfulAddingAndRankupEmbed = async(user: User | PartialUser, newRole: string, xpChange: string): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has been given **${xpChange}** XP and has been promoted to **${newRole}**, becuase they had enough XP!`)

    return embed
}

export const getSuccessfulPromotionEmbed = async (user: User | PartialUser, newRole: string): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has been successfully promoted to **${newRole}**!`);

    return embed;
}

export const getSuccessfulDemotionEmbed = async (user: User | PartialUser, newRole: string): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
    .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has been successfully demoted to **${newRole}**.`);

    return embed;
}

export const getSuccessfulFireEmbed = async (user: User | PartialUser, newRole: string): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has been successfully fired, and now has the **${newRole}** role.`);

    return embed;
}

export const getSuccessfulExileEmbed = async (user: User | PartialUser): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has been successfully exiled from the group.`);

    return embed;
}

export const getSuccessfulSetRankEmbed = async (user: User | PartialUser, newRole: string): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has successfully been ranked to the **${newRole}** role.`);

    return embed;
}

export const getSuccessfulShoutEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription('The group shout has been updated to that message!');

    return embed;
}

export const getSuccessfulSignalEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription('The specified command has been stored and made available to connected Roblox games using our API.');

    return embed;
}

export const getSuccessfulRevertRanksEmbed = (actionCount: number): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription(`Successfully started reverting back **${actionCount}** ranking actions.`);

    return embed;
}

export const getSuccessfulXPRankupEmbed = async (user: User | PartialUser, newRole: string): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has been successfully ranked to **${newRole}**!`);

    return embed;
}

export const getSuccessfulXPChangeEmbed = async (user: User | PartialUser, xp: number): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`The XP of **${user.name}** has been updated, they now have a total of **${xp}** XP.`);

    return embed;
}

export const getSuccessfulSuspendEmbed = async (user: User | PartialUser, newRole: string, endDate: Date): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** has been successfully suspended, and will have their rank returned in <t:${Math.round(endDate.getTime() / 1000)}:R>.`);

    return embed;
}

export const getSuccessfulUnsuspendEmbed = async (user: User | PartialUser, newRole: string): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`**${user.name}** is no longer suspended, and has been ranked back to **${newRole}**!`);

    return embed;
}

export const getSuccessfulAcceptJoinRequestEmbed = async (user: User | PartialUser): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`The join request from **${user.name}** has been accepted.`);

    return embed;
}

export const getSuccessfulDenyJoinRequestEmbed = async (user: User | PartialUser): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setDescription(`The join request from **${user.name}** has been denied.`);

    return embed;
}

export const getUserSuspendedEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'User Is Suspended', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user is suspended, and cannot be ranked. Please use the unsuspend command to revert this.');

    return embed;
}

export const getUserBannedEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'User Is Banned', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user is already banned.');

    return embed;
}

export const getUserNotBannedEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'User Not Banned', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user is not banned, so it is impossible to unban them.');

    return embed;
}

export const getCommandNotFoundEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Command Not Found', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('A command could not be found with that query.');

    return embed;
}

export const getAlreadySuspendedEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'User Already Suspended', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user is already suspended. Please use the unsuspend command to revert this.');

    return embed;
}

export const getUnexpectedErrorEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Unexpected Error', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('Unfortunately, something that we did not expect went wrong while processing this action. More information has been logged for the bot owner to diagnose.');

    return embed;
}

export const getNoRankAboveEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Cannot Promote', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('There is no rank directly above this user, so you are unable to promote them.');

    return embed;
}

export const getNoRankBelowEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Cannot Demote', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('There is no rank directly below this user, so you are unable to demote them.');

    return embed;
}

export const getNoPermissionEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Unauthorized', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('You do not have permission to use this command.');

    return embed;
}

export const getInvalidXPEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Invalid XP', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('The value of XP used in this command must be a positive integer.');

    return embed;
}

export const getNoRankupAvailableEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'No Rankup Available', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('You do not have any available rankups.');

    return embed;
}

export const getVerificationChecksFailedEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Verification Check Failed', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription(`
        To prevent you from ranking someone that you would not manually be able to rank, the bot checks the following things before allowing you to rank a user. In this case, you have failed one or more, and therefore you are unable to rank this user.

        • You are verified on this server.
        • The user you are performing this action on is not you.
        • Your rank is above the rank of the user you are trying to perform this action on.
        `);

    return embed;
}

export const getAlreadyFiredEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'User Already Fired', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user already has the fired rank.');

    return embed;
}

export const getRoleNotFoundEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Role Unavailable', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user you have specified does not exist on the group, or cannot be ranked by this bot.');

    return embed;
}

export const getInvalidDurationEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Invalid Duration', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('Durations must be within 5 minutes and 2 years.');

    return embed;
}

export const getShoutLogEmbed = async (shout: any): Promise<EmbedBuilder> => {
    const shoutCreator = await robloxClient.apis.usersAPI.getUserById(shout.creator.id);
    const embed = new EmbedBuilder()
        .setAuthor({ name: `Shout from ${shoutCreator.name}`, iconURL: quoteIconUrl })
        .setThumbnail((await getHeadshotImage(shout.creator.id)).imageUrl)
        .setColor(mainColor)
        .setTimestamp()
        .setDescription(shout.content);

    return embed;
}

export const getWallPostEmbed = async (post): Promise<EmbedBuilder> => {
    const postCreator = await robloxClient.apis.usersAPI.getUserById(post.poster);
    const embed = new EmbedBuilder()
        .setAuthor({ name: `Posted by ${postCreator.name}`, iconURL: quoteIconUrl })
        .setThumbnail((await getHeadshotImage(post.poster)).imageUrl)
        .setColor(mainColor)
        .setTimestamp()
        .setDescription(post['body']);

    return embed;
}

export const getLogEmbed = async (action: string, moderator: DiscordUser | User | GroupMember | any, reason?: string, target?: User | PartialUser, rankChange?: string, endDate?: Date, body?: string, xpChange?: string, secondaryGroup?: string): Promise<EmbedBuilder> => {
    if(target && !target.name) target = null;
    
    const embed = new EmbedBuilder()
        .setColor(mainColor)
        .setTimestamp()
        .setDescription(`**Action:** ${action}\n${target ? `**Target:** ${target.name} (${target.id})\n` : ''}${rankChange ? `**Rank Change:** ${rankChange}\n` : ''}${xpChange ? `**XP Change:** ${xpChange}\n` : ''}${endDate ? `**Duration:** <t:${Math.round(endDate.getTime() / 1000)}:R>\n` : ''}${secondaryGroup ? `**Group:** ${secondaryGroup}\n` : ''}${reason ? `**Reason:** ${reason}\n` : ''}${body ? `**Body:** ${body}\n` : ''}`);

    if(typeof moderator === 'string') {
        embed.setAuthor({ name: moderator });
    } else {
        if(moderator instanceof DiscordUser) {
            embed.setAuthor({ name: moderator.username, iconURL: moderator.displayAvatarURL() });
            embed.setFooter({ text: `Moderator ID: ${moderator.id}` });
        } else {
            embed.setAuthor({ name: moderator.username });
            embed.setThumbnail((await getHeadshotImage(target.id)).imageUrl)
        }
    }

    return embed;
}

export const getAlreadyRankedEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'User Already Ranked', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user already has this rank.');

    return embed;
}

export const getPartialUserInfoEmbed = async (user: User | PartialUser, data: DatabaseUser): Promise<EmbedBuilder> => {
    const primaryGroup = await user.getPrimaryGroup();
    const embed = new EmbedBuilder()
        .setAuthor({ name: `Information: ${user.name}`, iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription(primaryGroup ? `Primary Group: [${primaryGroup.group.name}](https://roblox.com/groups/${primaryGroup.group.id})` : null)
        .setThumbnail((await getHeadshotImage(user.id)).imageUrl)
        .setFooter({ text: `User ID: ${user.id}` })
        .setTimestamp()
        .addFields([
            {
                name: 'Role',
                value: 'Guest (0)',
                inline: true
            },
            {
                name: 'Banned',
                value: data.isBanned ? `✅` : '❌',
                inline: true
            }
        ]);

    return embed;
}

export const getUserInfoEmbed = async (user: User | PartialUser, member: GroupMember, data: DatabaseUser): Promise<EmbedBuilder> => {
    const primaryGroup = await user.getPrimaryGroup();
    const embed = new EmbedBuilder()
        .setAuthor({ name: `Information: ${user.name}`, iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription(primaryGroup ? `Primary Group: [${primaryGroup.group.name}](https://roblox.com/groups/${primaryGroup.group.id})` : null)
        .setThumbnail((await robloxClient.apis.thumbnailsAPI.getUsersAvatarHeadShotImages({ userIds: [ user.id ], size: '150x150', format: 'png', isCircular: false })).data[0].imageUrl)
        .setFooter({ text: `User ID: ${user.id}` })
        .setTimestamp()
        .addFields([
            {
                name: 'Role',
                value: `${member.role.name} (${member.role.rank})`,
                inline: true
            },
            {
                name: 'XP',
                value: data.xp.toString() || '0',
                inline: true
            },
            {
                name: 'Suspended',
                value: data.suspendedUntil ? `✅ (<t:${Math.round(data.suspendedUntil.getTime() / 1000)}:R>)` : '❌',
                inline: true
            },
            {
                name: 'Banned',
                value: data.isBanned ? `✅` : '❌',
                inline: true
            }
        ]);

    return embed;
}

export const getRoleListEmbed = (roles: GroupRole[]): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Group Roles', iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription('Here is a list of all roles on the group.');

    roles.forEach((role) => {
        embed.addFields({
            name: role.name,
            value: `Rank: \`${role.rank || '0'}\``,
            inline: true
        });
    });

    return embed;
}

export const getNotSuspendedEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'User Not Suspended', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('This user is not suspended, meaning you cannot run this command on them.');

    return embed;
}

export const getMemberCountMessage = (oldCount: number, newCount: number): string => {
    if(newCount > oldCount) {
        return `⬆️ The member count is now **${newCount}** (+${newCount - oldCount})`;
    } else {
        return `⬇️ The member count is now **${newCount}** (-${oldCount - newCount})`;
    }
}

export const getMemberCountMilestoneEmbed = (count: number): EmbedBuilder => {
    const embed = new EmbedBuilder()
    .setAuthor({ name: 'Member Milestone Reached!', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription(`🎉 The member count is now **${count}**!`);

    return embed;
}

export const getCommandInfoEmbed = (command: Command): EmbedBuilder => {
    let argString = '';
    command.args.forEach((arg) => {
        argString += arg.required || true ? `<${arg.trigger}> ` : `[${arg.trigger}] `;
    });
    argString = argString.substring(0, argString.length - 1);

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Command Information', iconURL: infoIconUrl })
        .setTitle(command.trigger)
        .setColor(mainColor)
        .setDescription(command.description)
        .setFooter({ text: config.slashCommands ? 'Tip: Slash commands automatically display a list of available commands, and their required usage.' : '' })
        .setFields([
            {
                name: 'Module',
                value: command.module,
                inline: true
            },
            {
                name: 'Usage',
                value: `\`${argString}\``,
                inline: true
            }
        ]);

    return embed;
}

export const getCommandListEmbed = (modules: { [key: string]: Command[] }): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Command List', iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription(config.slashCommands && config.legacyCommands ? 'Tip: Slash commands automatically display a list of available commands, and their required usage.' : null);

    Object.keys(modules).forEach((key) => {
        const moduleCommands = modules[key];
        const mappedCommands = moduleCommands.map((cmd) => `\`${cmd.trigger}\` - ${cmd.description}`);
        embed.addFields({
            name: key.replace('-', ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            value: mappedCommands.join('\n'),
        });
    });

    return embed;
}

export const getJoinRequestsEmbed = (joinRequests: GroupJoinRequest[]): EmbedBuilder => {
    const requestString = joinRequests.map((request) => `- \`${request['requester'].username}\``).join('\n');
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Join Requests', iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription(`${joinRequests.length !== 0 ? `There is currently ${joinRequests.length} pending join requests:\n\n${requestString}` : 'There are currently no pending join requests.'}`);

    return embed;
}

export const getSuccessfulGroupBanEmbed = (user: User | PartialUser) : EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription(`**${user.name}** has successfully been banned from the group.`);
    
    return embed;
}

export const getSuccessfulGroupUnbanEmbed = (user: User | PartialUser) : EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Success', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription(`**${user.name}** has successfully been unbanned from the group.`);
    
    return embed;
}

export const getInvalidRobloxGroupEmbed = (): EmbedBuilder => {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Invalid Group', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('The secondary group you provided for this action is not setup.');

    return embed;
}

export const getXpLeaderboardEmbed = async (rows: { position: number; name: string; xp: number }[]): Promise<EmbedBuilder> => {
    const medals = [ ':first_place:', ':second_place:', ':third_place:' ];
    const body = rows.map((row) => {
        const marker = medals[row.position - 1] || `\`#${row.position}\``;
        return `${marker} **${row.name}** \u2014 ${row.xp.toLocaleString()} XP`;
    }).join('\n');

    return new EmbedBuilder()
        .setAuthor({ name: 'XP Leaderboard', iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription(rows.length ? body : 'Nobody has earned any XP yet.');
}

export const getDmRoleResultEmbed = async (result: {
    roleId: string;
    total: number;
    sent: number;
    failed: string[];
    dryRun: boolean;
    capped: boolean;
}): Promise<EmbedBuilder> => {
    const embed = new EmbedBuilder().setAuthor({ name: 'Mass DM', iconURL: infoIconUrl });

    if(result.total === 0) {
        return embed.setColor(redColor).setDescription(`Nobody in <@&${result.roleId}> can be messaged.`);
    }

    if(result.dryRun) {
        return embed
            .setColor(mainColor)
            .setDescription(`**${result.total}** members hold <@&${result.roleId}>.`)
            .setFooter({ text: result.capped ? 'Capped at 500 - only the first 500 would be messaged.' : 'Dry run: nothing was sent.' });
    }

    const lines = [
        `Sent: **${result.sent}**`,
        `Failed: **${result.failed.length}**`,
    ];
    if(result.capped) lines.push(`\nCapped at 500 of ${result.total} recipients.`);
    if(result.failed.length > 0) {
        const shown = result.failed.slice(0, 15).join(', ');
        lines.push(`\nCould not reach: ${shown}${result.failed.length > 15 ? ` and ${result.failed.length - 15} more` : ''}`);
    }

    return embed
        .setColor(result.failed.length === 0 ? greenColor : mainColor)
        .setDescription(`Messaged <@&${result.roleId}>.\n\n${lines.join('\n')}`);
}

export const getEventCreatedEmbed = async (event: any, url: string): Promise<EmbedBuilder> => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Event Created', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription(`**${event.title}** has been posted.\n\n[Jump to announcement](${url})`)
        .addFields({ name: 'Event ID', value: `\`${event.id}\``, inline: false })
        .setFooter({ text: 'Use /eventdm with this ID to message attendees.' });
}

export const getEventNotFoundEmbed = (): EmbedBuilder => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Event Not Found', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('No event with that ID. Use `/events` to list recent ones.');
}

export const getEventDmResultEmbed = async (event: any, result: { sent: number; failed: string[]; capped: boolean; total: number }): Promise<EmbedBuilder> => {
    if(result.total === 0) {
        return new EmbedBuilder()
            .setAuthor({ name: 'Event DM', iconURL: infoIconUrl })
            .setColor(redColor)
            .setDescription(`Nobody has marked themselves attending **${event.title}** yet.`);
    }

    const lines = [ `Sent: **${result.sent}**`, `Failed: **${result.failed.length}**` ];
    if(result.failed.length > 0) {
        const shown = result.failed.slice(0, 15).join(', ');
        lines.push(`\nCould not reach: ${shown}${result.failed.length > 15 ? ` and ${result.failed.length - 15} more` : ''}`);
    }

    return new EmbedBuilder()
        .setAuthor({ name: 'Event DM', iconURL: infoIconUrl })
        .setColor(result.failed.length === 0 ? greenColor : mainColor)
        .setDescription(`Messaged attendees of **${event.title}**.\n\n${lines.join('\n')}`);
}

export const getEventListEmbed = async (events: any[]): Promise<EmbedBuilder> => {
    const body = events.map((s) => `\`${s.id}\`\n**${s.title}**${s.closed ? ' (closed)' : ''}`).join('\n\n');
    return new EmbedBuilder()
        .setAuthor({ name: 'Recent Events', iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription(events.length ? body : 'No events have been created in this server yet.');
}

const formatIdList = (ids: string[], empty: string): string => {
    if(ids.length === 0) return empty;
    const out: string[] = [];
    let length = 0;
    for(const id of ids) {
        const mention = `<@${id}>`;
        if(length + mention.length + 2 > 950) {
            out.push(`and **${ids.length - out.length}** more`);
            break;
        }
        out.push(mention);
        length += mention.length + 2;
    }
    return out.join(', ');
}

export const getEventRosterEmbed = async (event: any, roster: {
    attending: string[];
    declined: string[];
    noResponse: string[];
    roleId?: string;
}): Promise<EmbedBuilder> => {
    const fields: any[] = [
        { name: `Attending \u2014 ${roster.attending.length}`, value: formatIdList(roster.attending, '*Nobody yet.*'), inline: false },
        { name: `Can't make it \u2014 ${roster.declined.length}`, value: formatIdList(roster.declined, '*Nobody.*'), inline: false },
    ];

    if(roster.roleId) {
        fields.push({
            name: `No response \u2014 ${roster.noResponse.length}`,
            value: formatIdList(roster.noResponse, '*Everyone has replied.*'),
            inline: false,
        });
    }

    return new EmbedBuilder()
        .setAuthor({ name: 'Event Roster', iconURL: infoIconUrl })
        .setTitle(event.title)
        .setColor(mainColor)
        .addFields(fields)
        .setFooter({ text: roster.roleId
            ? 'No response is measured against the role you specified.'
            : 'Pass a role to also see who has not replied.' });
}

const formatWeek = (start: Date, end: Date): string => {
    const opts: any = { month: 'short', day: 'numeric' };
    const last = new Date(end.getTime() - 1);
    return `${start.toLocaleDateString('en-US', opts)} \u2013 ${last.toLocaleDateString('en-US', opts)}`;
}

export const getQuotaDisabledEmbed = (): EmbedBuilder => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Quota', iconURL: infoIconUrl })
        .setColor(redColor)
        .setDescription('The quota system is not enabled. Set `quota.enabled` and `quota.roleIds` in the config.');
}

export const getQuotaEmbed = async (data: {
    userId: string;
    hosted: number;
    required: number;
    exempt: boolean;
    onLeave?: boolean;
    weekStart: Date;
    weekEnd: Date;
}): Promise<EmbedBuilder> => {
    const met = data.hosted >= data.required;
    const remaining = Math.max(data.required - data.hosted, 0);

    const status = data.exempt
        ? 'Not held to the quota.'
        : data.onLeave && !met
            ? `On leave. **${data.hosted}/${data.required}** hosted so far.`
        : met
            ? `Quota met. **${data.hosted}/${data.required}** events hosted.`
            : `**${data.hosted}/${data.required}** hosted \u2014 **${remaining}** to go.`;

    return new EmbedBuilder()
        .setAuthor({ name: 'Weekly Quota', iconURL: infoIconUrl })
        .setColor(data.exempt ? mainColor : met ? greenColor : redColor)
        .setDescription(`<@${data.userId}>\n\n${status}`)
        .setFooter({ text: formatWeek(data.weekStart, data.weekEnd) });
}

export const getQuotaOverviewEmbed = async (data: {
    officers: { userId: string; hosted: number }[];
    required: number;
    weekStart: Date;
    weekEnd: Date;
}): Promise<EmbedBuilder> => {
    if(data.officers.length === 0) {
        return new EmbedBuilder()
            .setAuthor({ name: 'Weekly Quotas', iconURL: infoIconUrl })
            .setColor(redColor)
            .setDescription('Nobody holds a quota role.');
    }

    const met = data.officers.filter((o) => o.hosted >= data.required);
    const leave = data.officers.filter((o) => o.hosted < data.required && (o as any).onLeave);
    const short = data.officers.filter((o) => o.hosted < data.required && !(o as any).onLeave);

    const render = (list: { userId: string; hosted: number }[]) => {
        const out: string[] = [];
        let length = 0;
        for(const o of list) {
            const line = `<@${o.userId}> \u2014 ${o.hosted}/${data.required}`;
            if(length + line.length + 1 > 950) {
                out.push(`and **${list.length - out.length}** more`);
                break;
            }
            out.push(line);
            length += line.length + 1;
        }
        return out.join('\n');
    }

    const fields: any[] = [];
    fields.push({ name: `Met \u2014 ${met.length}`, value: met.length ? render(met) : '*Nobody yet.*', inline: false });
    fields.push({ name: `Short \u2014 ${short.length}`, value: short.length ? render(short) : '*Everyone is on track.*', inline: false });
    if(leave.length > 0) {
        fields.push({ name: `On leave \u2014 ${leave.length}`, value: render(leave), inline: false });
    }

    return new EmbedBuilder()
        .setAuthor({ name: 'Weekly Quotas', iconURL: infoIconUrl })
        .setColor(short.length === 0 ? greenColor : mainColor)
        .setDescription(`**${met.length}/${data.officers.length}** officers have met their quota of **${data.required}** this week.`)
        .addFields(fields)
        .setFooter({ text: formatWeek(data.weekStart, data.weekEnd) });
}

export const getDenylistedEmbed = (hit: { reason: string; kind: 'user' | 'group'; groupId?: string }): EmbedBuilder => {
    const source = hit.kind === 'group'
        ? `They are in a denylisted group (\`${hit.groupId}\`).`
        : 'They are on the denylist.';

    return new EmbedBuilder()
        .setAuthor({ name: 'Denylisted', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription(`${source}\n\n**Reason:** ${hit.reason || 'No reason given.'}`)
        .setFooter({ text: 'Managed through RoWifi denylists.' });
}

/** Discord relative timestamp, so it renders in each viewer's timezone. */
const ts = (date: Date, style = 'R'): string => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

export const getLoaInvalidDurationEmbed = (): EmbedBuilder => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Invalid Duration', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('Use a duration like `6h`, `1d` or `2d`.');
}

export const getLoaTooLongEmbed = (): EmbedBuilder => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Too Long', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('Leave cannot be longer than **2 days**. For anything longer, speak to high command.');
}

export const getLoaAlreadyActiveEmbed = async (loa: any): Promise<EmbedBuilder> => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Already On Leave', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription(`You are already on leave until ${ts(loa.endsAt, 'f')} (${ts(loa.endsAt)}).\n\nUse \`/loaend\` to return early.`);
}

export const getLoaFiledEmbed = async (loa: any): Promise<EmbedBuilder> => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Leave Filed', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription(`<@${loa.discordId}> is on leave until ${ts(loa.endsAt, 'f')} (${ts(loa.endsAt)}).`)
        .addFields({ name: 'Reason', value: loa.reason, inline: false })
        .setFooter({ text: 'Use /loaend to return early.' });
}

export const getLoaEndedEmbed = async (loa: any): Promise<EmbedBuilder> => {
    return new EmbedBuilder()
        .setAuthor({ name: 'Leave Ended', iconURL: checkIconUrl })
        .setColor(greenColor)
        .setDescription(`<@${loa.discordId}> is no longer on leave.`);
}

export const getLoaNotFoundEmbed = (): EmbedBuilder => {
    return new EmbedBuilder()
        .setAuthor({ name: 'No Active Leave', iconURL: xmarkIconUrl })
        .setColor(redColor)
        .setDescription('There is no active leave to end.');
}

export const getLoaListEmbed = async (loas: any[]): Promise<EmbedBuilder> => {
    if(loas.length === 0) {
        return new EmbedBuilder()
            .setAuthor({ name: 'Active Leave', iconURL: infoIconUrl })
            .setColor(mainColor)
            .setDescription('Nobody is currently on leave.');
    }

    const body = loas.map((loa) => `<@${loa.discordId}> \u2014 back ${ts(loa.endsAt)}\n*${loa.reason}*`).join('\n\n');

    return new EmbedBuilder()
        .setAuthor({ name: `Active Leave \u2014 ${loas.length}`, iconURL: infoIconUrl })
        .setColor(mainColor)
        .setDescription(body.length > 4000 ? body.slice(0, 3990) + '\n\n…' : body);
}
