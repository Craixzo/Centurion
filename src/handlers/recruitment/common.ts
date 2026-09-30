import { GuildMember } from 'discord.js';
import { config } from '../../config';
import { RecruitmentBranch } from '../../structures/types';

export const Status = {
    PendingBranch: 'PENDING_BRANCH',
    Awaiting: 'AWAITING_OFFICER',
    Assigned: 'OFFICER_ASSIGNED',
    Contact: 'CONTACT_ESTABLISHED',
    Training: 'TRAINING',
    Ready: 'READY_FOR_PLACEMENT',
    Completed: 'COMPLETED',
    Closed: 'CLOSED',
} as const;

export const STATUS_LABELS: Record<string, string> = {
    PENDING_BRANCH: 'Choosing Branch',
    AWAITING_OFFICER: 'Awaiting Officer',
    OFFICER_ASSIGNED: 'Officer Assigned',
    CONTACT_ESTABLISHED: 'Contact Established',
    TRAINING: 'Training',
    READY_FOR_PLACEMENT: 'Ready for Placement',
    COMPLETED: 'Completed',
    CLOSED: 'Closed',
};

/** Statuses where an officer holds the recruit. */
export const CLAIMED_STATUSES: string[] = [ Status.Assigned, Status.Contact, Status.Training, Status.Ready ];

export const CLOSE_REASONS = [
    'Candidate unresponsive',
    'Candidate withdrew',
    'Not eligible',
    'Duplicate request',
    'Other',
];

export const OTHER_DIVISION = 'Other / Undecided';

export const settings = () => config.recruitment;

export const isEnabled = (): boolean => !!config.recruitment?.enabled && !!config.recruitment.guildId;

export const getBranches = (): RecruitmentBranch[] => config.recruitment?.branches || [];

export const getBranch = (key?: string | null): RecruitmentBranch | undefined =>
    key ? getBranches().find((branch) => branch.key === key) : undefined;

export const getGeneralBranch = (): RecruitmentBranch | undefined => getBranches().find((branch) => branch.general);

export const branchName = (key?: string | null): string => getBranch(key)?.name || 'Not selected';

export const allOfficerRoleIds = (): string[] => {
    const ids = new Set<string>(config.recruitment?.leadershipRoleIds || []);
    for(const branch of getBranches()) branch.officerRoleIds.forEach((id) => ids.add(id));
    return [ ... ids ].filter(Boolean);
};

/** Every role that marks someone as already placed in the military. */
export const placedRoleIds = (): string[] => {
    const ids: string[] = [];
    for(const branch of getBranches()) {
        if(branch.roleId) ids.push(branch.roleId);
        for(const division of branch.divisions || []) if(division.roleId) ids.push(division.roleId);
    }
    return ids;
};

const hasAny = (member: GuildMember, ids: string[]) => ids.some((id) => id && member.roles.cache.has(id));

export const isLeadership = (member?: GuildMember | null): boolean => {
    if(!member) return false;
    return hasAny(member, config.permissions.all || []) || hasAny(member, config.recruitment?.leadershipRoleIds || []);
};

/**
 * May this member claim or manage recruits in this branch? The general queue
 * is open to any recruitment officer, since its whole point is finding the
 * right branch.
 */
export const canHandleBranch = (member: GuildMember | null | undefined, branchKey?: string | null): boolean => {
    if(!member) return false;
    if(isLeadership(member)) return true;
    const branch = getBranch(branchKey);
    if(!branch) return false;
    if(branch.general) return hasAny(member, allOfficerRoleIds());
    return hasAny(member, branch.officerRoleIds);
};

export const isRecruitmentOfficer = (member?: GuildMember | null): boolean =>
    !!member && (isLeadership(member) || hasAny(member, allOfficerRoleIds()));

/** Assigned officer, or anyone with leadership. */
export const canManageRequest = (member: GuildMember | null | undefined, request: any): boolean =>
    !!member && (member.id === request.officerId || isLeadership(member));

export const hoursToMs = (hours: number) => hours * 60 * 60 * 1000;
