import { Client, Message } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { getLinkedRobloxUser } from '../handlers/accountLinks';

/**
 * Awards XP for Discord activity. XP is global, so it counts the same
 * wherever the message was sent.
 *
 * A cooldown is strongly recommended. Without one, XP is farmable by anyone
 * willing to spam, and every message costs a database write. Set
 * config.xpSystem.messageCooldown to 0 to disable it anyway.
 */
const lastAwarded = new Map<string, number>();

const registerMessageXp = (client: Client) => {
    const settings = config.xpSystem;
    const amount = settings?.messageXp ?? 0;
    if(!settings?.enabled || amount <= 0) return;

    const cooldown = (settings.messageCooldown ?? 60) * 1000;
    const ignoredChannels = settings.messageXpIgnoredChannels || [];

    client.on('messageCreate', async (message: Message) => {
        try {
            if(message.author.bot) return;
            if(!message.guild) return;
            if(ignoredChannels.includes(message.channel.id)) return;

            // Don't pay people for running commands.
            if(config.legacyCommands?.enabled) {
                const prefixes = config.legacyCommands.prefixes || [];
                if(prefixes.some((prefix) => message.content.startsWith(prefix))) return;
            }

            if(cooldown > 0) {
                const last = lastAwarded.get(message.author.id) || 0;
                if(Date.now() - last < cooldown) return;
            }

            const robloxUser = await getLinkedRobloxUser(message.author.id);
            if(!robloxUser) return;

            // Set the cooldown only after a successful lookup, so unlinked
            // users aren't silently locked out once they do link.
            lastAwarded.set(message.author.id, Date.now());
            await provider.addXp(robloxUser.id.toString(), amount);
        } catch (err) {
            console.error('[messageXp]', err);
        }
    });
}

/** Keeps the cooldown map from growing without bound on large servers. */
const pruneCooldowns = () => {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    for(const [ id, at ] of lastAwarded) {
        if(at < cutoff) lastAwarded.delete(id);
    }
    setTimeout(pruneCooldowns, 60 * 60 * 1000);
}
setTimeout(pruneCooldowns, 60 * 60 * 1000);

export default registerMessageXp;
