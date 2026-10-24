import { EmbedBuilder } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { checkIconUrl, xmarkIconUrl, greenColor, redColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';
import { DES_SETTINGS } from '../../handlers/des/settings';
import { addMember } from '../../handlers/des/members';

class DesAddCommand extends Command {
    constructor() {
        super({
            trigger: 'des-add',
            description: 'Adds someone to the DES back-end (or updates them). They then set their own password on the website.',
            type: 'ChatInput',
            module: 'des',
            args: [
                { trigger: 'user', description: 'Their Discord account.', required: true, type: 'DiscordUser' },
                { trigger: 'roblox', description: 'Their Roblox username. This is the username they log in with.', required: true, type: 'String' },
                { trigger: 'badge', description: 'Their Badge ID, e.g. 2456.', required: true, type: 'String' },
                { trigger: 'department', description: 'Police or Fire.', required: true, type: 'String',
                    choices: Object.entries(DES_SETTINGS.departments).map(([ value, d ]) => ({ name: d.name, value })) },
                { trigger: 'rank', description: 'Their rank, e.g. Officer II.', required: true, type: 'String' },
                { trigger: 'access', description: 'What they can see in the back-end. Defaults to Officer / Firefighter.', required: false, type: 'String',
                    choices: [
                        { name: 'Officer / Firefighter', value: 'officer' },
                        { name: 'Dispatcher', value: 'dispatcher' },
                        { name: 'Supervisor', value: 'supervisor' },
                        { name: 'Office of Internal Affairs', value: 'oia' },
                        { name: 'Office of Fire Investigations', value: 'ofi' },
                        { name: 'Local Admin (their department)', value: 'local-admin' },
                        { name: 'Service Admin (all of DES)', value: 'service-admin' },
                    ] },
                { trigger: 'unit', description: 'Their unit, e.g. Patrol Bureau / B Shift.', required: false, type: 'String' },
            ],
            permissions: [
                { type: 'role', ids: [ ...(config.permissions.admin || []), ...DES_SETTINGS.adminRoleIds ].filter(Boolean), value: true },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const user: any = ctx.args['user'];
            const discordId = typeof user === 'string' ? user : user?.id;
            const result = await addMember(ctx.user.id, {
                discordId, robloxUsername: ctx.args['roblox'], badgeId: ctx.args['badge'], department: ctx.args['department'],
                rank: ctx.args['rank'], access: ctx.args['access'] || 'officer', unit: ctx.args['unit'],
            });
            if(result.ok === false) {
                return ctx.reply({ embeds: [ new EmbedBuilder().setColor(redColor).setAuthor({ name: 'Not Added', iconURL: xmarkIconUrl }).setDescription(result.msg) ] });
            }
            const m = result.data.member;
            logAction('DES Member Added' as any, ctx.user, `${m.robloxUsername} (${m.badgeId})`);
            return ctx.reply({ embeds: [
                new EmbedBuilder().setColor(greenColor).setAuthor({ name: result.data.updated ? 'DES Member Updated' : 'DES Member Added', iconURL: checkIconUrl })
                    .setDescription([
                        `<@${m.discordId}> · **${m.robloxUsername}** · Badge **${m.badgeId}**`,
                        `${DES_SETTINGS.departments[m.department].name} · ${m.rank}${m.unit ? ` · ${m.unit}` : ''}`,
                        `Access: ${result.data.roles.join(', ')}`,
                        '',
                        m.passwordHash ? 'They already have a password and can log in.' : 'Next, they set their own password: **Emergency Services → Service Login → First time? Set up your account**, using this Discord account.',
                    ].join('\n')),
            ] });
        } catch (err) {
            console.error('[des-add]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default DesAddCommand;
