import { Client, GuildMember, PartialGuildMember } from 'discord.js';
import { config } from '../config';

/**
 * Grants a role to anyone displaying this server's tag (formerly "clan tag",
 * now Discord's "server identity" / primary guild), and removes it when they
 * stop.
 *
 * NOTE: primary_guild is undocumented. discord.js may surface it as
 * member.user.primaryGuild, or only in the raw payload depending on the exact
 * build, so this reads defensively from several possible shapes. If it never
 * fires, that's the field not being populated — see readIdentityGuildId.
 */

const readIdentityGuildId = (member: GuildMember | PartialGuildMember): string | null => {
    const user: any = member.user;
    if(!user) return null;

    // Preferred: discord.js typed accessor.
    const pg = user.primaryGuild || user.clan; // clan = older name, just in case
    if(pg) {
        const enabled = pg.identityEnabled ?? pg.identity_enabled;
        const gid = pg.identityGuildId ?? pg.identity_guild_id;
        if(enabled && gid) return String(gid);
        return null;
    }

    // Fallback: raw payload stashed on the user object.
    const raw = user._primaryGuild || user.primary_guild;
    if(raw && (raw.identity_enabled ?? raw.identityEnabled)) {
        const gid = raw.identity_guild_id ?? raw.identityGuildId;
        if(gid) return String(gid);
    }
    return null;
}

const sync = async (member: GuildMember | PartialGuildMember) => {
    const cfg = config.serverTagRole;
    if(!cfg?.enabled || !cfg.guildId || !cfg.roleId) return;
    if(member.guild.id !== cfg.guildId) return;

    let full: GuildMember;
    try {
        full = member.partial ? await member.fetch() : member as GuildMember;
    } catch {
        return;
    }

    const displayingTag = readIdentityGuildId(full) === cfg.guildId;
    const hasRole = full.roles.cache.has(cfg.roleId);

    try {
        if(displayingTag && !hasRole) {
            await full.roles.add(cfg.roleId, 'Displaying server tag');
        } else if(!displayingTag && hasRole) {
            await full.roles.remove(cfg.roleId, 'No longer displaying server tag');
        }
    } catch (err) {
        console.error('[serverTag]', err);
    }
}

const registerServerTag = (client: Client) => {
    if(!config.serverTagRole?.enabled) return;

    client.on('guildMemberUpdate', async (_old, member) => { await sync(member); });
    client.on('guildMemberAdd', async (member) => { await sync(member); });
}

export default registerServerTag;
