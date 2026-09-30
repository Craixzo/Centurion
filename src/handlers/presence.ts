import { ActivityType, Client } from 'discord.js';
import { config } from '../config';

/**
 * Discord allows 5 status changes per 20 seconds. Anything faster than this
 * floor is raised to it, so a config typo cannot get the bot rate limited.
 */
const MIN_ROTATION_SECONDS = 5;

let timer: NodeJS.Timeout | null = null;

/**
 * Sets the bot's status. With config.activity.rotation filled in, cycles
 * through those entries every config.activity.rotationSeconds; otherwise
 * shows the single type/value, as before.
 */
export const startPresence = (client: Client) => {
    const settings = config.activity;
    if(!settings?.enabled || !client.user) return;

    const entries = settings.rotation?.length
        ? settings.rotation
        : [ { type: settings.type, value: settings.value, url: settings.url } ];
    const usable = entries.filter((entry) => entry.value);
    if(usable.length === 0) return;

    let index = 0;
    const apply = () => {
        const entry = usable[index % usable.length];
        index++;
        try {
            client.user.setActivity(entry.value, {
                type: (entry.type ?? ActivityType.Playing) as ActivityType,
                url: entry.url,
            });
        } catch (err) {
            console.error('[presence]', err);
        }
    };

    apply();

    if(timer) clearInterval(timer);
    if(usable.length > 1) {
        const seconds = Math.max(settings.rotationSeconds ?? 10, MIN_ROTATION_SECONDS);
        timer = setInterval(apply, seconds * 1000);
    }
};
