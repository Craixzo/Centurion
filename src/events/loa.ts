import ms from 'ms';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { logAction } from '../../handlers/handleLogging';
import {
    getLoaFiledEmbed,
    getLoaTooShortEmbed,
    getLoaTooLongEmbed,
    getLoaInvalidDurationEmbed,
    getLoaAlreadyActiveEmbed,
    getUnexpectedErrorEmbed,
} from '../../handlers/locale';

const DAY_MS = 24 * 60 * 60 * 1000;

const minMs = () => (config.loa?.minDays ?? 2) * DAY_MS;
const maxMs = () => {
    const days = config.loa?.maxDays ?? 30;
    return days > 0 ? days * DAY_MS : Infinity;
}

class LoaCommand extends Command {
    constructor() {
        super({
            trigger: 'loa',
            description: 'Files a leave of absence. Minimum 2 days.',
            type: 'ChatInput',
            module: 'events',
            args: [
                {
                    trigger: 'duration',
                    description: 'How long? Minimum 2 days, e.g. 2d, 5d, 2w.',
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
        if(duration < minMs()) {
            return ctx.reply({ embeds: [ getLoaTooShortEmbed() ] });
        }
        if(duration > maxMs()) {
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
