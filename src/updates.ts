/**
 * Centurion's changelog. Add a new entry at the TOP when you ship something;
 * on its next start the bot posts that entry once to
 * config.updateAnnouncements.channelIds.
 *
 * - version must be unique, and changing it is what triggers a new post.
 * - Nothing here links to the code, so the announcement never reveals where
 *   the bot comes from.
 */
export interface BotUpdate {
    version: string;
    /** Short headline for the announcement. */
    title: string;
    /** One line per change, written for members rather than developers. */
    changes: string[];
}

export const updates: BotUpdate[] = [
    {
        version: '4.1.0',
        title: 'Event posting and status updates',
        changes: [
            '- Events posted by hand in the classic Host / Event / Time format now count toward your quota, just like /event.',
            '- Centurion now reacts to hand-posted events so you know they were counted, and RSVPs work the same way.',
            '- Centurion\'s status now rotates between several messages.',
            '- Strike system has been fixed.',
            '- Added in beta testing for recruitment system',
        ],
    },
];
