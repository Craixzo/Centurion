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
    patrols: [
        { name: 'Army Patrol', value: 'Army Patrol', description: 'Patrol the inside of the fort with Military Police.' },
        { name: 'Navy Patrol', value: 'Navy Patrol', description: 'Patrol the oceans around the globe.' },
        { name: 'Air Force Patrol', value: 'Air Force Patrol', description: 'Patrol the skies far above Yellonia.' },
        { name: 'Coast Guard Patrol', value: 'Coast Guard Patrol', description: 'Coming soon.' },
        { name: 'Military Police Patrol', value: 'Military Police Patrol', description: 'Patrol the inside and outside of the military facilities.' },
    ],
    tryouts: [
        { name: 'Army Tryout', value: 'Army Tryout', description: 'Try out for the Army. Use this for Infantry stuff as well.' },
        { name: 'Navy Tryout', value: 'Navy Tryout', description: 'Try out for the Navy.' },
        { name: 'Air Force Tryout', value: 'Air Force Tryout', description: 'Try out for the Air Force.' },
        { name: 'Military Police Tryout', value: 'Military Police Tryout', description: 'Try out for Military Police.' },
        { name: 'Marine Tryout', value: 'Marine Tryout', description: 'Try out for the Marines.' },
        { name: 'Fleet Tryout', value: 'Fleet Tryout', description: 'Try out for the Fleet.' },
        { name: 'Armored Tryout', value: 'Armored Tryout', description: 'Try out for 3rd Armored Division.' },
        { name: 'Helicopter Ops Tryout', value: 'Helicopter Ops Tryout', description: 'Try out for Helicopter Operations Division.' },
        { name: 'Air Combat Tryout', value: 'Air Combat Tryout', description: 'Try out for Air Combat Division.' },
        { name: 'Ceremonial Guard Tryout', value: 'Ceremonial Guard Tryout', description: 'Try out for Ceremonial Guard.' },
    ],
    trainings: [
        { name: 'Promotional Training', value: 'Promotional Training', description: 'For enlistees to rank up in the military.' },
        { name: 'Combat Training', value: 'Combat Training', description: 'Train for combat.' },
        { name: 'Joint Training', value: 'Branch Scrimmage', description: 'Joint training with an ally of Yellonia. Ask MOFA to find out who our allies are. Try your best to host them on Scarsen.' },
    ],
    scrimmages: [
        { name: 'Division Scrimmage', value: 'Division Scrimmage', description: 'Battle the division you hate the most.' },
        { name: 'Branch Scrimmage', value: 'Branch Scrimmage', description: 'Battle the branch you hate the most.' },
        { name: 'Joint Scrimmage', value: 'Joint Scrimmage', description: 'Friendly battles against allies. Ask MOFA to find out who our allies are.' },
    ],
    operations: [
        { name: 'Milsim Operation', value: 'Milsim Operation', description: 'All officers can host this.' },
        { name: 'Lore Operation', value: 'Lore Operation', description: 'Lore Operation.' },
        { name: 'Lore Battle', value: 'Lore Battle', description: 'Coming soon.' },
    ],
    inspections: [
        { name: 'Wing/Bat/Ship Inspection', value: 'Wing/Bat/Ship Inspection', description: 'Inspection for sub-divisions.' },
        { name: 'Division Inspection', value: 'Division Inspection', description: 'Inspection for divisions.' },
        { name: 'Branch Inspection', value: 'Branch Inspection', description: 'Inspection for branches.' },
        { name: 'Military-wide Inspection', value: 'Military-wide Inspection', description: 'Inspection for the military to ensure activity.' },
    ],
    milsim: [
        { name: 'FTX', value: 'FTX', description: 'Field Training Exercise.' },
        { name: 'Military Exercise', value: 'Military Exercise', description: 'Milsim exercise for units in Yellonia.' },
        { name: 'Full Mission Profile', value: 'Full Mission Profile', description: 'Simulated exercise for units in Yellonia.' },
        { name: 'Milsim Training', value: 'Milsim Training', description: 'Title must be used to specify what area of milsim training this is about.' },
        { name: 'Milsim Class', value: 'Milsim Class', description: 'Title must be used to specify what area of milsim class this is about.' },
     ],
    fun: [
        { name: 'Practice Raid', value: 'Practice Raid', description: 'Practice Raid.' },
        { name: 'Game Night/Day', value: 'Game Night/Day', description: 'Playing a fun game of sorts.' },
        { name: 'Game Raid', value: 'Game Raid', description: 'Raid a game with a bunch of people.' },
        { name: 'Sword Fight', value: 'Sword Fight', description: 'Challenge others to swordfighting for fun!' },
        { name: 'Team Deathmatch', value: 'Game Night/Day', description: 'Challenging some friends to a team deathmatch on one of our many battle games.' },
     ],
    other: [
        { name: 'Server Start-up', value: 'Server Start-up', description: 'SSU.' },
        { name: 'Recruitment Session', value: 'Recruitment Session', description: 'Recruitment Session.' },
        { name: 'Award Ceremony', value: 'Award Ceremony', description: 'Required for giving out awards that require such ceremonies in Yellonia.'},
        { name: 'Court Martial', value: 'Court Martial', description: 'This event is only used for when major CMs happen.' },
        { name: 'Other', value: 'Other', description: 'Use title to show the event.' },
    ],
    },

    eventChannels: [
        { name: 'Main Server: Events Schedule', id: '991806768604795000' },
        { name: 'Military Police: Events Schedule', id: '1474063802256326739'},
        { name: 'Army: Events Schedule', id: '911767148161040404' },
        { name: 'Navy: Events', id: '944806856323383396'},
        { name: 'Air Force: Events Schedule', id: '1180922507881103420' },
        { name: '2nd Fleet: Events', id: '935682168326357032'},
        { name: '6th Marines: Events Schedule', id: '1113278064101707877' },
        { name: '4th Air Combat Division: Events Schedule', id: '812802721471266818'},
        { name: '9th Helicopter Operations Division: Events Schedule', id: '1457512799516229852'},
        { name: '3rd Armored Division: Events', id: '940816706283135056' },
        { name: '1st Infantry Division: Events', id: '823291036012249128'},
    ],

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
        enabled: true,
        global: true,
        roleIds: [
            '1056133660954337280', 
            '967153140975689789', 
            '888511810590888036', 
            '887430006043705345', 
            '887430002512113704', 
            '887430010623893504',
            '1364676026617040906',
            '1180969168133173400',
            '1180969169131417711',
            '1180969170846883870',
            '809029216674512912',
            '809029216674512915',
            '809029216674512914',
            '887473196960469043',
            '809029216674512906',
            '809029216649740317',
            '863260368506585088',
            '863260459762319370',
            '927024733638230066',
            '927024732866494504',
            '1262874889967370241',
            '941839736845242400',
            '941839736845242399',
            '812802721207287871',
            '812802721207287870',
            '830620795608498176',
            '830621071132327956',
            '1457512798689951797',
            '1457512798689951796',
            '1457512798681698315',
            '1457512798681698314',
            '817864605845422090',
            '817864605833101371',
            '817864605833101368',
            '817864605833101367',
            '940328376978255983',
        ],
        perWeek: 1,
        weekStartsOn: 1,
        strikeLimit: 3,
        requireConfirmation: false,
        notifyExemptRoleIds: [],
        sendDMs: true,
    },

    logChannels: {
        actions: '866781121139441684',
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
        // Used when rotation is empty. The type already supplies "Watching",
        // so the value should not repeat it.
        type: ActivityType.Watching,
        value: 'over Yellonia',
        // Statuses to cycle through. Remove all entries to use the single status above.
        rotation: [
            // Custom shows the text exactly as written. Watching/Listening/Playing
            // add their own word in front, so don't repeat it in the value.
            { type: ActivityType.Custom, value: 'Watching over Yellonia' },
            { type: ActivityType.Custom, value: 'Listening for commands' },
            { type: ActivityType.Custom, value: 'Ensuring activity stays up and running' },
            { type: ActivityType.Custom, value: 'Playing Solesia' },
        ],
        // Seconds between changes. Minimum 5.
        rotationSeconds: 10,
    },
    // Posts new entries from src/updates.ts. Add channel IDs, then set enabled to true.
    updateAnnouncements: {
        enabled: false,
        // IDs must be in quotes. Unquoted, large numbers get rounded to the wrong ID.
        channelIds: [ '737823381994602664' ],
    },
    status: 'online',
    deleteWallURLs: false,

    // Fill in the IDs, then set enabled to true. Branch keys must never change.
    recruitment: {
        enabled: false,
        guildId: '737823381218525184',
        candidateRoleId: '',
        ticketCategoryId: '',
        dashboardChannelId: '',
        transcriptChannelId: '',
        leadershipRoleIds: [],
        reminderHours: 24,
        autoReleaseHours: 48,
        branchSelectTimeoutHours: 48,
        releaseOnLoa: true,
        removeCandidateRoleOnComplete: true,
        branches: [
            {
                key: 'army',
                name: 'Yellonian Army',
                officerRoleIds: [],
                notifyChannelId: '',
                roleId: '',
                divisions: [
                    { name: '1st Infantry Division', roleId: '' },
                    { name: '3rd Armored Division', roleId: '' },
                    { name: '6th Marines', roleId: '' },
                ],
            },
            {
                key: 'navy',
                name: 'Yellonian Navy',
                officerRoleIds: [],
                notifyChannelId: '',
                roleId: '',
                divisions: [
                    { name: '2nd Fleet', roleId: '' },
                ],
            },
            {
                key: 'airforce',
                name: 'Yellonian Air Force',
                officerRoleIds: [],
                notifyChannelId: '',
                roleId: '',
                divisions: [
                    { name: '4th Air Combat Division', roleId: '' },
                    { name: '9th Helicopter Operations Division', roleId: '' },
                ],
            },
            {
                key: 'mpc',
                name: 'Military Police Corps',
                officerRoleIds: [],
                notifyChannelId: '',
                roleId: '',
                divisions: [],
            },
            {
                key: 'specwar',
                name: 'Special Warfare',
                officerRoleIds: [],
                notifyChannelId: '',
                roleId: '',
                divisions: [],
            },
            {
                key: 'general',
                name: "I'm Not Sure",
                general: true,
                officerRoleIds: [],
                notifyChannelId: '',
            },
        ],
    },
}
