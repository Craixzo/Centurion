/**
 * Drop-in replacement for the bloxy `Client` and `Group` objects.
 *
 * Every method name and return shape here matches what qbot's existing code
 * already calls, so the rest of the codebase does not change. Internally it
 * talks to Open Cloud v2 with an API key, falling back to the cookie only for
 * kick and community ban (see rest.ts).
 */

import { openCloud, openCloudList, legacy, publicApi } from './rest';

const USERS_BASE = 'https://users.roblox.com';
const THUMBNAILS_BASE = 'https://thumbnails.roblox.com';
const GROUPS_BASE = 'https://groups.roblox.com';

const ROLE_CACHE_TTL = 60 * 1000;

export interface GroupRole {
    id: number;
    name: string;
    rank: number;
    memberCount: number;
}

export interface GroupJoinRequest {
    requester: { userId: number; username: string; displayName: string };
    created: string;
    joinRequestId: string;
}

/** Strips 'groups/123/roles/456' down to 456. */
const idFromPath = (path: string): number => Number(String(path).split('/').pop());

/** Strips 'groups/123/memberships/ABC' to 'ABC' (membership ids are opaque strings). */
const tokenFromPath = (path: string): string => String(path).split('/').pop();

// ------------------------------------------------------------------- users

export class RobloxUser {
    public id: number;
    public name: string;
    public displayName: string;

    constructor(data: { id: number; name: string; displayName: string }) {
        this.id = data.id;
        this.name = data.name;
        this.displayName = data.displayName;
    }

    /** handleRobloxUser.ts calls robloxQuery[0].getUser() on a username hit. */
    async getUser(): Promise<RobloxUser> {
        return getUserById(this.id);
    }

    /** locale.ts renders the user's primary group on the info embeds. */
    async getPrimaryGroup(): Promise<any | null> {
        try {
            const data = await publicApi('GET', `${GROUPS_BASE}/v1/users/${this.id}/groups/primary/role`);
            if(!data?.group) return null;
            return {
                group: data.group,
                role: data.role || null,
                id: data.group.id,
                name: data.group.name,
            };
        } catch {
            return null;
        }
    }

    /** acceptjoin.ts / denyjoin.ts check for a pending request before acting. */
    async getJoinRequestInGroup(groupId: number): Promise<GroupJoinRequest | null> {
        const page = await openCloud('GET', `/cloud/v2/groups/${groupId}/join-requests`, {
            query: { maxPageSize: 1, filter: `user=='users/${this.id}'` },
        });
        const request = page?.groupJoinRequests?.[0];
        if(!request) return null;
        return {
            requester: { userId: this.id, username: this.name, displayName: this.displayName },
            created: request.createTime,
            joinRequestId: tokenFromPath(request.path),
        };
    }
}

/** Aliases matching the names the rest of the codebase imported from bloxy. */
export type User = RobloxUser;
export type PartialUser = RobloxUser;

const getUserById = async (userId: number | string): Promise<RobloxUser> => {
    const data = await publicApi('GET', `${USERS_BASE}/v1/users/${userId}`);
    return new RobloxUser({ id: data.id, name: data.name, displayName: data.displayName });
}

const getUsersByIds = async (userIds: number[]): Promise<RobloxUser[]> => {
    if(userIds.length === 0) return [];
    const data = await publicApi('POST', `${USERS_BASE}/v1/users`, {
        userIds,
        excludeBannedUsers: false,
    });
    return (data?.data || []).map((user: any) => new RobloxUser({
        id: user.id,
        name: user.name,
        displayName: user.displayName,
    }));
}

// ------------------------------------------------------------------ member

export class GroupMember extends RobloxUser {
    public role: GroupRole;
    public membershipId: string;
    private group: Group;

    constructor(group: Group, data: { id: number; name: string; displayName: string; role: GroupRole; membershipId: string }) {
        super(data);
        this.group = group;
        this.role = data.role;
        this.membershipId = data.membershipId;
    }

    /** events/bans.ts calls member.kickFromGroup(groupId). */
    async kickFromGroup(_groupId?: number): Promise<void> {
        await this.group.kickMember(this.id);
    }
}

// ------------------------------------------------------------------- group

export class Group {
    public id: number;
    public name: string;
    public description: string;
    public memberCount: number;
    public shout: any;

    private roleCache: GroupRole[] | null = null;
    private roleCacheAt = 0;

    constructor(id: number) {
        this.id = id;
    }

    async getRoles(force = false): Promise<GroupRole[]> {
        if(!force && this.roleCache && Date.now() - this.roleCacheAt < ROLE_CACHE_TTL) {
            return this.roleCache;
        }

        // maxPageSize is capped at 20 by Roblox, so this always paginates for
        // groups with a deep rank ladder.
        const roles = await openCloudList(
            `/cloud/v2/groups/${this.id}/roles`,
            'groupRoles',
            { maxPageSize: 20 },
        );

        this.roleCache = roles.map((role: any) => ({
            id: Number(role.id),
            name: role.displayName,
            rank: Number(role.rank ?? 0),
            memberCount: Number(role.memberCount ?? 0),
        })).sort((a, b) => a.rank - b.rank);

        this.roleCacheAt = Date.now();
        return this.roleCache;
    }

    private async fetchMembership(userId: number | string): Promise<any | null> {
        const page = await openCloud('GET', `/cloud/v2/groups/${this.id}/memberships`, {
            query: { maxPageSize: 1, filter: `user=='users/${userId}'` },
        });
        return page?.groupMemberships?.[0] || null;
    }

    /**
     * Returns null when the user is not in the group, matching how qbot's
     * existing call sites test the result.
     */
    async getMember(userId: number | string): Promise<GroupMember | null> {
        const membership = await this.fetchMembership(userId);
        if(!membership) return null;

        const roleId = idFromPath(membership.role);
        let roles = await this.getRoles();
        let role = roles.find((r) => r.id === roleId);
        // Role list is cached; a brand-new rank may not be in it yet.
        if(!role) role = (await this.getRoles(true)).find((r) => r.id === roleId);

        const user = await getUserById(userId);

        return new GroupMember(this, {
            id: user.id,
            name: user.name,
            displayName: user.displayName,
            role,
            membershipId: tokenFromPath(membership.path),
        });
    }

    /**
     * Sets a member's rank.
     *
     * Communities let a member hold more than one role, and assignRole adds
     * rather than replaces. To preserve qbot's single-rank behaviour we assign
     * the new role, then unassign the previous one if it survived. Base roles
     * (Owner/Member/Guest) cannot be unassigned, so that step may fail and is
     * intentionally swallowed.
     */
    async updateMember(userId: number | string, roleId: number): Promise<GroupMember | null> {
        const membership = await this.fetchMembership(userId);
        if(!membership) return null;

        const membershipId = tokenFromPath(membership.path);
        const previousRolePath = membership.role;
        const newRolePath = `groups/${this.id}/roles/${roleId}`;

        const updated = await openCloud(
            'POST',
            `/cloud/v2/groups/${this.id}/memberships/${membershipId}:assignRole`,
            { body: { role: newRolePath } },
        );

        const stillHeld: string[] = updated?.roles || [];
        if(previousRolePath && previousRolePath !== newRolePath && stillHeld.includes(previousRolePath)) {
            try {
                await openCloud(
                    'POST',
                    `/cloud/v2/groups/${this.id}/memberships/${membershipId}:unassignRole`,
                    { body: { role: previousRolePath } },
                );
            } catch { /* base roles cannot be unassigned; not an error */ }
        }

        this.roleCacheAt = 0; // member counts moved
        return this.getMember(userId);
    }

    async getJoinRequests(options: { limit?: number } = {}): Promise<{ data: GroupJoinRequest[] }> {
        const wanted = options.limit || 20;
        const requests = (await openCloudList(
            `/cloud/v2/groups/${this.id}/join-requests`,
            'groupJoinRequests',
            { maxPageSize: 20 },
        )).slice(0, wanted);

        // Open Cloud returns only 'users/123', but the embeds render usernames.
        const userIds = requests.map((request: any) => Number(tokenFromPath(request.user)));
        const users = await getUsersByIds(userIds);
        const byId = new Map(users.map((user) => [ user.id, user ]));

        return {
            data: requests.map((request: any) => {
                const id = Number(tokenFromPath(request.user));
                const user = byId.get(id);
                return {
                    requester: {
                        userId: id,
                        username: user?.name || String(id),
                        displayName: user?.displayName || String(id),
                    },
                    created: request.createTime,
                    joinRequestId: tokenFromPath(request.path),
                };
            }),
        };
    }

    private async findJoinRequestId(userId: number | string): Promise<string | null> {
        const page = await openCloud('GET', `/cloud/v2/groups/${this.id}/join-requests`, {
            query: { maxPageSize: 1, filter: `user=='users/${userId}'` },
        });
        const request = page?.groupJoinRequests?.[0];
        return request ? tokenFromPath(request.path) : null;
    }

    async acceptJoinRequest(userId: number | string): Promise<void> {
        const id = await this.findJoinRequestId(userId);
        if(!id) throw new Error('No pending join request for that user.');
        await openCloud('POST', `/cloud/v2/groups/${this.id}/join-requests/${id}:accept`, { body: {} });
    }

    async declineJoinRequest(userId: number | string): Promise<void> {
        const id = await this.findJoinRequestId(userId);
        if(!id) throw new Error('No pending join request for that user.');
        await openCloud('POST', `/cloud/v2/groups/${this.id}/join-requests/${id}:decline`, { body: {} });
    }

    async updateShout(content: string): Promise<any> {
        return openCloud('PATCH', `/legacy-groups/v1/groups/${this.id}/status`, {
            body: { message: content },
        });
    }

    // --------------------------------------------------------- kick and ban
    // No Open Cloud equivalent exists for either. Cookie-only.

    /** Removes a member from the community. This is what used to be "exile". */
    async kickMember(userId: number | string): Promise<void> {
        await legacy('DELETE', `${GROUPS_BASE}/v1/groups/${this.id}/users/${userId}`);
    }

    /**
     * Native community ban. This removes the user AND blocks them from
     * rejoining, so it replaces the old kick-on-a-loop approach entirely.
     */
    async banMember(userId: number | string): Promise<void> {
        await legacy('POST', `${GROUPS_BASE}/v1/groups/${this.id}/bans/${userId}`, {});
    }

    async unbanMember(userId: number | string): Promise<void> {
        await legacy('DELETE', `${GROUPS_BASE}/v1/groups/${this.id}/bans/${userId}`);
    }

    /** Returns the ban record for a user, or null if they are not banned. */
    async getBan(userId: number | string): Promise<any | null> {
        try {
            return await legacy('GET', `${GROUPS_BASE}/v1/groups/${this.id}/bans/${userId}`);
        } catch (err: any) {
            if(err?.status === 404 || err?.status === 400) return null;
            throw err;
        }
    }
}

// ------------------------------------------------------------------ client

export class RobloxClient {
    public user: { id: number; name: string } | null = null;

    /**
     * Verifies credentials and resolves the acting account.
     *
     * audit.ts compares log actors against robloxClient.user.id to skip the
     * bot's own rank changes, so this must be the account that owns the API
     * key. Set ROBLOX_ACTING_USER_ID to avoid a cookie call at startup.
     */
    async login(): Promise<void> {
        if(process.env.ROBLOX_ACTING_USER_ID) {
            const user = await getUserById(Number(process.env.ROBLOX_ACTING_USER_ID));
            this.user = { id: user.id, name: user.name };
            return;
        }

        const data = await legacy('GET', `${USERS_BASE}/v1/users/authenticated`);
        this.user = { id: data.id, name: data.name };
    }

    async getUser(userId: number | string): Promise<RobloxUser> {
        return getUserById(userId);
    }

    async getUsersByUsernames(usernames: string[]): Promise<RobloxUser[]> {
        const data = await publicApi('POST', `${USERS_BASE}/v1/usernames/users`, {
            usernames,
            excludeBannedUsers: false,
        });
        return (data?.data || []).map((user: any) => new RobloxUser({
            id: user.id,
            name: user.name,
            displayName: user.displayName,
        }));
    }

    /**
     * Group instances are cached so the role cache survives across calls.
     * The multigroup branch calls getGroup() on every command that targets a
     * secondary group, and re-paginating the role list each time would burn
     * the rate limit for nothing.
     */
    private groupCache = new Map<number, Group>();

    async getGroup(groupId: number): Promise<Group> {
        const group = this.groupCache.get(groupId) || new Group(groupId);
        this.groupCache.set(groupId, group);

        const info = await openCloud('GET', `/cloud/v2/groups/${groupId}`);
        group.name = info?.displayName;
        group.description = info?.description;

        // Open Cloud's Get Group does not return a member count, so derive it
        // from the per-role counts we already need anyway.
        const roles = await group.getRoles();
        group.memberCount = roles.reduce((total, role) => total + role.memberCount, 0);

        // The shout is not exposed by Open Cloud at all.
        try {
            const legacyInfo = await publicApi('GET', `${GROUPS_BASE}/v1/groups/${groupId}`);
            group.shout = legacyInfo?.shout || null;
        } catch {
            group.shout = null;
        }

        return group;
    }

    /** Compatibility shim for the three `apis.*` call sites. */
    public apis = {
        usersAPI: {
            getUserById: async (options: any) => {
                const id = typeof options === 'object' ? options.userId : options;
                return getUserById(id);
            },
        },

        thumbnailsAPI: {
            getUsersAvatarHeadShotImages: async (options: { userIds: number[]; size?: string; format?: string; isCircular?: boolean }) => {
                const query = new URLSearchParams({
                    userIds: options.userIds.join(','),
                    size: options.size || '150x150',
                    format: options.format || 'png',
                    isCircular: String(options.isCircular ?? false),
                });
                return publicApi('GET', `${THUMBNAILS_BASE}/v1/users/avatar-headshot?${query}`);
            },
        },

        groupsAPI: {
            getAuditLogs: async (options: { groupId: number; actionType?: string; limit?: number; sortOrder?: string; cursor?: string }) => {
                // Proxied through Open Cloud, so this uses the API key rather
                // than a cookie. Needs the legacy-group:manage scope.
                return openCloud('GET', `/legacy-groups/v1/groups/${options.groupId}/audit-log`, {
                    query: {
                        actionType: options.actionType,
                        limit: options.limit || 10,
                        sortOrder: options.sortOrder || 'Desc',
                        cursor: options.cursor,
                    },
                });
            },
        },
    };
}
