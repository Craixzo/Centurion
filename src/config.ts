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
        join: [''],
        signal: [''],
        admin: ['1440292084547321877'],
    },

    notificationTitle: 'NOTIFICATION FROM YELLONIA',
    notificationIconUrl: 'https://cdn.discordapp.com/attachments/741315255975804998/1547016815480275074/71wmb9j.png?ex=6aa1e32e&is=6aa091ae&hm=cb13cd547ddb088648c5b636e59c39d61500e43d632a049de0e2533441909c49&',
    
    boosterRoles: {
        "737823381218525184": "1252782745848123482", // guildId : boosterRoleId
        "223456789012345678": "887654321098765432",
    },
    
    inGameRanking: {
        enabled: true,
        rankCeiling: 30,      // <-- set to your E9 rank NUMBER (not the name)
        minOfficerRank: 20,   // <-- lowest rank allowed to rank in-game
    },

    serverTagRole: {
        enabled: true,
        guildId: '737823381218525184',
        roleId: '1547012962106081340',   // <-- make the role, give it image perms, paste its ID
    },
    
    accountLinks: {
        provider: 'rowifi',
        guildId: '',
        useDenylist: true,
    },

    quota: {
        enabled: false,
        roleIds: [],
        perWeek: 1,
        weekStartsOn: 1,
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
    secondaryGroups: [],
    memberCount: {
        enabled: false,
        channelId: '',
        milestone: 100,
        onlyMilestones: false,
    },
    xpSystem: {
        enabled: false,
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
        enabled: true,
        type: ActivityType.Watching,
        value: 'Watching over Yellonia.',
    },
    status: 'online',
    deleteWallURLs: false,
}
