import { Client, GuildMember } from 'discord.js';
import { config } from '../config';
import { getLinkedRobloxUser } from './accountLinks';
import { readIdentityGuildId } from '../events/serverTag';

/**
 * Roblox ID -> Discord perks (server booster / displaying the server tag),
 * for the in-game overhead tag.
 *
 * Only boosters and tag holders are looked up, so this costs a handful of
 * RoWifi calls per refresh, not one per member. Account links are cached
 * by accountLinks.ts, so repeat refreshes are mostly free.
 */

export interface DiscordPerks {
    booster: boolean;
    tagHolder: boolean;
}

const REFRESH_MS = 5 * 60 * 1000;
let perks = new Map<number, DiscordPerks>();
let ready = false;

const perksGuildId = () => config.serverTagRole?.guildId || '';

const refresh = async (client: Client) => {
    const guildId = perksGuildId();
    const guild = guildId ? client.guilds.cache.get(guildId) : null;
    if(!guild) return;

    const next = new Map<number, DiscordPerks>();
    const candidates: GuildMember[] = [];
    for(const member of guild.members.cache.values()) {
        if(member.user.bot) continue;
        if(member.premiumSince || readIdentityGuildId(member) === guildId) candidates.push(member);
    }

    for(const member of candidates) {
        try {
            const robloxUser = await getLinkedRobloxUser(member.id, guildId);
            if(!robloxUser) continue;
            const id = Number(robloxUser.id);
            const prev = next.get(id) || { booster: false, tagHolder: false };
            next.set(id, {
                booster: prev.booster || Boolean(member.premiumSince),
                tagHolder: prev.tagHolder || readIdentityGuildId(member) === guildId,
            });
        } catch (err) {
            console.error('[discordPerks] link lookup failed for', member.id, err);
        }
    }

    perks = next;
    ready = true;
}

export const getDiscordPerks = (robloxId: number): DiscordPerks | null => {
    if(!ready) return null;
    return perks.get(robloxId) || { booster: false, tagHolder: false };
}

export const registerDiscordPerks = (client: Client) => {
    const start = async () => {
        const guild = client.guilds.cache.get(perksGuildId());
        if(!guild) {
            console.warn('[discordPerks] Main guild not found; perks disabled.');
            return;
        }
        // Fill the member cache once; GuildMembers intent keeps it current after.
        try { await guild.members.fetch(); } catch (err) { console.error('[discordPerks] member fetch', err); }
        await refresh(client);
        setInterval(() => refresh(client).catch((err) => console.error('[discordPerks]', err)), REFRESH_MS);
    }

    if(client.isReady()) start();
    else client.once('ready', () => { start(); });
}
