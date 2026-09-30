import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { mainColor } from './locale';
import { updates } from '../updates';

const META_KEY = 'updates:lastAnnouncedVersion';

/**
 * Posts the newest changelog entry once, when its version has not been
 * announced before. Uses only src/updates.ts, never git or deploy metadata,
 * so no repository, branch, or commit information is exposed.
 */
export const announceUpdates = async (client: Client) => {
    const settings = config.updateAnnouncements;
    if(!settings?.enabled || !(settings.channelIds || []).length) return;

    const latest = updates[0];
    if(!latest) return;

    try {
        if(await provider.getMeta(META_KEY) === latest.version) return;

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${client.user.username} Update`, iconURL: client.user.displayAvatarURL() })
            .setTitle(`${latest.title} (v${latest.version})`)
            .setDescription(latest.changes.map((change) => `- ${change}`).join('\n').slice(0, 4000))
            .setColor(mainColor)
            .setTimestamp();

        let posted = 0;
        for(const channelId of settings.channelIds) {
            const channel = await client.channels.fetch(channelId).catch((): null => null) as TextChannel | null;
            if(!channel || !channel.isTextBased()) {
                console.warn(`[updates] channel ${channelId} not found or not a text channel.`);
                continue;
            }
            await channel.send({ embeds: [ embed ] })
                .then(() => posted++)
                .catch((err) => console.error(`[updates] could not post in ${channelId}:`, err));
        }

        // Only mark it announced if it actually went out somewhere, so a
        // misconfigured channel does not silently swallow the update.
        if(posted > 0) await provider.setMeta(META_KEY, latest.version);
    } catch (err) {
        console.error('[updates]', err);
    }
};
