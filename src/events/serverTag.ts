import { Client, GuildMember, PartialGuildMember } from 'discord.js';
import { config } from '../config';

/**
 * Grants a role to anyone displaying this server's tag (formerly "clan tag",
 * now Discord's "server identity" / primary guild), and removes it when they
 * stop.
 *
 * primary_guild is undocumented; discord.js may surface it as
 * member.user.primaryGuild or only in the raw payload, so this reads
 * defensively from several shapes.
 */

const readIdentityGuildId = (member: GuildMember | PartialGuildMember): string | null => {
    const user: any = member.user;
    if(!user) return null;

    const pg = user.primaryGuild || user.clan;
    if(pg) {
        const enabled = pg.identityEnabled ?? pg.identity_enabled;
        const gid = pg.identityGuildId ?? pg.identity_guild_id;
        if(enabled && gid) return String(gid);
        return null;
    }

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
    if(member.user?.bot) return; // never touch bots

    let full: GuildMember;
    try {
        full = member.partial ? await member.fetch() : member as GuildMember;
    } catch {
        return; // member left, or fetch failed - do nothing
    }

    // If the role was deleted or the bot can't manage it, bail quietly rather
    // than error-looping on every profile update in the server.
    const role = full.guild.roles.cache.get(cfg.roleId);
    if(!role) return;
    const me = full.guild.members.me;
    if(!me || !me.permissions.has('ManageRoles') || role.position >= me.roles.highest.position) {
        return; // can't manage this role; silently skip
    }

    const displayingTag = readIdentityGuildId(full) === cfg.guildId;
    const hasRole = full.roles.cache.has(cfg.roleId);

    // Nothing to do - avoids a pointless API call on every unrelated update.
    if(displayingTag === hasRole) return;

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
