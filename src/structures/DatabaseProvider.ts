abstract class DatabaseProvider {
    abstract findUser(query: any): Promise<any>;
    abstract findSuspendedUsers(): Promise<any[]>;
    abstract findBannedUsers(): Promise<any[]>;
    abstract updateUser(query: any, data: any): Promise<void>;
}

export { DatabaseProvider };
