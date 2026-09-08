import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types'; 

export const config: BotConfig = {
    groupId: 5801322,
    guildGroups: {
    "YOUR_MAIN_DISCORD_GUILD_ID": 5801322,
    },
    slashCommands: true,
    legacyCommands: {
        enabled: true,
        prefixes: ['Y!'],
    },
    permissions: {
        all: [''],
        ranking: [''],
        users: [''],
        shout: [''],
        join: [''],
        signal: [''],
        admin: [''],
    },
    
    secondaryGroups: [
        { name: 'Academy', id: 12345678 },
    ],

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
    secondaryGroups: [],
    memberCount: {
        enabled: false,
        channelId: '',
        milestone: 100,
        onlyMilestones: false,
    },
    xpSystem: {
        enabled: true,          // must be true or none of this runs
        messageXp: 1,
        messageCooldown: 60,    // seconds
        messageXpIgnoredChannels: [],
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
        value: 'for commands.',
    },
    status: 'online',
}
