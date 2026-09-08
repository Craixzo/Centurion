import { discordClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { sendMassDm } from '../../handlers/massDm';
import { getUnexpectedErrorEmbed, getSessionDmResultEmbed, getSessionNotFoundEmbed } from '../../handlers/locale';
import { logAction } from '../../handlers/handleLogging';

class SessionDMCommand extends Command {
    constructor() {
        super({
            trigger: 'sessiondm',
            description: 'DMs everyone who marked themselves attending a session.',
            type: 'ChatInput',
            module: 'sessions',
            args: [
                {
                    trigger: 'session-id',
                    description: 'The ID shown when the session was created.',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'message',
                    description: 'What should they be told?',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'close',
                    description: 'Close RSVPs for this session as well?',
                    required: false,
                    type: 'Boolean',
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
        const message = ctx.args['message'] as string;
        const close = Boolean(ctx.args['close']);

        try {
            const session = await provider.findSessionById(sessionId);
            if(!session) return ctx.reply({ embeds: [ getSessionNotFoundEmbed() ] });

            const rsvps = await provider.getRsvps(sessionId, true);
            if(rsvps.length === 0) {
                return ctx.reply({ embeds: [ await getSessionDmResultEmbed(session, { sent: 0, failed: [], capped: false, total: 0 }) ] });
            }

            const users = [];
            for(const rsvp of rsvps) {
                try {
                    users.push(await discordClient.users.fetch(rsvp.discordId));
                } catch (err) { /* account gone */ }
            }

            const result = await sendMassDm(users, `**${session.title}**\n\n${message}`);

            if(close) await provider.closeSession(sessionId);
            logAction('Session DM' as any, ctx.user, `${session.title} - ${result.sent} sent, ${result.failed.length} failed`);

            try {
                return await ctx.reply({ embeds: [ await getSessionDmResultEmbed(session, result) ] });
            } catch (err) {
                console.log(`[sessiondm] finished after the interaction expired: ${result.sent} sent.`);
            }
        } catch (err) {
            console.error('[sessiondm]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default SessionDMCommand;
