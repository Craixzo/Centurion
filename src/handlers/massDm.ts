import { GuildMember, User } from 'discord.js';

export const DM_DELAY_MS = 1500;   // Discord flags bots that bulk-DM faster
export const MAX_RECIPIENTS = 500; // stops a mistake blasting the whole server

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface MassDmResult {
    sent: number;
    failed: string[];
    capped: boolean;
    total: number;
}

/**
 * Sends a DM to each recipient with a delay between them.
 *
 * Shared by /dmrole and /sessiondm so the rate limiting and failure handling
 * only exist in one place.
 */
export const sendMassDm = async (
    recipients: (GuildMember | User)[],
    message: string,
): Promise<MassDmResult> => {
    const capped = recipients.length > MAX_RECIPIENTS;
    const targets = capped ? recipients.slice(0, MAX_RECIPIENTS) : recipients;

    let sent = 0;
    const failed: string[] = [];

    for(const recipient of targets) {
        try {
            await recipient.send(message);
            sent += 1;
        } catch (err) {
            // Closed DMs, blocked the bot, or no mutual server.
            const user = 'user' in recipient ? recipient.user : recipient;
            failed.push(user.tag || user.username);
        }
        await sleep(DM_DELAY_MS);
    }

    return { sent, failed, capped, total: recipients.length };
}
