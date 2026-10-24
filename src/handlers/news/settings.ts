/**
 * Settings for the news outlet system.
 * IDs must be in quotes. Unquoted, large numbers get rounded to the wrong ID.
 */
export const NEWS_SETTINGS = {
    /** Main Yellonia server. Applicants and writers must be members of it. */
    guildId: '737823381218525184',

    /** Ministry of Commerce channel where outlet and writer requests are posted. */
    reviewChannelId: '1563331312331399208',

    /** Roles allowed to approve or deny requests (in the server that has the channel above). */
    reviewerRoleIds: [ '1563336295416205413' ],

    /** Channels where newly published articles are posted. Add more IDs to post in several places.
     *  Centurion must be in each channel's server, with View Channel, Send Messages and Embed Links. */
    announceChannelIds: [ '1229676289590562817' ],

    /** The public website, used for links in messages. No slash at the end. */
    siteUrl: 'https://yellonianet.vercel.app',

    /** How many outlets one person may own (pending or approved). */
    maxOutletsPerOwner: 1,

    /** How many writers an outlet may have, not counting the owner. */
    maxWritersPerOutlet: 15,
};
