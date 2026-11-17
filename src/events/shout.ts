import { TextChannel } from 'discord.js';
import { discordClient, robloxClient } from '../main';
import { config } from '../config';
import { getShoutLogEmbed } from '../handlers/locale';
let firstShout = true;
let lastShout: string;

const recordShout = async () => {
    // Schedule first, so one failed poll (network blip) doesn't stop shout logging for good.
    setTimeout(recordShout, 60 * 1000);
    try {
        const group = await robloxClient.getGroup(config.groupId);
        const logChannel = await discordClient.channels.fetch(config.logChannels.shout) as TextChannel;
        if(firstShout) {
            firstShout = false;
        } else {
            if(group.shout !== null && lastShout !== group.shout.content) {
                await logChannel.send({ embeds: [ await getShoutLogEmbed(group.shout) ] });
            }
        }
        if(group.shout?.content) lastShout = group.shout?.content;
    } catch (err) {
        console.error(err);
    }
}

export { recordShout };
