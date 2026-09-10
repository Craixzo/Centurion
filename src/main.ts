import { QbotClient } from './structures/QbotClient';
import { RobloxClient } from './roblox/client';
import { handleInteraction } from './handlers/handleInteraction';
import { handleLegacyCommand } from './handlers/handleLegacyCommand';
import { config } from './config';
import { Group } from './roblox/client';
import { recordShout } from './events/shout';
import { checkSuspensions } from './events/suspensions';
import { recordAuditLogs } from './events/audit';
import { recordMemberCount } from './events/member';
import { clearActions } from './handlers/abuseDetection';
import { checkBans } from './events/bans';
import registerBoosterEvents from './events/boost';
import registerMessageXp from './events/messageXp';
import registerEventReminders from './events/eventReminders';
import registerServerTag from './events/serverTag';
import registerQuotaStrikes from './events/quotaStrikes';
import { registerEventReactions } from './handlers/events';
require('dotenv').config();

// [Ensure Setup]
if(!process.env.ROBLOX_API_KEY) {
    console.error('ROBLOX_API_KEY is not set in the .env file.');
    process.exit(1);
}

require('./database');
require('./api');

// [Clients]
const discordClient = new QbotClient();
discordClient.login(process.env.DISCORD_TOKEN);
const robloxClient = new RobloxClient();
let robloxGroup: Group = null;

(async () => {
    await robloxClient.login().catch(console.error);
    robloxGroup = await robloxClient.getGroup(config.groupId);

    // [Events]
    checkSuspensions();
    checkBans();
    if(config.logChannels.shout) recordShout();
    if(config.recordManualActions) recordAuditLogs();
    if(config.memberCount.enabled) recordMemberCount();
    if(config.antiAbuse.enabled) clearActions();
})();

// [Handlers]
if(config.boosterRoles && Object.keys(config.boosterRoles).length > 0) registerBoosterEvents(discordClient);
registerMessageXp(discordClient);
registerEventReminders(discordClient);
registerServerTag(discordClient);
registerQuotaStrikes(discordClient);
registerEventReactions(discordClient);

discordClient.on('interactionCreate', handleInteraction as any);
discordClient.on('messageCreate', handleLegacyCommand);

// Prime the member cache once so commands that need member lists (dmrole,
// quotas, eventroster) read from cache instead of re-fetching per call, which
// gets rate limited on large servers.
discordClient.on('ready', async () => {
    for(const guild of discordClient.guilds.cache.values()) {
        try {
            await guild.members.fetch();
        } catch (err) {
            console.error(`[startup] could not cache members for ${guild.id}`);
        }
    }
});

// [Module]
export { discordClient, robloxClient, robloxGroup };
