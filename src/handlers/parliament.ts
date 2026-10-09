import { provider } from '../database';

/**
 * Parliament seats.
 *
 * The chamber has TOTAL_SEATS seats, of which OPEN_SEATS can currently be
 * held. Parties and their seat counts are stored as one JSON value in the
 * meta store (no database migration needed), changed with the /seats-set and
 * /seats-remove commands, and read by the website through GET /parliament.
 */

export const TOTAL_SEATS = 80;
export const OPEN_SEATS = 17;

/** Used for a new party when no color is given. */
export const DEFAULT_PARTY_COLOR = '#949ba4';

const META_KEY = 'parliament';
const MAX_NAME_LENGTH = 40;
const MAX_PARTIES = 20;

export interface ParliamentParty {
    name: string;
    color: string;
    seats: number;
}

export interface Parliament {
    parties: ParliamentParty[];
    updatedAt: string | null;
}

/** What the chamber holds before anyone has run a seat command. */
const DEFAULT_PARLIAMENT: Parliament = {
    parties: [
        { name: 'Fulcrum Party', color: '#bed215', seats: 17 },
    ],
    updatedAt: null,
};

export const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

/** Trims a party name and collapses repeated spaces. */
export const cleanPartyName = (value: string) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const seatsHeld = (parliament: Parliament) => parliament.parties.reduce((total, party) => total + party.seats, 0);

/** Reads the stored chamber, falling back to the default if nothing valid is stored. */
export const getParliament = async (): Promise<Parliament> => {
    try {
        const stored = await provider.getMeta(META_KEY);
        if(!stored) return DEFAULT_PARLIAMENT;
        const parsed = JSON.parse(stored);
        if(!parsed || !Array.isArray(parsed.parties)) return DEFAULT_PARLIAMENT;
        return {
            parties: parsed.parties
                .filter((party: any) => party && typeof party.name === 'string' && party.name)
                .map((party: any) => ({
                    name: cleanPartyName(party.name),
                    color: isHexColor(party.color) ? party.color : DEFAULT_PARTY_COLOR,
                    seats: Math.max(0, Math.floor(Number(party.seats) || 0)),
                })),
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        };
    } catch (err) {
        console.error('[parliament] could not read stored seats', err);
        return DEFAULT_PARLIAMENT;
    }
}

const saveParliament = async (parties: ParliamentParty[]) => {
    const parliament: Parliament = { parties, updatedAt: new Date().toISOString() };
    await provider.setMeta(META_KEY, JSON.stringify(parliament));
    cached = null;
    return parliament;
}

export type SeatChange =
    | { ok: true; parliament: Parliament; party: ParliamentParty; created: boolean }
    | { ok: false; reason: string };

/**
 * Sets how many seats a party holds, creating the party if it does not exist.
 * Refuses a change that would put more than OPEN_SEATS seats in use.
 */
export const setPartySeats = async (rawName: string, seats: number, color?: string): Promise<SeatChange> => {
    const name = cleanPartyName(rawName);
    if(!name) return { ok: false, reason: 'A party name is required.' };
    if(!Number.isInteger(seats) || seats < 0) return { ok: false, reason: 'Seats must be a whole number, 0 or more.' };
    if(color && !isHexColor(color)) return { ok: false, reason: 'The color must be a hex code like `#369cd3`.' };

    const current = await getParliament();
    const parties = current.parties.map((party) => ({ ... party }));
    const existing = parties.find((party) => sameName(party.name, name));

    const heldByOthers = parties.filter((party) => party !== existing).reduce((total, party) => total + party.seats, 0);
    const free = OPEN_SEATS - heldByOthers;
    if(seats > free) {
        return { ok: false, reason: `Only **${free}** of the ${OPEN_SEATS} open seats ${free === 1 ? 'is' : 'are'} available to **${existing ? existing.name : name}**. Lower another party's seats first.` };
    }

    let party = existing;
    if(party) {
        party.seats = seats;
        if(color) party.color = color.toLowerCase();
    } else {
        if(parties.length >= MAX_PARTIES) return { ok: false, reason: `There can be at most ${MAX_PARTIES} parties.` };
        party = { name, color: (color || DEFAULT_PARTY_COLOR).toLowerCase(), seats };
        parties.push(party);
    }

    const parliament = await saveParliament(parties);
    return { ok: true, parliament, party, created: !existing };
}

/** Removes a party entirely. Its seats become open. */
export const removeParty = async (rawName: string): Promise<SeatChange> => {
    const name = cleanPartyName(rawName);
    const current = await getParliament();
    const party = current.parties.find((entry) => sameName(entry.name, name));
    if(!party) return { ok: false, reason: `There is no party named **${name || rawName}**. Use \`/seats\` to see the current parties.` };

    const parliament = await saveParliament(current.parties.filter((entry) => entry !== party));
    return { ok: true, parliament, party, created: false };
}

// The public /parliament route is read by the website. A short in-memory copy
// keeps a burst of page views from turning into a burst of database reads.
const CACHE_MS = 10_000;
let cached: { at: number; body: any } | null = null;

/** The JSON the website receives from GET /parliament. */
export const getParliamentResponse = async () => {
    if(cached && Date.now() - cached.at < CACHE_MS) return cached.body;
    const parliament = await getParliament();
    const body = {
        totalSeats: TOTAL_SEATS,
        openSeats: OPEN_SEATS,
        parties: parliament.parties,
        updatedAt: parliament.updatedAt,
    };
    cached = { at: Date.now(), body };
    return body;
}
