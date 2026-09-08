import { config } from '../config';
import { robloxClient } from '../main';
import { BloxlinkResponse } from '../structures/types';
import { getLinkedRobloxId } from './rowifi';
import axios from 'axios';
require('dotenv').config();

/**
 * Discord ID -> Roblox user.
 *
 * Provider is config.accountLinks.provider. RoWifi allows 5 requests/second
 * per token; Bloxlink caps the whole bot at 60/minute, which message XP would
 * exhaust on its own. Either way results are cached, since links rarely change.
 */
const CACHE_TTL = 60 * 60 * 1000;
const MISS_TTL = 10 * 60 * 1000;
const cache = new Map<string, { user: any; at: number }>();

let bloxlinkCount = 0;

const linkGuildId = (guildId?: string): string => {
    return guildId
        || config.accountLinks?.guildId
        || config.verificationChecks?.bloxlinkGuildId
        || '';
}

const fetchFromRoWifi = async (discordId: string, guildId: string) => {
    const robloxId = await getLinkedRobloxId(guildId, discordId);
    if(!robloxId) return null;
    return robloxClient.getUser(robloxId);
}

const fetchFromBloxlink = async (discordId: string, guildId: string) => {
    if(bloxlinkCount >= 60) return null;
    bloxlinkCount += 1;

    const robloxStatus: BloxlinkResponse = (await axios.get(
        `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`,
        { headers: { 'Authorization': process.env.BLOXLINK_KEY } },
    )).data;
    if(robloxStatus.error) throw new Error(robloxStatus.error);

    return robloxClient.getUser(parseInt(robloxStatus.robloxID));
}

const getLinkedRobloxUser = async (discordId: string, guildId?: string) => {
    const guild = linkGuildId(guildId);
    const key = `${guild}:${discordId}`;

    const cached = cache.get(key);
    if(cached) {
        const ttl = cached.user ? CACHE_TTL : MISS_TTL;
        if(Date.now() - cached.at < ttl) return cached.user;
    }

    try {
        const provider = config.accountLinks?.provider || 'bloxlink';
        const user = provider === 'rowifi'
            ? await fetchFromRoWifi(discordId, guild)
            : await fetchFromBloxlink(discordId, guild);

        cache.set(key, { user, at: Date.now() });
        return user;
    } catch (err) {
        // Serve a stale hit rather than failing outright.
        cache.set(key, { user: cached?.user ?? null, at: Date.now() });
        return cached?.user ?? null;
    }
}

const refreshRateLimits = () => {
    bloxlinkCount = 0;
    setTimeout(refreshRateLimits, 60000);
}
setTimeout(refreshRateLimits, 60000);

export { getLinkedRobloxUser };
