export const buildEventEmbed = async (event: any, attendingIds: string[], declinedIds: string[] = []) => {
    const fields: any[] = [];

    // Host field (add this)
    if(event.hostId) {
        fields.push({
            name: 'Host',
            value: `<@${event.hostId}>`,
            inline: false,
        });
    }

    if(event.startsAt) {
        fields.push({
            name: 'Starts',
            value: `${discordTime(event.startsAt)} (${discordTime(event.startsAt, 'R')})`,
            inline: false,
        });
    }
    if(event.gameLink) fields.push({ name: 'Game', value: event.gameLink, inline: false });

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
        .setAuthor({ name: event.closed ? 'Event (closed)' : 'Event Announcement', iconURL: quoteIconUrl })
        .setTitle(event.type ? `[${event.type}] ${event.title}` : event.title)
        .setDescription(event.details || null)
        .setColor(event.closed ? greenColor : mainColor)
        .addFields(fields)
        .setFooter({ text: event.closed
            ? 'RSVPs are closed.'
            : `React ${ATTEND_EMOJI} to attend or ${DECLINE_EMOJI} if you can't make it.` });
}
