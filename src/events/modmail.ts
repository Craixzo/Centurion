import { Client, Message } from 'discord.js';
import { handleDm, handleThreadMessage } from '../handlers/site/modmail';

/**
 * Modmail (see handlers/site/modmail.ts): DMs to Centurion from people not in
 * recruitment, and staff replies in modmail threads.
 */
const registerModmail = (client: Client) => {
    client.on('messageCreate', async (message: Message) => {
        if(message.author.bot) return;
        try {
            if(!message.guild) await handleDm(message);
            else await handleThreadMessage(message);
        } catch (err) {
            console.error('[modmail]', err);
        }
    });
};

export default registerModmail;
