import { PrismaClient } from '@prisma/client';
import { DatabaseProvider } from '../structures/DatabaseProvider';
import { DatabaseUser } from '../structures/types';
require('dotenv').config();

/**
 * Records are keyed by (robloxId, groupId). The same Roblox user can hold
 * separate XP, suspension and ban state in every group the bot manages.
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

    async findUser(robloxId: string, groupId: number | string): Promise<DatabaseUser> {
        let userData = await this.db.user.findUnique({ where: this.key(robloxId, groupId) });
        if(!userData) userData = await this.db.user.create({ data: { robloxId, groupId: String(groupId) } });
        return userData;
    }

    async findSuspendedUsers(groupId?: number | string): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({
            where: {
                suspendedUntil: { not: null },
                ... (groupId !== undefined ? { groupId: String(groupId) } : {}),
            },
        });
    }

    async findBannedUsers(groupId?: number | string): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({
            where: {
                isBanned: true,
                ... (groupId !== undefined ? { groupId: String(groupId) } : {}),
            },
        });
    }

    async updateUser(robloxId: string, groupId: number | string, data: any) {
        await this.findUser(robloxId, groupId);
        await this.db.user.update({ where: this.key(robloxId, groupId), data });
    }
}

export { PrismaProvider };
