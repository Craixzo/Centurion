import { GuildMember, Role } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { getEventRosterEmbed, getEventNotFoundEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';

class EventRosterCommand extends Command {
    constructor() {
        super({
            trigger: 'eventroster',
            description: 'Shows who is attending a event, and who has not replied.',
            type: 'ChatInput',
            module: 'events',
            aliases: [ 'roster' ],
            args: [
                {
                    trigger: 'event-id',
                    description: 'The ID of the event.',
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
        const eventId = ctx.args['event-id'] as string;
        const roleId = typeof ctx.args['role'] === 'string'
            ? ctx.args['role']
            : (ctx.args['role'] as Role)?.id;

        try {
            const event = await provider.findEventById(eventId);
            if(!event) return ctx.reply({ embeds: [ getEventNotFoundEmbed() ] });

            const rsvps = await provider.getRsvps(eventId);
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

            return ctx.reply({ embeds: [ await getEventRosterEmbed(event, {
                attending, declined, noResponse, roleId,
            }) ] });
        } catch (err) {
            console.error('[eventroster]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default EventRosterCommand;
