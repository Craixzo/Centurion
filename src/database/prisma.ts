import { PrismaClient } from '@prisma/client';
import { DatabaseProvider } from '../structures/DatabaseProvider';
import { DatabaseUser, GroupUserRecord } from '../structures/types';
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

    async findSuspendedUsers(groupId?: number | string): Promise<GroupUserRecord[]> {
        return await this.db.user.findMany({
            where: {
                suspendedUntil: { not: null },
                ... (groupId !== undefined ? { groupId: String(groupId) } : {}),
            },
        });
    }

    async findBannedUsers(groupId?: number | string): Promise<GroupUserRecord[]> {
        return await this.db.user.findMany({
            where: {
                isBanned: true,
                ... (groupId !== undefined ? { groupId: String(groupId) } : {}),
            },
        });
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

    // ------------------------------------------------------------ events

    async createEvent(data: any) {
        return this.db.event.create({ data });
    }

    async findEventByMessage(messageId: string) {
        return this.db.event.findUnique({ where: { messageId } });
    }

    async findEventById(id: string) {
        return this.db.event.findUnique({ where: { id } });
    }

    async findRecentEvents(guildId: string, limit: number) {
        return this.db.event.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /** Upsert, so clicking the other button just flips the answer. */
    async setRsvp(eventId: string, discordId: string, attending: boolean) {
        await this.db.eventRsvp.upsert({
            where: { eventId_discordId: { eventId, discordId } },
            update: { attending },
            create: { eventId, discordId, attending },
        });
    }

    async getRsvps(eventId: string, attending?: boolean) {
        return this.db.eventRsvp.findMany({
            where: { eventId, ... (attending !== undefined ? { attending } : {}) },
        });
    }

    async removeRsvp(eventId: string, discordId: string) {
        await this.db.eventRsvp.deleteMany({ where: { eventId, discordId } });
    }

    async countEventsByHost(guildId: string, hostId: string, since: Date): Promise<number> {
        return this.db.event.count({ where: { guildId, hostId, createdAt: { gte: since } } });
    }

    /** One pass for the whole roster, rather than a query per officer. */
    async countEventsByAllHosts(guildId: string, since: Date): Promise<Record<string, number>> {
        const events = await this.db.event.findMany({
            where: { guildId, createdAt: { gte: since } },
            select: { hostId: true },
        });
        const counts: Record<string, number> = {};
        for(const event of events) counts[event.hostId] = (counts[event.hostId] || 0) + 1;
        return counts;
    }

    /** Upcoming or just-started events that still owe the host a reminder. */
    async findEventsNeedingReminders(before: Date) {
        return this.db.event.findMany({
            where: {
                closed: false,
                startsAt: { not: null, lte: before },
                OR: [ { remind5Sent: false }, { remindStartSent: false } ],
            },
        });
    }

    async markEventReminded(id: string, field: 'remind5Sent' | 'remindStartSent') {
        await this.db.event.update({ where: { id }, data: { [field]: true } });
    }

    // ---------------------------------------------------------------- loa

    async createLoa(data: any) {
        return this.db.loa.create({ data });
    }

    /** A live LOA for this person right now, or null. */
    async findActiveLoa(guildId: string, discordId: string) {
        const now = new Date();
        return this.db.loa.findFirst({
            where: { guildId, discordId, endedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
        });
    }

    async findActiveLoas(guildId: string) {
        const now = new Date();
        return this.db.loa.findMany({
            where: { guildId, endedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
            orderBy: { endsAt: 'asc' },
        });
    }

    /** Any LOA touching the given window — used for quota weeks. */
    async findLoasOverlapping(guildId: string, from: Date, to: Date) {
        return this.db.loa.findMany({
            where: { guildId, startsAt: { lt: to }, endsAt: { gt: from } },
        });
    }

    async endLoa(id: string) {
        await this.db.loa.update({ where: { id }, data: { endedAt: new Date() } });
    }

    async getQuotaStrike(guildId: string, groupId: string, discordId: string) {
        return this.db.quotaStrike.findUnique({
            where: { guildId_groupId_discordId: { guildId, groupId, discordId } },
        });
    }

    async setQuotaStrikes(guildId: string, groupId: string, discordId: string, strikes: number, weekKey: string, fired = false) {
        await this.db.quotaStrike.upsert({
            where: { guildId_groupId_discordId: { guildId, groupId, discordId } },
            update: { strikes, lastCheckedAt: weekKey, fired },
            create: { guildId, groupId, discordId, strikes, lastCheckedAt: weekKey, fired },
        });
    }

    async getAllStrikes(guildId: string, groupId: string) {
        return this.db.quotaStrike.findMany({ where: { guildId, groupId } });
    }

    async closeEvent(id: string) {
        await this.db.event.update({ where: { id }, data: { closed: true } });
    }
}

export { PrismaProvider };
