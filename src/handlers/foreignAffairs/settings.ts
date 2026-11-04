/**
 * Settings for the Foreign Affairs ticket panel.
 * IDs must be in quotes. Unquoted, large numbers get rounded to the wrong ID.
 *
 * Emojis are application emojis: upload them in the Developer Portal under
 * Centurion -> Emojis, using the names below. Missing emojis are skipped
 * (the option still shows, just without an emoji).
 */

export type ForeignAffairsKind = 'embassy' | 'event';

export interface ForeignAffairsOption {
    /** Never change once live: open tickets are matched by it. Max 20 chars, no colons. */
    key: string;
    label: string;
    /** Max 100 characters. */
    description: string;
    /** Name of the application emoji in the Developer Portal. */
    emoji: string;
    kind: ForeignAffairsKind;
    /** Shown in the menu, but picking it only says it isn't open yet. */
    comingSoon?: boolean;
    /** Extra roles that can see tickets of this option, on top of the category's own permissions. */
    extraRoleIds?: string[];
    /** Roles pinged when a ticket of this option opens. */
    pingRoleIds?: string[];
}

export const FOREIGN_AFFAIRS_SETTINGS = {
    enabled: true,

    /** Foreign affairs server. */
    guildId: '1369505921734152193',

    /** Channel the panel is posted in. Centurion posts it on startup, or edits its existing one. */
    panelChannelId: '1482221606028968107',

    /** Categories tickets are created in. Ticket channels copy the category's permissions,
     *  so whoever can see the category (your staff roles) can see its tickets. */
    categoryIds: {
        embassy: '1369509461441515625',
        event: '1567642016249028638',
    } as Record<ForeignAffairsKind, string>,

    /** Closed tickets are posted here as a .txt transcript, then the channel is deleted.
     *  Leave empty to keep closed channels (locked, renamed closed-...) instead of deleting them. */
    transcriptChannelId: '',

    /** How many tickets one person may have open at once, across all options. */
    maxOpenPerUser: 3,

    panelTitle: 'FOREIGN AFFAIRS PANEL',
    panelDescription: [
        'Welcome to the Yellonian Ministry of Foreign Affairs.',
        '',
        '**Embassy Requests** establish friendly relations between your nation or clan and Yellonia.',
        '',
        '**Event Requests** schedule an event with one of our divisions, or with all of Yellonia. This can be:',
        '• A **joint training** alongside a division',
        '• A **battle** against a division',
        '• A **combined operation**, raid, or any other event you have in mind',
        '',
        'Select an option below. You\'ll be asked for your group\'s name, then a private channel opens with our staff.',
    ].join('\n'),
    panelColor: 0x5bbf49,
    placeholder: 'Select one to open an embassy or event request.',

    options: [
        {
            key: 'embassy',
            label: 'Nation Embassy Request',
            description: 'Establish friendly relations with Yellonia as a nation or clan.',
            emoji: 'fa_embassy',
            kind: 'embassy',
        },
        {
            key: '1id',
            label: '1st Infantry Event Request',
            description: 'Schedule a casual milsim event with the 1st Infantry Division.',
            emoji: 'fa_1id',
            kind: 'event',
        },
        {
            key: '3ad',
            label: '3rd Armored Event Request',
            description: 'Schedule an event with the premier fighting force of Yellonia for MTC events.',
            emoji: 'fa_3ad',
            kind: 'event',
        },
        {
            key: '2fleet',
            label: '2nd Fleet Event Request',
            description: 'The naval fleet of Yellonia. Schedule with us for bild iland or DEAD AHEAD.',
            emoji: 'fa_2fleet',
            kind: 'event',
        },
        {
            key: '6mar',
            label: '6th Marines Event Request',
            description: 'Schedule with Yellonia\'s casual expeditionary force. We handle a large variety of events.',
            emoji: 'fa_6mar',
            kind: 'event',
        },
        {
            key: '1mew',
            label: '6th Marines, 1st Marine Expeditionary Wing',
            description: 'Schedule with Yellonia\'s fighting force on Blackhawk Rescue Mission 5. [COMING SOON]',
            emoji: 'fa_1mew',
            kind: 'event',
            comingSoon: true,
        },
        {
            key: '4acd',
            label: '4th Air Combat Event Request',
            description: 'Schedule with Yellonia\'s winged fighters for an event.',
            emoji: 'fa_4acd',
            kind: 'event',
        },
        {
            key: 'scs',
            label: 'Special Clandestine Service Event Request',
            description: 'Yellonia\'s casual Third-Person Shooter force. Schedule with us for 3rd person shooter events.',
            emoji: 'fa_scs',
            kind: 'event',
        },
        {
            key: 'igr',
            label: 'IG-Regiment "Grandslayers" Event Request',
            description: 'Yellonia\'s premier Sword fighting force. Schedule with us for sword events.',
            emoji: 'fa_igr',
            kind: 'event',
        },
        {
            key: '5sfg',
            label: '5th Special Forces Group Event Request',
            description: 'Yellonia\'s premier Competitive FPS division. Schedule with us for elite FPS events.',
            emoji: 'fa_5sfg',
            kind: 'event',
        },
        {
            key: 'yellonia',
            label: 'Yellonia Event Request',
            description: 'Schedule an event with the entirety of Yellonia. Must be ready to play the game we end up picking.',
            emoji: 'fa_yellonia',
            kind: 'event',
        },
    ] as ForeignAffairsOption[],
};
