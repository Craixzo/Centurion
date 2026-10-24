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
};

/** Every role, from least to most access. A member can hold several. */
export const DES_ROLES: Record<string, string> = {
    'officer': 'Officer / Firefighter',
    'dispatcher': 'Dispatcher',
    'supervisor': 'Supervisor',
    'oia': 'Office of Internal Affairs',
    'ofi': 'Office of Fire Investigations',
    'local-admin': 'Local Admin',
    'service-admin': 'Service Admin',
};
