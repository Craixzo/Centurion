import { provider } from '../database';
import { robloxClient } from '../main';
import { getAllGroupIds } from '../handlers/groupResolver';

/**
 * Safety net only. Native community bans already block rejoining, so this
 * exists to catch anyone flagged in the database who is somehow still a
 * member, per group.
 */
const checkBansForGroup = async (groupId: number) => {
    const robloxGroup = await robloxClient.getGroup(groupId);
    const bannedUsers = await provider.findBannedUsers(groupId);

    for(const user of bannedUsers) {
        try {
            const member = await robloxGroup.getMember(Number(user.robloxId));
            if(!member) continue;
            await robloxGroup.kickMember(member.id);
        } catch (err) { /* not a member, or no permission */ }
    }
}

const checkBans = async () => {
    for(const groupId of getAllGroupIds()) {
        try {
            await checkBansForGroup(groupId);
        } catch (err) {
            console.error(`[bans] group ${groupId}:`, err);
        }
    }
    setTimeout(checkBans, 30000);
}

export { checkBans };
