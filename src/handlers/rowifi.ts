/**
 * RoWifi API client.
 *
 * https://api.rowifi.xyz/v3 — auth is `Authorization: Bot TOKEN`, rate limited
 * to 5 requests/second per token. That is far more headroom than Bloxlink's
 * 60/minute for the whole bot, which is why account links moved here.
 */

const BASE = 'https://api.rowifi.xyz/v3';

export class RoWifiError extends Error {
    public status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = 'RoWifiError';
        this.status = status;
    }
}

const request = async (method: string, path: string, body?: any): Promise<any> => {
    const token = process.env.ROWIFI_TOKEN;
    if(!token) throw new Error('ROWIFI_TOKEN is not set in the .env file.');

    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'Authorization': `Bot ${token}`,
            ... (body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if(!res.ok) throw new RoWifiError(res.status, text.slice(0, 300));
    return text ? JSON.parse(text) : null;
}

export interface RoWifiMember {
    discord_id: string;
    roblox_id: string;
    guild_id: string;
}

/** The Roblox account linked to a Discord user in this guild, or null. */
export const getLinkedRobloxId = async (guildId: string, discordId: string): Promise<number | null> => {
    try {
        const member: RoWifiMember = await request('GET', `/guilds/${guildId}/members/${discordId}`);
        return member?.roblox_id ? Number(member.roblox_id) : null;
    } catch (err: any) {
        if(err?.status === 404) return null;
        throw err;
    }
}

/**
 * Discord accounts linked to a Roblox user.
 *
 * Only returns people who ran `/api consent reverse-search`, so expect gaps.
 */
export const getLinkedDiscordIds = async (guildId: string, robloxId: number | string): Promise<string[]> => {
    try {
        const ids = await request('GET', `/guilds/${guildId}/members/roblox/${robloxId}`);
        return Array.isArray(ids) ? ids.map(String) : [];
    } catch (err: any) {
        if(err?.status === 404) return [];
        throw err;
    }
}

export interface Denylist {
    id: string;
    reason: string;
    kind: number;      // 0 = user, 1 = group
    user_id?: string;
    group_id?: string;
}

export const getDenylists = async (guildId: string): Promise<Denylist[]> => {
    const list = await request('GET', `/guilds/${guildId}/blacklists`);
    return Array.isArray(list) ? list : [];
}

export const createDenylist = async (guildId: string, entry: {
    reason: string;
    kind: number;
    user_id?: string;
    group_id?: string;
    code?: string;
}): Promise<any> => {
    return request('POST', `/guilds/${guildId}/denylists`, entry);
}

export const deleteDenylists = async (guildId: string, ids: string[]): Promise<any> => {
    return request('DELETE', `/guilds/${guildId}/denylists`, { id: ids });
}
