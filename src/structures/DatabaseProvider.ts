import { DatabaseUser, GroupUserRecord } from './types';

abstract class DatabaseProvider {
    // Users
    abstract findUser(robloxId: string, groupId: number | string): Promise<DatabaseUser>;
    abstract findSuspendedUsers(groupId?: number | string): Promise<GroupUserRecord[]>;
    abstract findBannedUsers(groupId?: number | string): Promise<GroupUserRecord[]>;
    abstract updateUser(robloxId: string, groupId: number | string, data: any): Promise<void>;

    // XP (global)
    abstract addXp(robloxId: string, amount: number): Promise<number>;
    abstract getTopXp(limit: number): Promise<{ robloxId: string; xp: number }[]>;
    abstract getXpRank(robloxId: string): Promise<number>;

    // Events
    abstract createEvent(data: any): Promise<any>;
    abstract findEventById(id: string): Promise<any>;
    abstract findEventByMessage(messageId: string): Promise<any>;
    abstract findRecentEvents(guildId: string, limit: number): Promise<any[]>;
    abstract closeEvent(id: string): Promise<void>;
    abstract countEventsByHost(guildId: string, hostId: string, since: Date, until?: Date): Promise<number>;
    abstract countEventsByAllHosts(guildId: string, since: Date): Promise<Record<string, number>>;
    abstract findEventsNeedingReminders(before: Date): Promise<any[]>;
    abstract markEventReminded(id: string, field: 'remind5Sent' | 'remindStartSent'): Promise<void>;

    // RSVPs
    abstract setRsvp(eventId: string, discordId: string, attending: boolean): Promise<void>;
    abstract removeRsvp(eventId: string, discordId: string): Promise<void>;
    abstract getRsvps(eventId: string, attending?: boolean): Promise<any[]>;

    // LOA
    abstract createLoa(data: any): Promise<any>;
    abstract findActiveLoa(guildId: string, discordId: string): Promise<any>;
    abstract findActiveLoas(guildId: string): Promise<any[]>;
    abstract findLoasOverlapping(guildId: string, from: Date, to: Date): Promise<any[]>;
    abstract endLoa(id: string): Promise<void>;

    // Quota strikes
    abstract getQuotaStrike(guildId: string, groupId: string, discordId: string): Promise<any>;
    abstract setQuotaStrikes(guildId: string, groupId: string, discordId: string, strikes: number, weekKey: string, fired?: boolean): Promise<void>;
    abstract getAllStrikes(guildId: string, groupId: string): Promise<any[]>;

    // Health
    abstract healthCheck(): Promise<boolean>;
}

export { DatabaseProvider };
