import { GuildMember, User } from 'discord.js';
import { getNotificationEmbed } from './locale';

export const DM_DELAY_MS = 1500;   // Discord flags bots that bulk-DM faster
export const MAX_RECIPIENTS = 500; // stops a mistake blasting the whole server

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Slash command text fields don't accept Enter, so line breaks and indents
 * have to be typed as escape sequences and converted here.
 *
 *   \n  new line
 *   \t  indent (three em spaces - Discord collapses ordinary leading spaces)
 *
 * Also accepts a literal "|" as a line break, which is quicker to type.
 */
export const formatUserMessage = (raw: string): string => {
    return (raw || '')
        .replace(/\\n/g, '\n')
        .replace(/\s*\|\s*/g, '\n')
        .replace(/\\t/g, '\u2003\u2003\u2003');
}

export interface MassDmResult {
    sent: number;
    failed: string[];
    capped: boolean;
    total: number;
}

/**
 * Sends a DM to each recipient with a delay between them.
 *
 * Shared by /dmrole and /eventdm so the rate limiting and failure handling
 * only exist in one place.
 */
export const sendMassDm = async (
    recipients: (GuildMember | User)[],
    message: string,
    heading?: string,
): Promise<MassDmResult> => {
    const embed = getNotificationEmbed(message, heading);
    const capped = recipients.length > MAX_RECIPIENTS;
    const targets = capped ? recipients.slice(0, MAX_RECIPIENTS) : recipients;

    let sent = 0;
    const failed: string[] = [];

    for(const recipient of targets) {
        try {
            await recipient.send({ embeds: [ embed ] });
            sent += 1;
        } catch (err: any) {
            // Closed DMs, blocked the bot, or no mutual server.
            const user = 'user' in recipient ? recipient.user : recipient;
            console.error(`[massDm] failed for ${user.tag || user.username}:`, err?.code, err?.message);
            failed.push(user.tag || user.username);
        }
        await sleep(DM_DELAY_MS);
    }

    return { sent, failed, capped, total: recipients.length };
}
