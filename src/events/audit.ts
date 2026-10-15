import { robloxClient } from '../main';
import { logAction } from '../handlers/handleLogging';
import { getAllGroupIds, getGroupLabel } from '../handlers/groupResolver';
import { checkRankSkip, isRankSkipGroup } from '../handlers/rankSkip';
import { config } from '../config';

/** Newest audit entry already seen, per group. */
const lastRecordedDate = new Map<number, number>();

/** Logs manual (non-bot) rank changes in one group, and reverts rank skips in military groups. */
const recordGroup = async (groupId: number) => {
    const auditLog = await robloxClient.apis.groupsAPI.getAuditLogs({
        groupId,
        actionType: 'ChangeRank',
        limit: 50,
        sortOrder: 'Desc',
    });
    if(!auditLog?.data?.length) return;

    const mostRecentDate = new Date(auditLog.data[0].created).getTime();
    const previous = lastRecordedDate.get(groupId);
    lastRecordedDate.set(groupId, mostRecentDate);
    if(!previous) return; // first poll only sets the starting point

    const group = await robloxClient.getGroup(groupId);
    const groupRoles = await group.getRoles();
    const label = getGroupLabel(groupId);

    // Oldest first, so a chain of changes is handled in the order it happened.
    const fresh = auditLog.data
        .filter((log: any) => Math.round(new Date(log.created).getTime() / 1000) > Math.round(previous / 1000))
        .reverse();

    for(const log of fresh) {
        if(robloxClient.user.id === log.actor.user.userId) continue;
        try {
            const oldRole = groupRoles.find((role) => role.id === log.description['OldRoleSetId']);
            const newRole = groupRoles.find((role) => role.id === log.description['NewRoleSetId']);
            const target = await robloxClient.getUser(log.description['TargetId']);
            const change = `${oldRole ? `${oldRole.name} (${oldRole.rank})` : 'Unknown'} → ${newRole ? `${newRole.name} (${newRole.rank})` : 'Unknown'}`;
            logAction('Manual Set Rank', log.actor.user, null, target, `[${label}] ${change}`);

            if(!oldRole || !newRole || !isRankSkipGroup(groupId)) continue;
            const check = await checkRankSkip(groupId, groupRoles, target.id, oldRole.rank, newRole.rank);
            if(check.allowed === true) {
                if(check.usedException) logAction('Rank Skip Allowed', log.actor.user, `Exception granted by <@${check.usedException.grantedBy}>`, target, `[${label}] ${change}`);
                continue;
            }

            const result = check as { steps: number; skipped: string[] };
            // Only undo it if they are still at the skipped-to rank.
            const member = await group.getMember(target.id).catch((): null => null);
            if(!member || member.role.rank !== newRole.rank) continue;
            await group.updateMember(target.id, oldRole.id);
            logAction('Rank Skip Reverted', log.actor.user,
                `Skipped ${result.skipped.join(', ') || `${result.steps - 1} rank(s)`}. Promote one rank at a time.`,
                target, `[${label}] ${change} (reverted to ${oldRole.name})`);
        } catch (err) {
            console.error(`[audit] group ${groupId}:`, err);
        }
    }
};

/** Groups that failed (bot not in them, no API key access): skipped until this time. */
const retryAt = new Map<number, number>();
const RETRY_AFTER = 30 * 60 * 1000;

/** Every managed group plus every rank-skip group. */
const watchedGroupIds = (): number[] => [ ... new Set([
    ... getAllGroupIds(),
    ... (config.rankSkip?.enabled ? (config.rankSkip.groups || []).map((group) => group.id) : []),
]) ].filter((id) => typeof id === 'number' && id > 0);

const recordAuditLogs = async () => {
    for(const groupId of watchedGroupIds()) {
        if((retryAt.get(groupId) || 0) > Date.now()) continue;
        try {
            await recordGroup(groupId);
            if(retryAt.has(groupId)) {
                retryAt.delete(groupId);
                console.log(`[audit] group ${groupId} (${getGroupLabel(groupId)}) is reachable again.`);
            }
        } catch (err: any) {
            // A group the bot can't read must never stop the others or crash the bot.
            if(!retryAt.has(groupId)) {
                console.warn(`[audit] cannot read the rank log for group ${groupId} (${getGroupLabel(groupId)}): ${err?.message || err}. Check that the API key has access to this group. Retrying every 30 minutes.`);
            }
            retryAt.set(groupId, Date.now() + RETRY_AFTER);
        }
    }
    setTimeout(recordAuditLogs, 60000);
}

export { recordAuditLogs };
