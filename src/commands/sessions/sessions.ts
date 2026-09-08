import { Client, EmbedBuilder, Message, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { provider } from '../database';
import { mainColor, greenColor, quoteIconUrl } from './locale';

export const ATTEND_EMOJI = '\u2705';  // :white_check_mark:
export const DECLINE_EMOJI = '\u274C'; // :x:

/** Renders a mention list that fits Discord's 1024-char field limit. */
const formatRoster = (ids: string[], emptyText: string): string => {
    if(ids.length === 0) return emptyText;

    const mentions: string[] = [];
    let length = 0;
    for(const id of ids) {
        const mention = `<@${id}>`;
        if(length + mention.length + 2 > 950) {
            mentions.push(`and **${ids.length - mentions.length}** more`);
            break;
        }
        mentions.push(mention);
        length += mention.length + 2;
    }
    return mentions.join(', ');
}

export const buildSessionEmbed = async (session: any, attendingIds: string[], declinedIds: string[] = []) => {
    const fields: any[] = [];
    if(session.startsAt) fields.push({ name: 'Starts', value: session.startsAt, inline: false });

    fields.push({
        name: `${ATTEND_EMOJI} Attending \u2014 ${attendingIds.length}`,
        value: formatRoster(attendingIds, '*Nobody yet.*'),
        inline: false,
    });

    if(declinedIds.length > 0) {
        fields.push({
            name: `${DECLINE_EMOJI} Can't make it \u2014 ${declinedIds.length}`,
            value: formatRoster(declinedIds, '*Nobody.*'),
            inline: false,
        });
    }

    return new EmbedBuilder()
        .setAuthor({ name: session.closed ? 'Session (closed)' : 'Session Announcement', iconURL: quoteIconUrl })
        .setTitle(session.title)
        .setDescription(session.details || null)
        .setColor(session.closed ? greenColor : mainColor)
        .addFields(fields)
        .setFooter({ text: session.closed
            ? 'RSVPs are closed.'
            : `React ${ATTEND_EMOJI} to attend or ${DECLINE_EMOJI} if you can't make it.` });
}

/** Adds the two RSVP reactions to a freshly posted announcement. */
export const seedSessionReactions = async (message: Message) => {
    await message.react(ATTEND_EMOJI);
    await message.react(DECLINE_EMOJI);
}

const refreshAnnouncement = async (message: Message, session: any) => {
    const all = await provider.getRsvps(session.id);
    const attending = all.filter((r: any) => r.attending).map((r: any) => r.discordId);
    const declined = all.filter((r: any) => !r.attending).map((r: any) => r.discordId);

    try {
        await message.edit({ embeds: [ await buildSessionEmbed(session, attending, declined) ] });
    } catch (err) { /* deleted or not editable */ }
}

/**
 * Reaction RSVPs.
 *
 * Officers can see who responded straight from the reaction list, and the
 * embed roster stays in sync for exact counts. Reacting to one option clears
 * the other so nobody sits in both lists.
 */
const handleReaction = async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    added: boolean,
) => {
    if(user.bot) return;

    const emoji = reaction.emoji.name;
    if(emoji !== ATTEND_EMOJI && emoji !== DECLINE_EMOJI) return;

    // Partials arrive empty; fetch before reading anything off them.
    if(reaction.partial) await reaction.fetch();
    if(reaction.message.partial) await reaction.message.fetch();

    const message = reaction.message as Message;
    const session = await provider.findSessionByMessage(message.id);
    if(!session) return;

    const attending = emoji === ATTEND_EMOJI;

    if(session.closed) {
        if(added) await reaction.users.remove(user.id).catch(() => {});
        return;
    }

    if(added) {
        await provider.setRsvp(session.id, user.id, attending);

        // Clear the opposite reaction so the two lists stay exclusive.
        const opposite = attending ? DECLINE_EMOJI : ATTEND_EMOJI;
        const oppositeReaction = message.reactions.cache.get(opposite);
        if(oppositeReaction) await oppositeReaction.users.remove(user.id).catch(() => {});
    } else {
        // Only clear the RSVP if they removed the reaction that set it.
        const current = await provider.getRsvps(session.id);
        const theirs = current.find((r: any) => r.discordId === user.id);
        if(theirs && theirs.attending === attending) {
            await provider.removeRsvp(session.id, user.id);
        }
    }

    await refreshAnnouncement(message, session);
}

export const registerSessionReactions = (client: Client) => {
    client.on('messageReactionAdd', async (reaction, user) => {
        try {
            await handleReaction(reaction, user, true);
        } catch (err) {
            console.error('[session reaction add]', err);
        }
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        try {
            await handleReaction(reaction, user, false);
        } catch (err) {
            console.error('[session reaction remove]', err);
        }
    });
}
