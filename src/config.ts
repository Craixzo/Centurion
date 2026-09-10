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

    eventTypes: [
        { name: 'Promotional Training', value: 'For enlistees to rank up in the military.' },
        { name: 'Army Patrol', value: 'Patrol the inside of the fort with Military Police.' },
        { name: 'Navy Patrol', value: 'Patrol the oceans around the globe.' },
        { name: 'Air Force Patrol', value: 'Patrol the skies far above Yellonia.' },
        { name: 'Coast Guard Patrol', value: 'Coming soon.' },
        { name: 'Military Police Patrol', value: 'Patrol the inside and outside of the military facilities of Yellonia.' },
        { name: 'Army Tryout', value: 'Army Tryout' },
        { name: 'Navy Tryout', value: 'Navy Tryout' },
        { name: 'Air Force Tryout', value: 'Air Force Tryout' },
        { name: 'Military Police Tryout', value: 'Military Police Tryout' },
        { name: 'Marine Tryout', value: 'Marine Tryout' },
        { name: 'Fleet Tryout', value: 'Fleet Tryout' },
        { name: 'Armored Tryout', value: 'Armored Tryout' },
        { name: 'Helicopter Operations Division Tryout', value: 'HeliOpsDiv Tryout' },
        { name: 'Air Combat Division Tryout', value: 'AirCombatDiv Tryout' },
        { name: 'Ceremonial Guard Tryout', value: 'CGY Tryout' },
        { name: 'Server Start-up', value: 'SSU' },
        { name: 'Division Scrimmage', value: 'Battle the division you hate the most.' },
        { name: 'Branch Scrimmage', value: 'Battle the branch you hate the most.' },
        { name: 'Recruitment Session', value: 'Recruitment Session' },
        { name: 'Practice Raid', value: 'Practice Raid' },
        { name: 'Game Night/Day', value: 'Playing a fun game of sorts.' },
        { name: 'Game Raid', value: 'Raiding a game with a bunch of people for fun.' },
        { name: 'Combat Training', value: 'Train for combat.' },
        { name: 'Battle', value: 'Battle against a different group. All officers can schedule battles against different groups, so long as it avoids dragging in other areas of Yellonia.' },
        { name: 'Milsim Operation', value: 'All officers can host this, in case it was not clear.' },
        { name: 'Lore Operation', value: 'Lore Operation' },
        { name: 'Lore Battle', value: 'Coming soon.' },
        { name: 'FTX', value: 'Field Training Exercise' },
        { name: 'Wing/Bat/Ship Inspections', value: 'Inspection for sub-divisions of Yellonia.' },
        { name: 'Division Inspection', value: 'Inspection for divisions of Yellonia.' },
        { name: 'Branch Inspection', value: 'Inspection for branches of Yellonia.' },
        { name: 'Award Ceremony', value: 'The most prestigious event in Yellonia.' },
        { name: 'Other', value: 'Include a post below stating what the event is.' },
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
        '6157380': 'D5jTJQN6J0+ZSA0mLxa8Tni6uR4U0FUJRwypFl+8HIoqfdw1ZXlKaGJHY2lPaUpTVXpJMU5pSXNJbXRwWkNJNkluTnBaeTB5TURJeExUQTNMVEV6VkRFNE9qVXhPalE1V2lJc0luUjVjQ0k2SWtwWFZDSjkuZXlKaGRXUWlPaUpTYjJKc2IzaEpiblJsY201aGJDSXNJbWx6Y3lJNklrTnNiM1ZrUVhWMGFHVnVkR2xqWVhScGIyNVRaWEoyYVdObElpd2lZbUZ6WlVGd2FVdGxlU0k2SWtRMWFsUktVVTQyU2pBcldsTkJNRzFNZUdFNFZHNXBOblZTTkZVd1JsVktVbmQ1Y0Vac0t6aElTVzl4Wm1SM01TSXNJbTkzYm1WeVNXUWlPaUl6TXpnek5qYzJOamt6SWl3aVpYaHdJam94TnpnNU1ERTJNRFU0TENKcFlYUWlPakUzT0Rrd01USTBOVGdzSW01aVppSTZNVGM0T1RBeE1qUTFPSDAuS3d3ck02NTVJY1pvc09NdnVvQjduRzc5YllVQjhRcnVuZnRqT2RhOTZMNkJfNlJMUVRFNmQzYkJsekppR0poc2QzRWQ1Zko4YVFVSzFfOVI3OVk4V0tqdHRpV290S0RKbWpha2VJTS1DOURCZGFqUjRVTDdITElpT20xN19TcXVtU0cyRlpiUmRsRVpSNlRiS252MkZoMU1oRlF5NDBuQVVkeXJmRUJ6ekNxUGNWdThpY1hHYl9EOFFIMl91SjJpUXB0cmpLdWlEc0ZfckFPdW5MTTI0YUZQSDRWWlZILXhwWXVaaGx4RGJOdy1xb1I3YjVXam50d0hVQkx1TkZFSDBVaV9fWVBCUVFSMGd3OGRTUDNzY3k4VGpuNDRKODY2X3RUc0RET21RZDBIS3ZydlVTd2ZVMlpaTzYxOXFRUWZLY01ReVM5Tnpack8zbHlTdTF4cWp3',
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
        value: 'over Yellonia',
    },
    status: 'online',
    deleteWallURLs: false,
}
