/**
 * Settings for the Department of Emergency Services (DES) back-end.
 * IDs must be in quotes. Unquoted, large numbers get rounded to the wrong ID.
 */
export const DES_SETTINGS = {
    /** Roles (besides Centurion admins) allowed to use /des-add and /des-remove. */
    adminRoleIds: [ '' ],

    /** The departments in DES. The key is what's stored; name and short are shown. */
    departments: {
        POLICE: { name: 'Yellonia Police Department', short: 'YPD' },
        FIRE: { name: 'Yellonia Fire Department', short: 'YFD' },
    } as Record<string, { name: string; short: string }>,

    /** Wrong passwords in a row before an account is locked, and for how long. */
    maxFailedLogins: 5,
    lockMinutes: 15,

    /** Shortest password allowed. */
    minPasswordLength: 10,

    /** CAD: call types offered when creating an incident, per department. */
    callTypes: {
        POLICE: [ 'Traffic stop', 'Pursuit', 'Shots fired', 'Robbery', 'Assault', 'Theft', 'Burglary', 'Disturbance', 'Suspicious person', 'Welfare check', 'Officer needs assistance', 'Other' ],
        FIRE: [ 'Structure fire', 'Vehicle fire', 'Brush fire', 'Medical emergency', 'Traffic collision', 'Rescue', 'Fire alarm', 'Hazmat', 'Other' ],
    } as Record<string, string[]>,

    /** CAD: units with no status change for this many hours are taken off duty automatically. */
    autoOffDutyHours: 6,

    /**
     * OIA and OFI: Discord channels told when a new complaint or fire report comes in.
     * Only the case number and type are posted (never the details). Leave '' for none.
     */
    oiaChannelId: '',
    ofiChannelId: '',

    /** Public forms: most submissions one Discord account can make per day, and have open at once. */
    maxReportsPerDay: 3,
    maxOpenReports: 5,

    /** DES News: the Yellonia News outlet DES posts to (its address name). The Emergency Services page reads this outlet. */
    newsOutletSlug: 'department-of-emergency-services',
    newsOutletName: 'Department of Emergency Services',

    /** Recruitment: which departments are taking applications right now. */
    applicationsOpen: { POLICE: true, FIRE: true } as Record<string, boolean>,

    /** Recruitment: the questions on the application form. "all" is asked for every department. Keep each under 200 characters. */
    applicationQuestions: {
        all: [
            'How old are you?',
            'What time zone are you in, and when are you usually active?',
            'Why do you want to join?',
            'Have you been in a roleplay police or fire department before? Tell us about it.',
        ],
        POLICE: [
            'A driver refuses to stop for you. What do you do?',
        ],
        FIRE: [
            'You arrive first at a house fire with people inside. What do you do?',
        ],
    } as Record<string, string[]>,

    /** Recruitment: days before someone whose application was declined can apply again. */
    reapplyDays: 14,

    /** Recruitment: Discord channel told when a new application comes in (number and department only). '' for none. */
    recruitmentChannelId: '',
};

/** Every role, from least to most access. A member can hold several. */
export const DES_ROLES: Record<string, string> = {
    'officer': 'Officer / Firefighter',
    'dispatcher': 'Dispatcher',
    'supervisor': 'Supervisor',
    'oia': 'Office of Internal Affairs',
    'ofi': 'Office of Fire Investigations',
    'pio': 'Public Information Officer',
    'local-admin': 'Local Admin',
    'service-admin': 'Service Admin',
};
