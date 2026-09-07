abstract class DatabaseProvider {
    abstract findUser(robloxId: string, groupId: number | string): Promise<any>;
    abstract findSuspendedUsers(groupId?: number | string): Promise<any[]>;
    abstract findBannedUsers(groupId?: number | string): Promise<any[]>;
    abstract updateUser(robloxId: string, groupId: number | string, data: any): Promise<void>;
}

export { DatabaseProvider };
