import { GuildMember, TextChannel } from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { robloxClient } from '../main';
import { getLinkedRobloxUser } from './accountLinks';
import { resolveGroup } from './groupResolver';

/**
 * Shared moderation core: records every action to the mod log, and optionally
 * syncs the equivalent action to Roblox.
 *
 * Cross-platform sync only works for users linked via Bloxlink/RoWifi, and the
 * Roblox side (group ban/kick) needs the cookie on the primary group. If the
 * user isn't linked, the Discord action still happens and the sync is noted as
 * skipped.
 */

export interface ModResult {
    logged: boolean;
    syncedToRoblox: boolean;
    syncNote?: string;
}

const syncDefault = (action: string): boolean => {
    const map = config.moderation?.syncDefaults || {};
    return Boolean(map[action]);
}

/**
 * @param sync  undefined = use the per-command config default; true/false = override
 */
export const recordAction = async (
    guildId: string,
    moderator: GuildMember,
    targetId: string,
    action: 'ban' | 'kick' | 'mute' | 'warn' | 'note',
    reason: string | null,
    sync?: boolean,
): Promise<ModResult> => {
    const wantSync = sync === undefined ? syncDefault(action) : sync;
    let syncedToRoblox = false;
    let syncNote: string | undefined;

    // Only ban and kick have a Roblox equivalent.
    if(wantSync && (action === 'ban' || action === 'kick')) {
        try {
            const robloxUser = await getLinkedRobloxUser(targetId, guildId);
            if(!robloxUser) {
                syncNote = 'Not synced: no linked Roblox account.';
            } else {
                const group = await resolveGroup(guildId);
                if(action === 'ban') await group.banMember(robloxUser.id);
                else await group.kickMember(robloxUser.id);
                syncedToRoblox = true;
            }
        } catch (err: any) {
            syncNote = `Roblox sync failed: ${err?.message || 'unknown error'}`;
            console.error('[moderation] sync failed:', err);
        }
    } else if(wantSync && (action === 'mute' || action === 'warn')) {
        syncNote = `${action} has no Roblox equivalent; Discord only.`;
    }

    await provider.addModLog({
        guildId,
        targetId,
        moderatorId: moderator.id,
        action,
        reason,
        synced: syncedToRoblox,
    });

    return { logged: true, syncedToRoblox, syncNote };
}
