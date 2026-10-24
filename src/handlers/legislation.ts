import { provider } from '../database';

/**
 * Bills and laws.
 *
 * Bills are stored as one JSON value in the meta store (no database migration
 * needed), changed with /bill-add, /bill-update and /bill-remove, and read by
 * the website through GET /legislation. The website also reads bills.json from
 * its own repo; a bill here with the same number replaces the one in that file.
 */

export const LEGISLATION_SETTINGS = {
    /** Roles (besides admins) allowed to add and change bills, e.g. the Speaker or a clerk. IDs in quotes. */
    clerkRoleIds: [ '' ],
};

export const BILL_STATUSES = {
    pending: 'In Parliament',
    passed: 'Passed by Parliament',
    signed: 'Signed into law',
    vetoed: 'Vetoed',
    failed: 'Failed',
    withdrawn: 'Withdrawn',
} as const;
export type BillStatus = keyof typeof BILL_STATUSES;

export interface Bill {
    number: string;
    title: string;
    status: BillStatus;
    summary: string | null;
    text: string | null;
    link: string | null;
    sponsor: string | null;
    party: string | null;
    votes: { for: number; against: number; abstain: number } | null;
    introduced: string | null;   // YYYY-MM-DD
    passed: string | null;
    signed: string | null;
    updatedAt: string;
}

const META_KEY = 'legislation';
const MAX_BILLS = 1000;
const LIMITS = { number: 20, title: 150, summary: 600, text: 6000, sponsor: 60, party: 40, link: 300 };

/** Used to clear a field in /bill-update. */
export const CLEAR = '-';

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (value: unknown, max: number) => String(value ?? '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim().slice(0, max);
const sameNumber = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

export const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
export const isLink = (value: string) => /^https:\/\/[^\s"<>]+$/.test(value);

const readBills = async (): Promise<Bill[]> => {
    try {
        const stored = await provider.getMeta(META_KEY);
        if(!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed?.bills) ? parsed.bills : [];
    } catch (err) {
        console.error('[legislation] could not read stored bills', err);
        return [];
    }
}

const saveBills = async (bills: Bill[]) => {
    await provider.setMeta(META_KEY, JSON.stringify({ bills, updatedAt: new Date().toISOString() }));
    cached = null;
}

export const getBill = async (number: string) => (await readBills()).find((b) => sameNumber(b.number, clean(number, LIMITS.number))) || null;

/** The options the commands accept. Leave a field out to keep it; "-" clears it (in /bill-update). */
export interface BillInput {
    number?: string; title?: string; status?: string; summary?: string; text?: string; link?: string;
    sponsor?: string; party?: string; votesFor?: number; votesAgainst?: number; votesAbstain?: number;
    introduced?: string; passed?: string; signed?: string;
}

export type BillChange = { ok: true; bill: Bill; created: boolean } | { ok: false; reason: string };

/** Applies the given options to a bill, checking each one. */
const applyInput = (bill: Bill, input: BillInput): string | null => {
    const set = (key: 'summary' | 'sponsor' | 'party', value: string | undefined, max: number) => {
        if(value === undefined) return;
        bill[key] = value.trim() === CLEAR ? null : (clean(value, max) || null);
    };

    if(input.title !== undefined) {
        const title = clean(input.title, LIMITS.title);
        if(title.length < 3) return 'The title must be at least 3 characters.';
        bill.title = title;
    }
    if(input.status !== undefined) {
        if(!(input.status in BILL_STATUSES)) return 'That status isn\'t one of the choices.';
        bill.status = input.status as BillStatus;
    }
    set('summary', input.summary, LIMITS.summary);
    set('sponsor', input.sponsor, LIMITS.sponsor);
    set('party', input.party, LIMITS.party);
    if(input.text !== undefined) bill.text = input.text.trim() === CLEAR ? null : (cleanText(input.text, LIMITS.text) || null);
    if(input.link !== undefined) {
        const link = input.link.trim();
        if(link === CLEAR) bill.link = null;
        else if(!isLink(link) || link.length > LIMITS.link) return 'The link must be a full web address starting with https://';
        else bill.link = link;
    }

    for(const key of [ 'introduced', 'passed', 'signed' ] as const) {
        const value = input[key];
        if(value === undefined) continue;
        if(value.trim() === CLEAR) { bill[key] = null; continue; }
        if(!isDate(value.trim())) return `The ${key} date must look like 2026-10-24 (year-month-day).`;
        bill[key] = value.trim();
    }

    const votes = [ input.votesFor, input.votesAgainst, input.votesAbstain ];
    if(votes.some((v) => v !== undefined)) {
        if(votes.some((v) => v !== undefined && (!Number.isInteger(v) || v < 0 || v > 1000))) return 'Votes must be whole numbers, 0 or more.';
        const current = bill.votes || { for: 0, against: 0, abstain: 0 };
        bill.votes = {
            for: input.votesFor ?? current.for,
            against: input.votesAgainst ?? current.against,
            abstain: input.votesAbstain ?? current.abstain,
        };
    }

    // Fill in dates that follow from the status, if they weren't given
    if([ 'passed', 'signed', 'vetoed' ].includes(bill.status) && !bill.passed) bill.passed = today();
    if(bill.status === 'signed' && !bill.signed) bill.signed = today();
    return null;
}

export const addBill = async (input: BillInput): Promise<BillChange> => {
    const bills = await readBills();
    if(bills.length >= MAX_BILLS) return { ok: false, reason: `There can be at most ${MAX_BILLS} bills.` };

    let number = clean(input.number, LIMITS.number);
    if(number) {
        if(!/^[A-Za-z0-9][A-Za-z0-9 .\-\/]*$/.test(number)) return { ok: false, reason: 'A bill number can only use letters, numbers, spaces, dots, dashes and slashes.' };
        if(bills.some((b) => sameNumber(b.number, number))) return { ok: false, reason: `There is already a bill numbered **${number}**.` };
    } else {
        // Next number after the highest plain number used so far
        const highest = bills.reduce((max, b) => /^\d+$/.test(b.number) ? Math.max(max, Number(b.number)) : max, 0);
        number = String(highest + 1);
    }

    const bill: Bill = {
        number, title: '', status: 'pending', summary: null, text: null, link: null, sponsor: null, party: null,
        votes: null, introduced: today(), passed: null, signed: null, updatedAt: new Date().toISOString(),
    };
    const problem = applyInput(bill, { ... input, number: undefined, status: input.status || 'pending' });
    if(problem) return { ok: false, reason: problem };
    if(!bill.title) return { ok: false, reason: 'A title is required.' };

    bills.push(bill);
    await saveBills(bills);
    return { ok: true, bill, created: true };
}

export const updateBill = async (number: string, input: BillInput): Promise<BillChange> => {
    const bills = await readBills();
    const bill = bills.find((b) => sameNumber(b.number, clean(number, LIMITS.number)));
    if(!bill) return { ok: false, reason: `There is no bill numbered **${clean(number, LIMITS.number) || number}**.` };
    const copy: Bill = JSON.parse(JSON.stringify(bill));
    const problem = applyInput(copy, input);
    if(problem) return { ok: false, reason: problem };
    copy.updatedAt = new Date().toISOString();
    Object.assign(bill, copy);
    await saveBills(bills);
    return { ok: true, bill, created: false };
}

export const removeBill = async (number: string): Promise<BillChange> => {
    const bills = await readBills();
    const bill = bills.find((b) => sameNumber(b.number, clean(number, LIMITS.number)));
    if(!bill) return { ok: false, reason: `There is no bill numbered **${clean(number, LIMITS.number) || number}**.` };
    await saveBills(bills.filter((b) => b !== bill));
    return { ok: true, bill, created: false };
}

// The public /legislation route is read by the website; a short in-memory copy
// keeps a burst of page views from turning into a burst of database reads.
const CACHE_MS = 10_000;
let cached: { at: number; body: any } | null = null;

export const getLegislationResponse = async () => {
    if(cached && Date.now() - cached.at < CACHE_MS) return cached.body;
    const body = { success: true, bills: await readBills() };
    cached = { at: Date.now(), body };
    return body;
}

// ---- Shared by the /bill-add and /bill-update commands ----

const STATUS_CHOICES = Object.entries(BILL_STATUSES).map(([ value, name ]) => ({ name, value }));

/** The optional options both commands take, in the order Discord shows them. */
export const billOptionArgs = (forUpdate: boolean): any[] => {
    const clearNote = forUpdate ? ` "${CLEAR}" clears it.` : '';
    return [
        ...(forUpdate ? [ { trigger: 'title', description: 'A new title.', required: false, type: 'String' } ] : []),
        { trigger: 'status', description: forUpdate ? 'The bill\'s new status.' : 'Where the bill stands. Defaults to In Parliament.', required: false, type: 'String', choices: STATUS_CHOICES },
        { trigger: 'summary', description: `A short summary shown on the website.${clearNote}`, required: false, type: 'String' },
        { trigger: 'text', description: `The full text of the bill. Type \\n for a new paragraph.${clearNote}`, required: false, type: 'String' },
        { trigger: 'link', description: `A link to the full text, e.g. a Google Doc.${clearNote}`, required: false, type: 'String' },
        { trigger: 'sponsor', description: `Who introduced it.${clearNote}`, required: false, type: 'String' },
        { trigger: 'party', description: `The sponsor's party.${clearNote}`, required: false, type: 'String' },
        { trigger: 'votes-for', description: 'Votes in favour.', required: false, type: 'Number' },
        { trigger: 'votes-against', description: 'Votes against.', required: false, type: 'Number' },
        { trigger: 'votes-abstain', description: 'Abstentions.', required: false, type: 'Number' },
        { trigger: 'introduced', description: `Date introduced, like 2026-10-24.${forUpdate ? clearNote : ' Defaults to today.'}`, required: false, type: 'String' },
        { trigger: 'passed', description: `Date Parliament passed it. Filled in automatically when it passes.${clearNote}`, required: false, type: 'String' },
        { trigger: 'signed', description: `Date the Emperor signed it. Filled in automatically when signed.${clearNote}`, required: false, type: 'String' },
    ];
}

/** Reads the options above from a command into a BillInput. */
export const readBillInput = (args: Record<string, any>): BillInput => {
    const str = (key: string) => (args[key] === undefined || args[key] === null ? undefined : String(args[key]));
    const num = (key: string) => (args[key] === undefined || args[key] === null ? undefined : Number(args[key]));
    return {
        number: str('number'), title: str('title'), status: str('status'), summary: str('summary'), text: str('text'),
        link: str('link'), sponsor: str('sponsor'), party: str('party'),
        votesFor: num('votes-for'), votesAgainst: num('votes-against'), votesAbstain: num('votes-abstain'),
        introduced: str('introduced'), passed: str('passed'), signed: str('signed'),
    };
}

/** One-line description of a bill for command replies. */
export const describeBill = (bill: Bill) => {
    const parts = [ `**Bill ${bill.number}: ${bill.title}**`, BILL_STATUSES[bill.status] ];
    if(bill.votes) parts.push(`${bill.votes.for} for, ${bill.votes.against} against, ${bill.votes.abstain} abstaining`);
    return parts.join('\n');
}
