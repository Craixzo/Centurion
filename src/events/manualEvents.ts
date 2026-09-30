import { Client, GuildMember, Message, PartialMessage } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { parseEventTime } from '../handlers/eventTime';
import { seedEventReactions } from '../handlers/events';
import { logAction } from '../handlers/handleLogging';

/**
 * Registers hand-written event announcements in the old format, so they count
 * toward quota exactly like /event:
 *
 *   Host: @Someone
 *   Co-Host: @Someone        (optional)
 *   Event: Patrol
 *   Time: 8pm
 *   React if you plan to attend
 *
 * Only in config.eventChannels, only from members allowed to use /event.
 * The bot adds the RSVP reactions as confirmation that it counted.
 */

type ParsedEvent = { host: string; coHost?: string; event: string; time: string };

/** Reads "Key: value" lines. Tolerates **bold**, a "(optional)" note after the key, and extra spaces. */
export const parseManualEvent = (content: string): ParsedEvent | null => {
    const fields: Record<string, string> = {};
    for(const rawLine of content.split('\n')) {
        const line = rawLine.replace(/[*_`~]/g, '').trim();
        const match = line.match(/^(co[\s-]?host|host|event|time)\s*(?:\([^)]*\))?\s*:\s*(.*)$/i);
        if(!match) continue;
        const key = match[1].toLowerCase().replace(/[\s-]/g, '');
        if(!(key in fields)) fields[key] = match[2].trim();
    }

    if(!fields.host || !fields.event || !fields.time) return null;
    return { host: fields.host, coHost: fields.cohost || undefined, event: fields.event, time: fields.time };
};

const firstMention = (text?: string): string | null => text?.match(/<@!?(\d{17,20})>/)?.[1] || null;

const canPost = (member: GuildMember | null): boolean => {
    if(!member) return false;
    const allowed = [ ... (config.permissions.users || []), ... (config.permissions.all || []) ];
    return member.roles.cache.some((role) => allowed.includes(role.id));
};

const isEventChannel = (channelId: string): boolean =>
    (config.eventChannels || []).some((channel) => channel.id === channelId);

const tryRegister = async (message: Message) => {
    if(message.author.bot || !message.guild) return;
    if(!isEventChannel(message.channel.id)) return;

    const parsed = parseManualEvent(message.content);
    if(!parsed) return;

    const member = message.member || await message.guild.members.fetch(message.author.id).catch((): null => null);
    if(!canPost(member)) return;

    if(await provider.findEventByMessage(message.id)) return; // already counted

    const hostId = firstMention(parsed.host) || message.author.id;
    const coHostId = firstMention(parsed.coHost);
    const details = [
        'Posted manually.',
        parsed.coHost ? `Co-Host: ${coHostId ? `<@${coHostId}>` : parsed.coHost}` : null,
        `Time as written: ${parsed.time}`,
    ].filter(Boolean).join('\n');

    try {
        const event = await provider.createEvent({
            guildId: message.guild.id,
            channelId: message.channel.id,
            messageId: message.id,
            title: parsed.event.slice(0, 200),
            details,
            type: null,
            gameLink: null,
            startsAt: parseEventTime(parsed.time),
            hostId,
        });

        await seedEventReactions(message).catch((err) => console.error('[manualEvents] reactions:', err));
        logAction('Event Created' as any, message.author, `Manual post: ${parsed.event} (${event.id})${hostId !== message.author.id ? ` - host <@${hostId}>` : ''}`);
    } catch (err: any) {
        if(err?.code === 'P2002') return; // create raced with an edit; already counted
        console.error('[manualEvents]', err);
    }
};

const registerManualEvents = (client: Client) => {
    client.on('messageCreate', (message: Message) => {
        tryRegister(message).catch((err) => console.error('[manualEvents]', err));
    });

    // Lets an officer fix a typo in the format after posting.
    client.on('messageUpdate', async (_old, updated: Message | PartialMessage) => {
        try {
            const message = updated.partial ? await updated.fetch() : updated as Message;
            await tryRegister(message);
        } catch (err) {
            console.error('[manualEvents] edit:', err);
        }
    });
}

export default registerManualEvents;
