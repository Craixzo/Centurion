import { config } from '../config';
import { robloxClient } from '../main';
import { BloxlinkResponse } from '../structures/types';
import axios from 'axios';
require('dotenv').config();

let requestCount = 0;

/**
 * Discord ID -> Roblox user, cached.
 *
 * Bloxlink is capped at 60 lookups a minute for the whole bot, so anything
 * that runs per message (see events/messageXp.ts) must not hit it every time.
 * Links change rarely, so an hour of cache is plenty. Failures are cached
 * briefly too, otherwise every message from an unlinked user burns a request.
 */
const CACHE_TTL = 60 * 60 * 1000;
const MISS_TTL = 10 * 60 * 1000;
const cache = new Map<string, { user: any; at: number }>();

const getLinkedRobloxUser = async (discordId: string) => {
    const cached = cache.get(discordId);
    if(cached) {
        const ttl = cached.user ? CACHE_TTL : MISS_TTL;
        if(Date.now() - cached.at < ttl) return cached.user;
    }

    if(requestCount >= 60) return cached?.user ?? null;
    requestCount += 1;

    try {
        const robloxStatus: BloxlinkResponse = (await axios.get(
            `https://api.blox.link/v4/public/guilds/${config.verificationChecks.bloxlinkGuildId}/discord-to-roblox/${discordId}`,
            { headers: { 'Authorization': process.env.BLOXLINK_KEY } },
        )).data;
        if(robloxStatus.error) throw new Error(robloxStatus.error);

        const robloxUser = await robloxClient.getUser(parseInt(robloxStatus.robloxID));
        cache.set(discordId, { user: robloxUser, at: Date.now() });
        return robloxUser;
    } catch (err) {
        cache.set(discordId, { user: null, at: Date.now() });
        return null;
    }
}

const refreshRateLimits = () => {
    requestCount = 0;
    setTimeout(refreshRateLimits, 60000);
}
setTimeout(refreshRateLimits, 60000);

export { getLinkedRobloxUser };
