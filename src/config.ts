import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types'; 

export const config: BotConfig = {
    groupId: 5801322,
    slashCommands: true,
    legacyCommands: {
        enabled: true,
        prefixes: ['Y!'],
    },
    permissions: {
        all: ['1440292084547321877'],
        ranking: ['1056133660954337280'],
        users: ['1056133660954337280'],
        shout: [''],
        join: ['1056133660954337280'],
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
        rankCeiling: 9,      // <-- set to your E9 rank NUMBER (not the name)
        minOfficerRank: 1,   // <-- lowest rank allowed to rank in-game
    },

    timezone: 'America/New_York',

    eventTypes: {
    patrol: [
        { name: 'Army Patrol', value: 'Army Patrol', description: 'Patrol the inside of the fort with Military Police.' },
        { name: 'Navy Patrol', value: 'Navy Patrol', description: 'Patrol the oceans around the globe.' },
        { name: 'Air Force Patrol', value: 'Air Force Patrol', description: 'Patrol the skies far above Yellonia.' },
        { name: 'Coast Guard Patrol', value: 'Coast Guard Patrol', description: 'Coming soon.' },
        { name: 'Military Police Patrol', value: 'Military Police Patrol', description: 'Patrol the inside and outside of the military facilities.' },
    ],
    tryout: [
        { name: 'Army Tryout', value: 'Army Tryout', description: 'Try out for the Army.' },
        { name: 'Navy Tryout', value: 'Navy Tryout', description: 'Try out for the Navy.' },
        { name: 'Air Force Tryout', value: 'Air Force Tryout', description: 'Try out for the Air Force.' },
        { name: 'Military Police Tryout', value: 'Military Police Tryout', description: 'Try out for Military Police.' },
        { name: 'Marine Tryout', value: 'Marine Tryout', description: 'Try out for the Marines.' },
        { name: 'Fleet Tryout', value: 'Fleet Tryout', description: 'Try out for the Fleet.' },
        { name: 'Armored Tryout', value: 'Armored Tryout', description: 'Try out for Armored.' },
        { name: 'Helicopter Ops Tryout', value: 'Helicopter Ops Tryout', description: 'Try out for Helicopter Operations Division.' },
        { name: 'Air Combat Tryout', value: 'Air Combat Tryout', description: 'Try out for Air Combat Division.' },
        { name: 'Ceremonial Guard Tryout', value: 'Ceremonial Guard Tryout', description: 'Try out for Ceremonial Guard.' },
    ],
    training: [
        { name: 'Promotional Training', value: 'Promotional Training', description: 'For enlistees to rank up in the military.' },
        { name: 'Combat Training', value: 'Combat Training', description: 'Train for combat.' },
        { name: 'FTX', value: 'FTX', description: 'Field Training Exercise.' },
    ],
    scrimmage: [
        { name: 'Division Scrimmage', value: 'Division Scrimmage', description: 'Battle the division you hate the most.' },
        { name: 'Branch Scrimmage', value: 'Branch Scrimmage', description: 'Battle the branch you hate the most.' },
    ],
    operation: [
        { name: 'Milsim Operation', value: 'Milsim Operation', description: 'All officers can host this.' },
        { name: 'Lore Operation', value: 'Lore Operation', description: 'Lore Operation.' },
        { name: 'Lore Battle', value: 'Lore Battle', description: 'Coming soon.' },
    ],
    inspection: [
        { name: 'Wing/Bat/Ship Inspection', value: 'Wing/Bat/Ship Inspection', description: 'Inspection for sub-divisions.' },
        { name: 'Division Inspection', value: 'Division Inspection', description: 'Inspection for divisions.' },
        { name: 'Branch Inspection', value: 'Branch Inspection', description: 'Inspection for branches.' },
    ],
    other: [
        { name: 'Server Start-up', value: 'Server Start-up', description: 'SSU.' },
        { name: 'Recruitment Session', value: 'Recruitment Session', description: 'Recruitment Session.' },
        { name: 'Practice Raid', value: 'Practice Raid', description: 'Practice Raid.' },
        { name: 'Game Night/Day', value: 'Game Night/Day', description: 'Playing a fun game of sorts.' },
        { name: 'Game Raid', value: 'Game Raid', description: 'Raiding a game with a bunch of people.' },
        { name: 'Battle', value: 'Battle', description: 'Battle against a different group.' },
        { name: 'Award Ceremony', value: 'Award Ceremony', description: 'The most prestigious event in Yellonia.' },
        { name: 'Other', value: 'Other', description: 'Include a post below stating what the event is.' },
    ],
    },

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
    api: true,
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
        groupId: 6157380,
        resetXpOnFire: false,
        messageXp: 1,
        messageCooldown: 60,
        messageXpIgnoredChannels: [],
        roles: [
            { rank: 2, xp: 1000 },
            { rank: 3, xp: 2000 },
            { rank: 4, xp: 4000 },
            { rank: 5, xp: 5000 },
            { rank: 6, xp: 6000 },
            { rank: 7, xp: 8000 },
            { rank: 8, xp: 10000 },
            { rank: 9, xp: 12000 },
        ],
    },
    antiAbuse: {
        enabled: true,
        clearDuration: 1 * 60,
        threshold: 10,
        demotionRank: 1,
    },
    activity: {
        enabled: true,
        type: ActivityType.Watching,
        value: 'Watching over Yellonia',
    },
    status: 'online',
    deleteWallURLs: false,
}
