import { provider } from '../database';
import { robloxClient } from '../main';
import { config } from '../config';
import { getAllGroupIds } from '../handlers/groupResolver';

/**
 * Suspensions are per-group: a user suspended in one community is untouched
 * in the others. Each group's rows are enforced against that group only.
 */
const checkSuspensionsForGroup = async (groupId: number) => {
    const robloxGroup = await robloxClient.getGroup(groupId);
    const suspensions = await provider.findSuspendedUsers(groupId);
    const groupRoles = await robloxGroup.getRoles();
    const suspendedRole = groupRoles.find((role) => role.rank === config.suspendedRank);
    if(!suspendedRole) return;

    for(const suspension of suspensions) {
        try {
            const robloxMember = await robloxGroup.getMember(Number(suspension.robloxId));
            if(!robloxMember) continue;

            if(robloxMember.role.rank !== config.suspendedRank) {
                await robloxGroup.updateMember(robloxMember.id, suspendedRole.id);
            }

            if(!suspension.suspendedUntil) continue;
            if(suspension.suspendedUntil.getTime() >= new Date().getTime()) continue;

            const unsuspendRole = groupRoles.find((role) => role.id === suspension.unsuspendRank);
            await provider.updateUser(suspension.robloxId, groupId, { suspendedUntil: null, unsuspendRank: null });

            if(!unsuspendRole || unsuspendRole.rank === config.suspendedRank) continue;
            await robloxGroup.updateMember(robloxMember.id, unsuspendRole.id);
        } catch (err) {
            console.error(`[suspensions] group ${groupId}, user ${suspension.robloxId}:`, err);
        }
    }
}

const checkSuspensions = async () => {
    for(const groupId of getAllGroupIds()) {
        try {
            await checkSuspensionsForGroup(groupId);
        } catch (err) {
            console.error(`[suspensions] group ${groupId}:`, err);
        }
    }
    setTimeout(checkSuspensions, 15000);
}

export { checkSuspensions };
