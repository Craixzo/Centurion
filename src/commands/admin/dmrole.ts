import { GuildMember, Role } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { logAction } from '../../handlers/handleLogging';
import { getUnexpectedErrorEmbed, getDmRoleResultEmbed } from '../../handlers/locale';
import { sendMassDm, formatUserMessage, MAX_RECIPIENTS } from '../../handlers/massDm';

class DMRoleCommand extends Command {
    constructor() {
        super({
            trigger: 'dmrole',
            description: 'Sends a direct message to everyone holding a role.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'role',
                    description: 'Which role should be messaged?',
                    required: true,
                    type: 'DiscordRole',
                },
                {
                    trigger: 'message',
                    description: 'What should the message say?',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'dry-run',
                    description: 'Count the recipients without sending anything.',
                    required: false,
                    type: 'Boolean',
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
        const roleId = typeof ctx.args['role'] === 'string'
            ? ctx.args['role']
            : (ctx.args['role'] as Role)?.id;
        const message = formatUserMessage(ctx.args['message'] as string);
        const dryRun = Boolean(ctx.args['dry-run']);

        if(!ctx.guild) return ctx.reply({ content: 'This command only works inside a server.' });
        if(!roleId) return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });

        await ctx.defer();

        try {
            // Needs the Server Members Intent, which QbotClient already requests.
            // Members are fetched once at startup (see main.ts), so this reads
            // from cache with no API call - avoids the gateway rate limit that
            // fetching all members per-command hits on large servers.
            const role = ctx.guild.roles.cache.get(roleId) || await ctx.guild.roles.fetch(roleId);
            const recipients = role
                ? [ ... role.members.values() ].filter((member: GuildMember) => !member.user.bot)
                : [];

            if(recipients.length === 0) {
                return ctx.reply({ embeds: [ await getDmRoleResultEmbed({
                    roleId, total: 0, sent: 0, failed: [], dryRun, capped: false,
                }) ] });
            }

            const capped = recipients.length > MAX_RECIPIENTS;
            const targets = capped ? recipients.slice(0, MAX_RECIPIENTS) : recipients;

            if(dryRun) {
                return ctx.reply({ embeds: [ await getDmRoleResultEmbed({
                    roleId, total: recipients.length, sent: 0, failed: [], dryRun: true, capped,
                }) ] });
            }

            // Shared with /eventdm: rate limiting, failure handling, and the
            // NOTIFICATION FROM YELLONIA embed all live in massDm.ts.
            const { sent, failed } = await sendMassDm(targets, message);

            logAction(
                'Mass DM' as any, ctx.user, `Role <@&${roleId}> - ${sent} sent, ${failed.length} failed`,
            );

            const embed = await getDmRoleResultEmbed({
                roleId, total: recipients.length, sent, failed, dryRun: false, capped,
            });

            try {
                return await ctx.reply({ embeds: [ embed ] });
            } catch (err) {
                // A long run can outlive the 15-minute interaction token.
                console.log(`[dmrole] finished after the interaction expired: ${sent} sent, ${failed.length} failed.`);
            }
        } catch (err) {
            console.error('[dmrole]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default DMRoleCommand;
