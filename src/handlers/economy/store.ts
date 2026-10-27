import { provider } from '../../database';
import { priceOf, round2 } from './pricing';

/**
 * Storage for the economy. Everything that changes a company goes through
 * saveCompany(), which only writes if nobody else changed it first (the
 * `version` check), so the game, the website and Discord can't overwrite
 * each other's trades.
 */

export const db = () => (provider as any).db;

// ---------------------------------------------------------------------------
// Company records
// ---------------------------------------------------------------------------

/**
 * The game's JSONEncode turns an empty Lua table into [] (an array). These
 * fields are maps keyed by user id or ticker, so turn [] back into {} or new
 * keys would be lost when the record is saved again.
 */
const MAP_FIELDS = [ 'Holders', 'Members', 'Banned', 'Relations', 'RankNames', 'Appearance' ];
const LIST_FIELDS = [ 'Announcements', 'Audit', 'RevenueHistory' ];

export const normalise = (c: any) => {
    if(!c || typeof c !== 'object') return c;
    for(const field of MAP_FIELDS) {
        const value = c[field];
        if(Array.isArray(value)) c[field] = Object.assign({}, ...value.map((v, i) => (v == null ? {} : { [String(i + 1)]: v })));
        else if(value != null && typeof value !== 'object') delete c[field];
    }
    for(const field of LIST_FIELDS) {
        const value = c[field];
        if(value && !Array.isArray(value) && typeof value === 'object') c[field] = Object.values(value);
    }
    c.Holders = c.Holders || {};
    return c;
};

const STATE_COLUMN: Record<string, string> = { Raising: 'RAISING', Listed: 'LISTED', Suspended: 'SUSPENDED', Pending: 'PENDING' };

/** The next change number. Game servers ask for everything with a higher one. */
export const nextSeq = async (tx: any = db()) => {
    const row = await tx.econCounter.upsert({ where: { id: 'seq' }, update: { value: { increment: 1 } }, create: { id: 'seq', value: 1 } });
    return row.value as number;
};

export const loadCompany = async (ticker: string, tx: any = db()) => {
    const row = await tx.econCompany.findUnique({ where: { ticker } });
    if(!row) return null;
    let data: any;
    try { data = JSON.parse(row.data); } catch { data = {}; }
    return { row, data: normalise(data) };
};

export const columnsFor = (data: any) => ({
    name: String(data.Name || '').slice(0, 60),
    typeId: String(data.TypeId || ''),
    ownerId: String(data.OwnerId ?? 0),
    state: STATE_COLUMN[data.State] || String(data.State || 'RAISING').toUpperCase(),
});

/**
 * Saves a changed record if it's still at `version`. Returns the new version,
 * or null if someone else saved first (load it again and retry).
 */
export const saveCompany = async (ticker: string, version: number, data: any, tx: any = db()) => {
    normalise(data);
    const seq = await nextSeq(tx);
    const result = await tx.econCompany.updateMany({
        where: { ticker, version },
        data: { ... columnsFor(data), data: JSON.stringify(data), version: version + 1, seq },
    });
    if(result.count === 0) return null;
    return version + 1;
};

export const insertCompany = async (data: any, source: string, registeredBy: string | null = null, tx: any = db()) => {
    normalise(data);
    const seq = await nextSeq(tx);
    await tx.econCompany.create({
        data: { ticker: data.Ticker, ... columnsFor(data), data: JSON.stringify(data), version: 1, seq, source, registeredBy },
    });
    return 1;
};

/** A summary-sized list of every company that's past the PENDING stage. */
export const allCompanies = async (includePending = false) => {
    const rows = await db().econCompany.findMany({ where: includePending ? {} : { NOT: { state: 'PENDING' } } });
    return rows.map((row: any) => {
        let data: any;
        try { data = JSON.parse(row.data); } catch { data = {}; }
        return { row, data: normalise(data) };
    });
};

// ---------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------

export const reserveTicker = async (ticker: string, ownerId: string, name: string) => {
    try {
        await db().econTicker.create({ data: { ticker, ownerId, name: name.slice(0, 60) } });
        return true;
    } catch {
        return false;
    }
};

export const tickerTaken = async (ticker: string) => !!(await db().econTicker.findUnique({ where: { ticker } }));

// ---------------------------------------------------------------------------
// Brokerage accounts and the ledger
// ---------------------------------------------------------------------------

export const getCash = async (robloxId: string, tx: any = db()) => {
    const row = await tx.econAccount.findUnique({ where: { robloxId } });
    return row ? row.cash as number : 0;
};

/** Adds (or with a negative amount, takes) cash. Returns the new balance, or null if it would go below zero. */
export const changeCash = async (robloxId: string, delta: number, tx: any = db()) => {
    if(delta < 0) {
        const result = await tx.econAccount.updateMany({ where: { robloxId, cash: { gte: -delta } }, data: { cash: { increment: delta } } });
        if(result.count === 0) return null;
    } else {
        await tx.econAccount.upsert({ where: { robloxId }, update: { cash: { increment: delta } }, create: { robloxId, cash: delta } });
    }
    return getCash(robloxId, tx);
};

export const addLedger = async (entry: { robloxId: string; kind: string; ticker?: string; name?: string; shares?: number; total?: number; source: string; note?: string }, tx: any = db()) => {
    await tx.econLedger.create({ data: {
        robloxId: entry.robloxId,
        kind: entry.kind,
        ticker: entry.ticker || null,
        name: entry.name ? entry.name.slice(0, 60) : null,
        shares: Math.floor(entry.shares || 0),
        total: Math.floor(entry.total || 0),
        source: entry.source,
        note: entry.note ? entry.note.slice(0, 200) : null,
    } });
};

export const ledgerFor = async (robloxId: string, limit = 100) => {
    const rows = await db().econLedger.findMany({ where: { robloxId }, orderBy: { id: 'desc' }, take: limit });
    return rows.map((r: any) => ({
        kind: r.kind,
        ticker: r.ticker || '',
        name: r.name || '',
        shares: r.shares,
        total: r.total,
        source: r.source,
        note: r.note || undefined,
        at: Math.floor(new Date(r.createdAt).getTime() / 1000),
    }));
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const LOG_LIMIT = 3000;
let logWrites = 0;

export const log = async (kind: string, entry: any) => {
    try {
        await db().econLog.create({ data: { kind: String(kind).slice(0, 40), ticker: entry?.ticker ? String(entry.ticker).slice(0, 5) : null, data: JSON.stringify(entry || {}).slice(0, 4000) } });
        logWrites += 1;
        if(logWrites % 100 === 0) {
            const cutoff = await db().econLog.findFirst({ orderBy: { id: 'desc' }, skip: LOG_LIMIT, select: { id: true } });
            if(cutoff) await db().econLog.deleteMany({ where: { id: { lte: cutoff.id } } });
        }
    } catch (err) {
        console.error('[economy] log', err);
    }
};

export const recentLog = async (limit = 300) => {
    const rows = await db().econLog.findMany({ orderBy: { id: 'desc' }, take: limit });
    return rows.reverse().map((r: any) => {
        let data: any = {};
        try { data = JSON.parse(r.data); } catch { /* ignore */ }
        const at = Math.floor(new Date(r.createdAt).getTime() / 1000);
        return { ... data, kind: r.kind, at, dateText: new Date(at * 1000).toISOString().slice(0, 19).replace('T', ' ') };
    });
};

// ---------------------------------------------------------------------------
// Price history
// ---------------------------------------------------------------------------

/** Same tiers as the game's PriceHistory: step = seconds between samples, keep = how long they're kept. */
const TIERS = [
    { name: 'fine', step: 55, keep: 86400 * 3 },
    { name: 'hour', step: 3500, keep: 86400 * 214 },
    { name: 'day', step: 85000, keep: 86400 * 365 * 7 },
];

const RANGES: Record<string, { tier: string; window: number | 'ytd' }> = {
    '1D': { tier: 'fine', window: 86400 },
    '3D': { tier: 'fine', window: 86400 * 3 },
    '1M': { tier: 'hour', window: 86400 * 30 },
    '6M': { tier: 'hour', window: 86400 * 182 },
    'YTD': { tier: 'day', window: 'ytd' },
    '1Y': { tier: 'day', window: 86400 * 365 },
    '5Y': { tier: 'day', window: 86400 * 365 * 5 },
    'MAX': { tier: 'day', window: Infinity },
};
export const RANGE_NAMES = Object.keys(RANGES);

const lastSample: Record<string, Record<string, { t: number; c: number }>> = {};
const MAX_POINTS = 50;

const now = () => Math.floor(Date.now() / 1000);

/** Remembers the newest sample per tier, so we don't ask the database on every trade. */
const lastFor = async (ticker: string, tier: string) => {
    const cached = lastSample[ticker]?.[tier];
    if(cached) return cached;
    const row = await db().econPrice.findFirst({ where: { ticker, tier }, orderBy: { t: 'desc' } });
    const value = row ? { t: row.t, c: row.c } : { t: 0, c: 0 };
    lastSample[ticker] = lastSample[ticker] || {};
    lastSample[ticker][tier] = value;
    return value;
};

/** Adds a price sample to each tier whose step has passed. Called after every trade and once a minute. */
export const recordPrice = async (ticker: string, price: number) => {
    if(!(price > 0)) return;
    const t = now();
    for(const tier of TIERS) {
        const last = await lastFor(ticker, tier.name);
        if(t - last.t >= tier.step) {
            await db().econPrice.create({ data: { ticker, tier: tier.name, t, c: round2(price) } });
            lastSample[ticker][tier.name] = { t, c: round2(price) };
        }
    }
};

export const prunePrices = async () => {
    const t = now();
    for(const tier of TIERS) {
        await db().econPrice.deleteMany({ where: { tier: tier.name, t: { lt: t - tier.keep } } });
    }
};

const downsample = <T>(samples: T[], max: number): T[] => {
    if(samples.length <= max) return samples;
    const out: T[] = [];
    for(let i = 0; i < max; i++) out.push(samples[Math.floor(i * (samples.length - 1) / (max - 1))]);
    return out;
};

/** Points for a chart range, at most 50. `partial` is true when the range has under two samples. */
export const priceHistory = async (ticker: string, range: string) => {
    const spec = RANGES[range] || RANGES['1D'];
    let cutoff = 0;
    if(spec.window === 'ytd') cutoff = Math.floor(Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000);
    else if(spec.window !== Infinity) cutoff = now() - (spec.window as number);

    const rows = await db().econPrice.findMany({ where: { ticker, tier: spec.tier, t: { gte: cutoff } }, orderBy: { t: 'asc' } });
    let points = rows.map((r: any) => ({ t: r.t, c: r.c }));
    const partial = points.length < 2;
    if(partial) {
        for(const tier of TIERS) {
            const alt = await db().econPrice.findMany({ where: { ticker, tier: tier.name }, orderBy: { t: 'asc' } });
            if(alt.length >= 2) { points = alt.map((r: any) => ({ t: r.t, c: r.c })); break; }
        }
    }
    return { points: downsample(points, MAX_POINTS), partial };
};

/**
 * The price 24 hours ago (or the oldest we have), per company, for the
 * "+0.28% Today" figures. Refreshed once a minute by the sampler.
 */
export const referencePrices: Record<string, number> = {};

export const refreshReferences = async () => {
    const cutoff = now() - 86400;
    const tickers = await db().econCompany.findMany({ select: { ticker: true } });
    for(const { ticker } of tickers) {
        const row = await db().econPrice.findFirst({ where: { ticker, tier: 'fine', t: { gte: cutoff } }, orderBy: { t: 'asc' } })
            || await db().econPrice.findFirst({ where: { ticker, tier: 'hour', t: { gte: cutoff } }, orderBy: { t: 'asc' } })
            || await db().econPrice.findFirst({ where: { ticker, tier: 'fine' }, orderBy: { t: 'asc' } });
        if(row) referencePrices[ticker] = row.c;
    }
};

export const changePercent = (ticker: string, current: number) => {
    const ref = referencePrices[ticker];
    if(!ref || ref <= 0) return 0;
    return Math.round((current - ref) / ref * 100 * 10000) / 10000;
};

export const samplePrice = (data: any) => priceOf(data);
