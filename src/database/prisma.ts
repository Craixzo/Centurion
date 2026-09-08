import { PrismaClient } from '@prisma/client';
import { DatabaseProvider } from '../structures/DatabaseProvider';
import { DatabaseUser } from '../structures/types';
require('dotenv').config();

/**
 * Two stores behind one interface:
 *
 *   User      - per-group. Suspensions and bans, keyed by (robloxId, groupId).
 *   XpRecord  - global. One XP balance per Roblox user, shared everywhere.
 *
 * findUser() merges the two so existing call sites keep reading `userData.xp`,
 * and updateUser() routes an `xp` field to the global store automatically.
 * Nothing outside this file needs to know they are separate.
 */
class PrismaProvider extends DatabaseProvider {
    db: PrismaClient;

    constructor() {
        super();
        this.db = new PrismaClient();
    }

    private key(robloxId: string, groupId: number | string) {
        return { robloxId_groupId: { robloxId, groupId: String(groupId) } };
    }

    private async findXpRecord(robloxId: string) {
        let record = await this.db.xpRecord.findUnique({ where: { robloxId } });
        if(!record) record = await this.db.xpRecord.create({ data: { robloxId } });
        return record;
    }

    async findUser(robloxId: string, groupId: number | string): Promise<DatabaseUser> {
        let userData = await this.db.user.findUnique({ where: this.key(robloxId, groupId) });
        if(!userData) userData = await this.db.user.create({ data: { robloxId, groupId: String(groupId) } });

        const xpRecord = await this.findXpRecord(robloxId);
        return { ... userData, xp: xpRecord.xp } as DatabaseUser;
    }

    async findSuspendedUsers(groupId?: number | string): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({
            where: {
                suspendedUntil: { not: null },
                ... (groupId !== undefined ? { groupId: String(groupId) } : {}),
            },
        }) as DatabaseUser[];
    }

    async findBannedUsers(groupId?: number | string): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({
            where: {
                isBanned: true,
                ... (groupId !== undefined ? { groupId: String(groupId) } : {}),
            },
        }) as DatabaseUser[];
    }

    async updateUser(robloxId: string, groupId: number | string, data: any) {
        const { xp, ... groupScoped } = data || {};

        if(xp !== undefined) {
            await this.findXpRecord(robloxId);
            await this.db.xpRecord.update({ where: { robloxId }, data: { xp: Number(xp) } });
        }

        if(Object.keys(groupScoped).length > 0) {
            await this.findUser(robloxId, groupId);
            await this.db.user.update({ where: this.key(robloxId, groupId), data: groupScoped });
        }
    }

    /** Atomic increment, so concurrent message XP cannot clobber itself. */
    async addXp(robloxId: string, amount: number): Promise<number> {
        await this.findXpRecord(robloxId);
        const updated = await this.db.xpRecord.update({
            where: { robloxId },
            data: { xp: { increment: amount } },
        });
        return updated.xp;
    }

    async getTopXp(limit: number): Promise<{ robloxId: string; xp: number }[]> {
        const records = await this.db.xpRecord.findMany({
            where: { xp: { gt: 0 } },
            orderBy: { xp: 'desc' },
            take: limit,
        });
        return records.map((record) => ({ robloxId: record.robloxId, xp: record.xp }));
    }

    /** 1-based position on the global leaderboard, or 0 if unranked. */
    async getXpRank(robloxId: string): Promise<number> {
        const record = await this.db.xpRecord.findUnique({ where: { robloxId } });
        if(!record || record.xp <= 0) return 0;
        const ahead = await this.db.xpRecord.count({ where: { xp: { gt: record.xp } } });
        return ahead + 1;
    }

    // ------------------------------------------------------------ sessions

    async createSession(data: any) {
        return this.db.session.create({ data });
    }

    async findSessionByMessage(messageId: string) {
        return this.db.session.findUnique({ where: { messageId } });
    }

    async findSessionById(id: string) {
        return this.db.session.findUnique({ where: { id } });
    }

    async findRecentSessions(guildId: string, limit: number) {
        return this.db.session.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /** Upsert, so clicking the other button just flips the answer. */
    async setRsvp(sessionId: string, discordId: string, attending: boolean) {
        await this.db.sessionRsvp.upsert({
            where: { sessionId_discordId: { sessionId, discordId } },
            update: { attending },
            create: { sessionId, discordId, attending },
        });
    }

    async getRsvps(sessionId: string, attending?: boolean) {
        return this.db.sessionRsvp.findMany({
            where: { sessionId, ... (attending !== undefined ? { attending } : {}) },
        });
    }

    async removeRsvp(sessionId: string, discordId: string) {
        await this.db.sessionRsvp.deleteMany({ where: { sessionId, discordId } });
    }

    async closeSession(id: string) {
        await this.db.session.update({ where: { id }, data: { closed: true } });
    }
}

export { PrismaProvider };
