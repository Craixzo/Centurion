import ms from 'ms';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { logAction } from '../../handlers/handleLogging';
import {
    getLoaFiledEmbed,
    getLoaTooLongEmbed,
    getLoaInvalidDurationEmbed,
    getLoaAlreadyActiveEmbed,
    getUnexpectedErrorEmbed,
} from '../../handlers/locale';

export const MAX_LOA_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

class LoaCommand extends Command {
    constructor() {
        super({
            trigger: 'loa',
            description: 'Files a leave of absence. Maximum 2 days.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'duration',
                    description: 'How long? e.g. 6h, 1d, 2d. Maximum 2 days.',
                    required: true,
                    type: 'String',
                },
                {
                    trigger: 'reason',
                    description: 'Why are you going on leave?',
                    required: true,
                    type: 'String',
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
        if(!ctx.guild) return ctx.reply({ content: 'This command only works inside a server.' });

        const raw = ctx.args['duration'] as string;
        const reason = ctx.args['reason'] as string;

        let duration: number;
        try {
            duration = Number(ms(raw as any));
        } catch (err) {
            return ctx.reply({ embeds: [ getLoaInvalidDurationEmbed() ] });
        }
        if(!duration || Number.isNaN(duration) || duration <= 0) {
            return ctx.reply({ embeds: [ getLoaInvalidDurationEmbed() ] });
        }
        if(duration > MAX_LOA_MS) {
            return ctx.reply({ embeds: [ getLoaTooLongEmbed() ] });
        }

        try {
            const existing = await provider.findActiveLoa(ctx.guild.id, ctx.user.id);
            if(existing) return ctx.reply({ embeds: [ await getLoaAlreadyActiveEmbed(existing) ] });

            const startsAt = new Date();
            const endsAt = new Date(startsAt.getTime() + duration);

            const loa = await provider.createLoa({
                guildId: ctx.guild.id,
                discordId: ctx.user.id,
                reason,
                startsAt,
                endsAt,
            });

            logAction('LOA' as any, ctx.user, `${reason} (until ${endsAt.toISOString()})`);
            return ctx.reply({ embeds: [ await getLoaFiledEmbed(loa) ] });
        } catch (err) {
            console.error('[loa]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default LoaCommand;
