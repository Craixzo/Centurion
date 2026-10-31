/**
 * Settings for the website's staff area, modmail, job board and official documents.
 * IDs must be in quotes. Unquoted, large numbers get rounded to the wrong ID.
 *
 * Roles are roles in the main Yellonia server (NEWS_SETTINGS.guildId).
 */
export const SITE_SETTINGS = {
    /** Staff: can log in to the staff area (staff.html), answer modmail, and remove job listings. */
    staffRoleIds: [ '1453198303545135286' ],

    /** Site admins: everything staff can do, plus writing and publishing official documents. Centurion admins count too. */
    adminRoleIds: [ '847534222138540072' ],

    /** Job board: who can post listings (officers). Staff and admins can always post. */
    jobOfficerRoleIds: [ '1056133660954337280', '1330230174641422376', '1313684886074167386' ],

    /**
     * Modmail: the text channel where each conversation becomes a thread.
     * Centurion needs View Channel, Send Messages, Create Public Threads,
     * Send Messages in Threads and Manage Threads there. Leave '' to turn
     * Discord-side modmail off (the website still works).
     */
    modmailChannelId: '',

    /** Modmail: a role pinged when a new conversation starts. '' for none. */
    modmailPingRoleId: '1453198303545135286',

    /** Modmail: staff messages in a thread that start with this stay internal (not sent to the person). */
    modmailNotePrefix: '//',

    /** Modmail: most open conversations one person can have at once. */
    maxOpenModmail: 2,

    /** Job board: most open listings one officer can have at once. */
    maxOpenListings: 5,

    /** Job board: listings close by themselves after this many days. */
    listingDays: 30,

    /** Official documents: the categories offered in the editor. */
    documentCategories: [ 'Constitution', 'Law', 'Decree', 'Treaty', 'Policy', 'Proclamation', 'Other' ],

    /** Job board: the categories offered when posting. */
    jobCategories: [ 'Armed Forces', 'Emergency Services', 'Government', 'Corporations', 'Media', 'Other' ],
};
