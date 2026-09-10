/**
 * Resolves which Roblox group a given action targets.
 *
 * Precedence, highest first:
 *   1. An explicit `--group` / `group:` argument naming a secondaryGroup
 *   2. The guild the command was run in, via config.guildGroups
 *   3. config.groupId (the default group)
 *
 * Background jobs and the REST API don't have a guild, so they use
 * getAllGroupIds() to iterate every group the bot is responsible for.
 */

import { config } from '../config';
import { robloxClient } from '../main';
import { Group } from '../roblox/client';

export class GroupResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GroupResolutionError';
    }
}

/**
 * Every group this bot manages: the default, everything bound to a guild,
 * and every secondary group. Deduplicated, default first.
 */
export const getAllGroupIds = (): number[] => {
    const ids = [
        config.groupId,
        ... Object.values(config.guildGroups || {}),
        ... (config.secondaryGroups || []).map((group) => group.id),
    ].filter((id) => typeof id === 'number' && id > 0);

    return [ ... new Set(ids) ];
}

/**
 * The group bound to a guild, or the default group if that guild has no
 * binding. Returns null only when nothing is configured at all.
 */
export const getGroupIdForGuild = (guildId?: string | null): number | null => {
    if(guildId && config.guildGroups && config.guildGroups[guildId]) {
        return config.guildGroups[guildId];
    }
    return config.groupId || null;
}

/**
 * Full resolution for a command invocation.
 *
 * `groupFlag` is the raw value of the command's `group` argument, if the
 * command has one and the user supplied it. Throws GroupResolutionError if
 * the name doesn't match a configured secondary group, so callers can show
 * the invalid-group embed.
 */
export const resolveGroupId = (guildId?: string | null, groupFlag?: string | null): number => {
    if(groupFlag) {
        const match = (config.secondaryGroups || []).find(
            (group) => group.name.toLowerCase() === String(groupFlag).toLowerCase(),
        );
        if(!match) throw new GroupResolutionError(`No secondary group named "${groupFlag}".`);
        return match.id;
    }

    const groupId = getGroupIdForGuild(guildId);
    if(!groupId) throw new GroupResolutionError('No group is configured for this server.');
    return groupId;
}

/**
 * As resolveGroupId, but returns the Group object ready to act on.
 * getGroup() caches instances, so repeat calls are cheap.
 */
export const resolveGroup = async (guildId?: string | null, groupFlag?: string | null): Promise<Group> => {
    return robloxClient.getGroup(resolveGroupId(guildId, groupFlag));
}

/** Human-readable label for logs and embeds. */
export const getGroupLabel = (groupId: number): string => {
    if(groupId === config.groupId) return 'Main';
    const secondary = (config.secondaryGroups || []).find((group) => group.id === groupId);
    return secondary ? secondary.name : String(groupId);
}

/**
 * The group XP progression acts on. Uses config.xpSystem.groupId if set,
 * otherwise falls back to the guild's group / default. XP balances are global;
 * this only controls which group's ranks a rankup moves someone through.
 */
export const resolveXpGroup = async (guildId?: string | null) => {
    const override = (config as any).xpSystem?.groupId;
    if(override) return robloxClient.getGroup(Number(override));
    return resolveGroup(guildId);
}
