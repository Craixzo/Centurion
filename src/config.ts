import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types'; 

export const config: BotConfig = {
    groupId: 0,
    slashCommands: true,
    legacyCommands: {
        enabled: true,
        prefixes: ['Y!'],
    },
    permissions: {
        all: ['1440292084547321877'],
        ranking: [''],
        users: [''],
        shout: [''],
        join: [''],
        signal: [''],
        admin: ['1440292084547321877'],
    },
    
    boosterRoles: {
        "737823381218525184": "1252782745848123482", // guildId : boosterRoleId
        "223456789012345678": "887654321098765432",
    },

    notificationTitle: 'NOTIFICATION FROM YELLONIA',
    notificationIconUrl: '',
    notificationFooter: 'THIS IS RARELY USED. DO NOT EXPECT ANY SPAM FROM THIS BOT.',

    serverTagRole: {
        enabled: true,
        guildId: '737823381218525184',
        roleId: '',   // <-- make the role, give it image perms, paste its ID
    },

    inGameRanking: {
        enabled: true,
        rankCeiling: 30,      // <-- set to your E9 rank NUMBER (not the name)
        minOfficerRank: 20,   // <-- lowest rank allowed to rank in-game
    },

    timezone: 'America/New_York',

    eventTypes: [
        { name: 'Training', value: 'Training' },
        { name: 'Raid', value: 'Raid' },
        { name: 'Patrol', value: 'Patrol' },
        { name: 'Tryout', value: 'Tryout' },
    ],

    eventChannels: [],

    eventReminders: {
        enabled: true,
        minutesBefore: 5,
    },

    accountLinks: {
        provider: 'rowifi',
        guildId: '',
        useDenylist: true,
    },

    loa: {
        minDays: 2,
        maxDays: 30,
    },

    moderation: {
        syncDefaults: {
            ban: true,    // a Discord ban also group-bans on Roblox by default
            kick: false,  // a Discord kick does NOT remove from the group by default
        },
    },

    quota: {
        enabled: false,
        roleIds: [],
        perWeek: 1,
        weekStartsOn: 1,
        strikeLimit: 3,
        requireConfirmation: false,
    },

    logChannels: {
        actions: '',
        shout: '',
    },
    api: false,
    maximumRank: 255,
    verificationChecks: {
        enabled: false,
        bypassRoleIds: [],
        bloxlinkGuildId: '',
    },
    firedRank: 1,
    suspendedRank: 1,
    recordManualActions: true,
    secondaryGroups: [
        { name: 'Military', id: 6157380 },
    ],

    // Group 6157380 is owned by a different account, so it uses its own key.
    groupApiKeys: {
        '6157380': 'ROBLOX_API_KEY_MILITARY',
    },
    memberCount: {
        enabled: false,
        channelId: '',
        milestone: 100,
        onlyMilestones: false,
    },
    xpSystem: {
        enabled: true,
        autoRankup: true,
        resetXpOnFire: false,
        messageXp: 1,
        messageCooldown: 60,
        messageXpIgnoredChannels: [],
        roles: [],
    },
    antiAbuse: {
        enabled: true,
        clearDuration: 1 * 60,
        threshold: 10,
        demotionRank: 1,
    },
    activity: {
        enabled: false,
        type: ActivityType.Watching,
        value: 'for commands.',
    },
    status: 'online',
    deleteWallURLs: false,
}
