import { GuildMember, Role } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getSessionRosterEmbed, getSessionNotFoundEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class SessionRosterCommand extends Command {
    constructor() {
        super({
            trigger: 'sessionroster',
            description: 'Shows who is attending a session, and who has not replied.',
            type: 'ChatInput',
            module: 'sessions',
            aliases: [ 'roster' ],
            args: [
                {
                    trigger: 'session-id',
                    description: 'The ID of the session.',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'role',
                    description: 'Compare against this role to see who has not replied.',
                    required: false,
                    type: 'DiscordRole',
                },
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.users,
                    value: true,
                },
            ],
        });
    }

    async run(ctx: CommandContext) {
        const sessionId = ctx.args['session-id'] as string;
        const roleId = typeof ctx.args['role'] === 'string'
            ? ctx.args['role']
            : (ctx.args['role'] as Role)?.id;

        try {
            const session = await provider.findSessionById(sessionId);
            if(!session) return ctx.reply({ embeds: [ getSessionNotFoundEmbed() ] });

            const rsvps = await provider.getRsvps(sessionId);
            const attending = rsvps.filter((r: any) => r.attending).map((r: any) => r.discordId);
            const declined = rsvps.filter((r: any) => !r.attending).map((r: any) => r.discordId);

            // The bit reactions can't give you: who was expected and never
            // answered either way.
            let noResponse: string[] = [];
            if(roleId && ctx.guild) {
                const responded = new Set([ ... attending, ... declined ]);
                const members = await ctx.guild.members.fetch();
                noResponse = [ ... members.values() ]
                    .filter((member: GuildMember) => !member.user.bot
                        && member.roles.cache.has(roleId)
                        && !responded.has(member.id))
                    .map((member: GuildMember) => member.id);
            }

            return ctx.reply({ embeds: [ await getSessionRosterEmbed(session, {
                attending, declined, noResponse, roleId,
            }) ] });
        } catch (err) {
            console.error('[sessionroster]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default SessionRosterCommand;
