/**
 * Settings for the economy: corporations and the stock market.
 *
 * The company types, listing rules and trading limits are copied from the
 * game's CompanyTypes module so the website, Discord and the game all follow
 * the same rules. If you change one there, change it here too.
 */

export type CompanyType = {
    Id: string;
    Name: string;
    Description: string;
    CreationCost: number;
    SharesIssued: number;
    FounderShares: number;
    BasePrice: number;
    Scale: number;
    IPOPrice: number;
};

const type = (Id: string, Name: string, Description: string, CreationCost: number, SharesIssued: number,
    FounderShares: number, BasePrice: number, Scale: number, IPOPrice: number): CompanyType =>
    ({ Id, Name, Description, CreationCost, SharesIssued, FounderShares, BasePrice, Scale, IPOPrice });

export const ECONOMY_SETTINGS = {
    /** Same as CompanyTypes.List in the game. Id = the frame name in the game's dropdown. */
    types: [
        type('Aerospace', 'Aerospace', 'Aircraft, avionics, and research contracts.', 150000, 9000, 3600, 100, 9000, 85),
        type('DefCont', 'Defense Contractor', 'Weapons, vehicles, and equipment manufacturing.', 150000, 10000, 4000, 90, 10000, 75),
        type('PMC', 'Private Military Company', 'Contract personnel and security operations.', 130000, 8000, 3200, 75, 6500, 60),
        type('Resource', 'Resource Extraction', 'Mining, drilling, and raw material supply.', 130000, 10000, 4000, 65, 8000, 52),
        type('Bank', 'Bank', 'Lending, deposits, and capital services.', 200000, 16000, 6400, 85, 26000, 70),
        type('Holding', 'Holding Company', 'Owns and manages stakes in other corporations.', 200000, 7000, 2800, 120, 11000, 100),
        type('LawFirm', 'Law Firm', 'Contracts, arbitration, and corporate counsel.', 120000, 6000, 2400, 80, 6500, 65),
        type('Logistics', 'Logistics & Transport', 'Supply lines, freight, and fuel distribution.', 120000, 12000, 4800, 55, 12000, 45),
        type('OutVendor', 'Outdoor Vendor', 'Field retail, surplus, and mobile trade.', 100000, 14000, 5600, 35, 9000, 28),
        type('Clothing', 'Clothing & Apparel', 'Uniforms, civilian wear, and textiles.', 100000, 15000, 6000, 40, 9000, 32),
        type('Dining', 'Dining & Hospitality', 'Restaurants, catering, and mess contracts.', 100000, 15000, 6000, 35, 9000, 28),
        type('Media', 'Media & Broadcasting', 'News, propaganda, and communications.', 100000, 14000, 5600, 45, 8500, 36),
    ] as CompanyType[],

    /** Same as CompanyTypes.Listing in the game. */
    listing: {
        MinHolders: 5,
        MinQualifyingShares: 25,
        MinQualifyingSpend: 5000,
        MaxFounderPercent: 60,
        MinTreasury: 150000,
        MinAccountAgeDays: 14,
        FounderLockupSeconds: 86400,
    },

    /** Same as CompanyTypes.Trading in the game. */
    trading: {
        FeePercent: 2,
        MinTradeSize: 1,
        MaxTradeSize: 1000,
    },

    /**
     * Same as CompanyTypes.SystemCompanies in the game. Centurion creates these
     * on start-up if they don't exist yet, so the market is never empty.
     */
    systemCompanies: [
        {
            Ticker: 'KLBR',
            Name: 'Kaliber Inc.',
            TypeId: 'DefCont',
            Description: 'State-aligned arms manufacturer. Publicly traded since founding.',
            LogoId: '',
            Treasury: 5000000,
            SharesIssued: 20000,
            SharesHeld: 6000,
            BasePrice: 12,
            Scale: 20000,
        },
    ],

    /** Same as CompanyLevels in the game: levels come from member count. */
    levels: [
        { Level: 1, Name: 'START-UP', MembersRequired: 0 },
        { Level: 2, Name: 'PRIVATE VENTURE', MembersRequired: 50 },
        { Level: 3, Name: 'COMPANY', MembersRequired: 100 },
        { Level: 4, Name: 'ENTERPRISE', MembersRequired: 200 },
        { Level: 5, Name: 'CONGLOMERATE', MembersRequired: 500 },
        { Level: 6, Name: 'MEGACORP', MembersRequired: 1000 },
    ],

    /** Registering from Discord or the website: how many unpaid registrations one person can have. */
    maxPendingPerPerson: 1,

    /** Unpaid registrations are cancelled (and the ticker freed) after this many days. */
    pendingExpiryDays: 14,

    /** Most Y$ one brokerage deposit or withdrawal can move. */
    maxTransfer: 10000000,

    /** Seconds between trades from the website or Discord, per person. */
    tradeCooldownSeconds: 1,

    /**
     * Optional: a Discord channel told when a corporation is registered or listed.
     * Leave '' for none.
     */
    announceChannelId: '',
};

export const TYPES_BY_ID: Record<string, CompanyType> = Object.fromEntries(ECONOMY_SETTINGS.types.map((t) => [ t.Id, t ]));
