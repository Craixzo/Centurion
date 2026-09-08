import { Client } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { discordTime } from '../handlers/eventTime';
import { getNotificationEmbed } from '../handlers/locale';

/**
 * DMs the host before their event starts, and again when it is due.
 *
 * The bot deliberately does not post the event itself — officers run their own
 * events. This is a nudge, not automation.
 */
const CHECK_INTERVAL = 60 * 1000;

const buildReminder = (event: any, attending: number, starting: boolean): string => {
    const when = starting
        ? 'is starting now'
        : `starts ${discordTime(event.startsAt, 'R')}`;

    const lines = [
        `**${event.type ? `[${event.type}] ` : ''}${event.title}** ${when}.`,
        '',
        starting
            ? 'Time to post it and get people in.'
            : 'Get ready to post it.',
        `**${attending}** ${attending === 1 ? 'person has' : 'people have'} marked themselves attending.`,
    ];

    if(event.gameLink) lines.push(`Game: ${event.gameLink}`);

    lines.push('');
    lines.push('Reactions are not a guest list — you can DM members directly and recruit for this, whether or not they reacted.');

    return lines.join('\n');
}

const runCheck = async (client: Client) => {
    const settings = config.eventReminders;
    if(!settings?.enabled) return;

    const minutesBefore = settings.minutesBefore ?? 5;
    const now = new Date();
    const horizon = new Date(now.getTime() + minutesBefore * 60 * 1000);

    const events = await provider.findEventsNeedingReminders(horizon);

    for(const event of events) {
        try {
            const starting = new Date(event.startsAt).getTime() <= now.getTime();
            const field = starting ? 'remindStartSent' : 'remind5Sent';
            if(event[field]) continue;

            const rsvps = await provider.getRsvps(event.id, true);
            const host = await client.users.fetch(event.hostId);
            await host.send({ embeds: [ getNotificationEmbed(
                buildReminder(event, rsvps.length, starting),
                starting ? 'Your event is starting' : 'Your event is coming up',
            ) ] });

            await provider.markEventReminded(event.id, field);

            // A late catch-up shouldn't also fire the earlier reminder.
            if(starting && !event.remind5Sent) {
                await provider.markEventReminded(event.id, 'remind5Sent');
            }
        } catch (err) {
            // Host has DMs closed, or left the server. Don't retry forever.
            console.error(`[eventReminders] ${event.id}:`, err);
            const starting = new Date(event.startsAt).getTime() <= now.getTime();
            await provider.markEventReminded(event.id, starting ? 'remindStartSent' : 'remind5Sent')
                .catch(() => {});
        }
    }
}

const registerEventReminders = (client: Client) => {
    const loop = async () => {
        try {
            await runCheck(client);
        } catch (err) {
            console.error('[eventReminders]', err);
        }
        setTimeout(loop, CHECK_INTERVAL);
    }
    setTimeout(loop, CHECK_INTERVAL);
}

export default registerEventReminders;
