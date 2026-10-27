import { ECONOMY_SETTINGS, TYPES_BY_ID } from './settings';
import { priceOf, quote, maxAffordable } from './pricing';
import {
    db, loadCompany, saveCompany, insertCompany, allCompanies, reserveTicker, tickerTaken,
    getCash, changeCash, addLedger, ledgerFor, log, recordPrice, prunePrices, priceHistory,
    refreshReferences, changePercent, RANGE_NAMES,
} from './store';

/**
 * The market, as the website and Discord see it: company summaries, trading
 * with a brokerage balance, and registering corporations.
 *
 * Trades follow exactly the same rules as tradeShares in the game's
 * CompanyService. The only difference is where the money comes from: in-game
 * it's the player's Wallet and Bank; here it's their brokerage account, which
 * they fill and empty in-game.
 */

export type Result = { ok: true; msg?: string; data?: any } | { ok: false; msg: string };
const fail = (msg: string): Result => ({ ok: false, msg });
const L = ECONOMY_SETTINGS.listing;
const T = ECONOMY_SETTINGS.trading;

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

const memberCount = (c: any) => {
    const members = c.Members && typeof c.Members === 'object' ? Object.keys(c.Members) : [];
    const owner = String(c.OwnerId || 0);
    return members.length + (owner !== '0' && !members.includes(owner) ? 1 : 0);
};

const levelFor = (members: number) => {
    let current = ECONOMY_SETTINGS.levels[0];
    for(const level of ECONOMY_SETTINGS.levels) if(members >= level.MembersRequired) current = level;
    return current;
};

const holdingOf = (c: any, robloxId: string | null) => (robloxId && c.Holders?.[robloxId]?.shares) || 0;

/** Same as listingReport in the game. Holders' account age can only be checked in-game, so it isn't here. */
const listingReport = (c: any) => {
    const founderShares = holdingOf(c, String(c.OwnerId));
    const founderPercent = c.SharesHeld > 0 ? founderShares / c.SharesHeld * 100 : 100;
    let holders = 0;
    for(const [ id, h ] of Object.entries<any>(c.Holders || {})) {
        if(id !== String(c.OwnerId) && h.shares >= L.MinQualifyingShares && h.spent >= L.MinQualifyingSpend) holders += 1;
    }
    const missing: string[] = [];
    if(holders < L.MinHolders) missing.push(`${holders} of ${L.MinHolders} qualifying shareholders`);
    if(founderPercent > L.MaxFounderPercent) missing.push(`founder holds ${Math.round(founderPercent)}%, must be under ${L.MaxFounderPercent}%`);
    if((c.Treasury || 0) < L.MinTreasury) missing.push(`treasury Y$${c.Treasury || 0} of Y$${L.MinTreasury}`);
    return { met: missing.length === 0, missing, stats: { holders, founderPercent, treasury: c.Treasury || 0 } };
};

const STATE_NAMES: Record<string, string> = { Raising: 'Raising', Listed: 'Listed', Suspended: 'Suspended', Pending: 'Awaiting payment' };

export const summarise = (c: any, viewer: string | null = null) => {
    const price = priceOf(c);
    const members = memberCount(c);
    const level = levelFor(members);
    const type = TYPES_BY_ID[c.TypeId];
    const holders = Object.values<any>(c.Holders || {}).filter((h) => h.shares > 0).length;
    return {
        ticker: c.Ticker,
        name: c.Name,
        typeId: c.TypeId,
        typeName: type?.Name || c.TypeId,
        state: c.State,
        stateName: STATE_NAMES[c.State] || c.State,
        system: c.System === true,
        price,
        changePct: c.State === 'Pending' ? 0 : changePercent(c.Ticker, price),
        sharesIssued: c.SharesIssued || 0,
        sharesHeld: c.SharesHeld || 0,
        treasuryShares: (c.SharesIssued || 0) - (c.SharesHeld || 0),
        treasury: c.Treasury || 0,
        marketCap: Math.round(price * (c.SharesHeld || 0)),
        holders,
        ownerId: String(c.OwnerId ?? 0),
        description: c.Description || '',
        logoId: c.Appearance?.LogoId || '',
        memberCount: members,
        level: level.Level,
        levelName: level.Name,
        createdAt: c.CreatedAt || null,
        listedAt: c.ListedAt || null,
        youOwn: holdingOf(c, viewer),
    };
};

export const listCompanies = async (viewer: string | null = null) => {
    const all = await allCompanies(false);
    return all.map(({ data }) => summarise(data, viewer))
        .sort((a, b) => (a.state === 'Raising' ? 1 : 0) - (b.state === 'Raising' ? 1 : 0) || b.marketCap - a.marketCap);
};

export const companyDetail = async (ticker: string, range: string, viewer: string | null = null): Promise<Result> => {
    const found = await loadCompany(cleanTicker(ticker));
    if(!found || found.data.State === 'Pending') return fail('That corporation doesn\'t exist.');
    const c = found.data;
    const report = listingReport(c);
    const history = await priceHistory(c.Ticker, RANGE_NAMES.includes(range) ? range : '1D');
    const announcements = Array.isArray(c.Announcements) ? c.Announcements.slice(0, 5).map((a: any) => ({ text: String(a.text || ''), userName: String(a.userName || ''), at: a.at || null })) : [];
    return { ok: true, data: {
        company: summarise(c, viewer),
        listing: c.State === 'Raising' ? { met: report.met, missing: report.missing, stats: report.stats } : null,
        history,
        announcements,
    } };
};

export const historyFor = async (ticker: string, range: string) => {
    const found = await loadCompany(cleanTicker(ticker));
    if(!found || found.data.State === 'Pending') return null;
    return { ... await priceHistory(found.data.Ticker, RANGE_NAMES.includes(range) ? range : '1D'), price: priceOf(found.data), changePct: changePercent(found.data.Ticker, priceOf(found.data)) };
};

export const companyTypes = () => ({
    types: ECONOMY_SETTINGS.types,
    listing: L,
    trading: T,
});

// ---------------------------------------------------------------------------
// A person's own view
// ---------------------------------------------------------------------------

export const portfolio = async (robloxId: string) => {
    const all = await allCompanies(true);
    const holdings = all.filter(({ data }) => data.State !== 'Pending' && holdingOf(data, robloxId) > 0).map(({ data }) => summarise(data, robloxId));
    const pending = all.filter(({ data }) => data.State === 'Pending' && String(data.OwnerId) === robloxId).map(({ data }) => ({
        ticker: data.Ticker, name: data.Name, typeId: data.TypeId, typeName: TYPES_BY_ID[data.TypeId]?.Name || data.TypeId,
        cost: data.PendingFee || TYPES_BY_ID[data.TypeId]?.CreationCost || 0, createdAt: data.CreatedAt || null,
    }));
    const founded = all.filter(({ data }) => data.State !== 'Pending' && String(data.OwnerId) === robloxId).map(({ data }) => data.Ticker);
    const cash = await getCash(robloxId);
    const value = holdings.reduce((sum, h) => sum + h.price * h.youOwn, 0);
    return { cash, holdingsValue: Math.round(value), holdings, pending, founded, history: await ledgerFor(robloxId, 50) };
};

// ---------------------------------------------------------------------------
// Trading from the website and Discord
// ---------------------------------------------------------------------------

const lastTrade = new Map<string, number>();

const cleanTicker = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
const cleanAmount = (value: unknown) => Math.floor(Number(value) || 0);

export const previewTrade = async (robloxId: string, tickerIn: unknown, amountIn: unknown, buying: boolean): Promise<Result> => {
    const amount = cleanAmount(amountIn);
    if(amount < 1 || amount > T.MaxTradeSize) return fail(`Trade between ${T.MinTradeSize} and ${T.MaxTradeSize} shares.`);
    const found = await loadCompany(cleanTicker(tickerIn));
    if(!found || found.data.State === 'Pending') return fail('That corporation doesn\'t exist.');
    const c = found.data;
    const { total, fee } = quote(c, amount, buying);
    const cash = await getCash(robloxId);
    return { ok: true, data: { total, fee, pricePer: total / amount, price: priceOf(c), youOwn: holdingOf(c, robloxId), cash, maxAffordable: maxAffordable(c, cash) } };
};

/**
 * Buys or sells with the brokerage balance. The company and the balance are
 * changed in one database transaction, and the company only saves if no other
 * trade (in-game or here) got there first; if one did, it tries again with
 * the new price.
 */
export const trade = async (robloxId: string, userName: string, tickerIn: unknown, amountIn: unknown, buying: boolean, source: 'WEB' | 'DISCORD'): Promise<Result> => {
    const ticker = cleanTicker(tickerIn);
    const amount = cleanAmount(amountIn);
    if(amount < T.MinTradeSize || amount > T.MaxTradeSize) return fail(`Trade between ${T.MinTradeSize} and ${T.MaxTradeSize} shares.`);

    const last = lastTrade.get(robloxId) || 0;
    if(Date.now() - last < ECONOMY_SETTINGS.tradeCooldownSeconds * 1000) return fail('Slow down a moment.');
    lastTrade.set(robloxId, Date.now());

    for(let attempt = 0; attempt < 5; attempt++) {
        const outcome = await db().$transaction(async (tx: any) => {
            const found = await loadCompany(ticker, tx);
            if(!found || found.data.State === 'Pending') return fail('That corporation doesn\'t exist.');
            const c = found.data;
            const holder = c.Holders[robloxId] || { shares: 0, spent: 0 };
            let total: number;

            if(buying) {
                if(c.SharesIssued - c.SharesHeld < amount) return fail('Not enough shares left to sell.');
                total = quote(c, amount, true).total;
                const balance = await changeCash(robloxId, -total, tx);
                if(balance === null) return fail(`You need Y$${total.toLocaleString('en-US')} in your brokerage account for that. Deposit Y$ in-game first.`);
                holder.shares += amount;
                holder.spent += total;
                c.SharesHeld += amount;
                c.Treasury += total;
            } else {
                if(holder.shares < amount) return fail('You don\'t own that many shares.');
                if(c.State === 'Listed' && robloxId === String(c.OwnerId) && c.ListedAt && Math.floor(Date.now() / 1000) - c.ListedAt < L.FounderLockupSeconds) {
                    return fail('Founder shares are locked for now.');
                }
                total = quote(c, amount, false).total;
                if(c.Treasury < total) {
                    // Same as the game: the company goes Suspended until buying refills it.
                    c.State = 'Suspended';
                    const saved = await saveCompany(ticker, found.row.version, c, tx);
                    if(saved === null) return { retry: true };
                    return fail('The company can\'t cover that sale right now.');
                }
                holder.shares -= amount;
                holder.spent = Math.max(holder.spent - total, 0);
                c.SharesHeld -= amount;
                c.Treasury -= total;
                if(c.State === 'Suspended') c.State = 'Listed';
                await changeCash(robloxId, total, tx);
            }

            if(holder.shares > 0) c.Holders[robloxId] = holder; else delete c.Holders[robloxId];
            const saved = await saveCompany(ticker, found.row.version, c, tx);
            if(saved === null) throw new RetryTrade();
            await addLedger({ robloxId, kind: buying ? 'buy' : 'sell', ticker, name: c.Name, shares: amount, total, source }, tx);
            return { ok: true, data: { total, company: c } } as any;
        }).catch((err: any) => {
            if(err instanceof RetryTrade) return { retry: true };
            throw err;
        });

        if((outcome as any).retry) continue;
        if(outcome.ok === false) return outcome;

        const c = (outcome as any).data.company;
        await recordPrice(ticker, priceOf(c));
        await log('trade', { ticker, userId: robloxId, userName, amount, buying, total: (outcome as any).data.total, treasuryAfter: c.Treasury, sharesHeldAfter: c.SharesHeld, source });
        return { ok: true, msg: `${buying ? 'Bought' : 'Sold'} ${amount.toLocaleString('en-US')} ${ticker} for Y$${(outcome as any).data.total.toLocaleString('en-US')}.`, data: {
            total: (outcome as any).data.total,
            company: summarise(c, robloxId),
            cash: await getCash(robloxId),
        } };
    }
    return fail('The market is busy right now. Please try again.');
};

class RetryTrade extends Error {}

/** The founder takes their corporation public, once it meets the rules. Same as requestListing in the game. */
export const fileListing = async (robloxId: string, tickerIn: unknown): Promise<Result> => {
    const ticker = cleanTicker(tickerIn);
    for(let attempt = 0; attempt < 5; attempt++) {
        const found = await loadCompany(ticker);
        if(!found || found.data.State === 'Pending') return fail('That corporation doesn\'t exist.');
        const c = found.data;
        if(String(c.OwnerId) !== robloxId) return fail('Only the founder can file for listing.');
        if(c.State !== 'Raising') return fail('This corporation is already listed.');
        const report = listingReport(c);
        if(!report.met) return fail('Not eligible yet: ' + report.missing.join(', '));
        c.State = 'Listed';
        c.ListedAt = Math.floor(Date.now() / 1000);
        if(await saveCompany(ticker, found.row.version, c) === null) continue;
        await recordPrice(ticker, priceOf(c));
        await log('company_listed', { ticker, name: c.Name, ownerId: c.OwnerId, treasury: c.Treasury, sharesHeld: c.SharesHeld, source: 'WEB' });
        return { ok: true, msg: `${c.Name} is now listed on the market.`, data: { company: summarise(c, robloxId) } };
    }
    return fail('The market is busy right now. Please try again.');
};

// ---------------------------------------------------------------------------
// Registering a corporation from the website or Discord
// ---------------------------------------------------------------------------

/** Same order as the game's ticker derivation: initials, then consonants, then leading letters. */
export const tickerCandidates = (name: string) => {
    const letters = name.toUpperCase().replace(/[^A-Z ]/g, '');
    const words = letters.split(/\s+/).filter(Boolean);
    const flat = letters.replace(/ /g, '');
    const out: string[] = [];
    const add = (candidate: string) => { if(candidate.length >= 2 && candidate.length <= 5 && !out.includes(candidate)) out.push(candidate); };
    if(words.length >= 2) add(words.map((w) => w[0]).join('').slice(0, 5));
    if(words[0]) {
        add(words[0].replace(/[AEIOU]/g, '').slice(0, 4));
        add(words[0].slice(0, 4));
        add(words[0].slice(0, 3));
    }
    add(flat.slice(0, 4));
    add(flat.replace(/[AEIOU]/g, '').slice(0, 4));
    const base = flat.slice(0, 3);
    if(base.length >= 2) for(let i = 0; i < 26; i++) add(base + String.fromCharCode(65 + i));
    return out;
};

export const suggestTicker = async (name: string) => {
    for(const candidate of tickerCandidates(String(name || ''))) {
        if(!(await tickerTaken(candidate))) return candidate;
    }
    return null;
};

const cleanName = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * Reserves the ticker and creates the corporation as "awaiting payment".
 * The creation fee is taken from the founder's Wallet/Bank the next time
 * they join the game, and Roblox's text filter checks the name then, before
 * the corporation appears anywhere in-game. Until then only the founder sees it.
 */
export const register = async (robloxId: string, userName: string, input: any, source: 'WEB' | 'DISCORD', discordId: string): Promise<Result> => {
    const name = cleanName(input.name);
    if(name.length < 3 || name.length > 40) return fail('The name must be 3-40 characters.');
    if(!/^[A-Za-z0-9 .,&'\-]+$/.test(name)) return fail('Use letters, numbers, spaces and . , & \' - only.');
    const type = TYPES_BY_ID[String(input.typeId || '')];
    if(!type) return fail('Pick a company type.');

    const description = cleanName(input.description).slice(0, 400);
    const logoId = String(input.logoId || '').replace(/\D/g, '').slice(0, 20);

    const pending = (await allCompanies(true)).filter(({ data }) => data.State === 'Pending' && String(data.OwnerId) === robloxId);
    if(pending.length >= ECONOMY_SETTINGS.maxPendingPerPerson) {
        return fail(`You already have a corporation waiting for payment (${pending[0].data.Ticker}). Join the game to pay for it, or cancel it first.`);
    }

    let candidates: string[];
    const wanted = String(input.ticker || '').toUpperCase().replace(/[^A-Z]/g, '');
    if(wanted) {
        if(wanted.length < 2 || wanted.length > 5) return fail('The ticker must be 2-5 letters.');
        candidates = [ wanted ];
    } else {
        candidates = tickerCandidates(name);
        if(!candidates.length) return fail('Couldn\'t make a ticker from that name. Pick one yourself.');
    }

    let ticker: string | null = null;
    for(const candidate of candidates) {
        if(await reserveTicker(candidate, robloxId, name)) { ticker = candidate; break; }
    }
    if(!ticker) return fail(wanted ? 'That ticker is already taken.' : 'Couldn\'t find a free ticker for that name. Pick one yourself.');

    const createdAt = Math.floor(Date.now() / 1000);
    const record = {
        Ticker: ticker,
        Name: name,
        TypeId: type.Id,
        OwnerId: Number(robloxId),
        State: 'Pending',
        SharesIssued: type.SharesIssued,
        SharesHeld: 0,
        Treasury: 0,
        BasePrice: type.BasePrice,
        Scale: type.Scale,
        IPOPrice: type.IPOPrice,
        Holders: {},
        CreatedAt: createdAt,
        Description: description,
        Appearance: { LogoId: logoId, ShirtId: '', PantsId: '', LiveryId: '' },
        PendingFee: type.CreationCost,
        PendingSince: createdAt,
        RegisteredFrom: source,
    };
    await insertCompany(record, source, discordId);
    await log('company_registered', { ticker, name, typeId: type.Id, ownerId: robloxId, ownerName: userName, cost: type.CreationCost, source });
    return { ok: true, msg: `${name} (${ticker}) is reserved. Join the game to pay the Y$${type.CreationCost.toLocaleString('en-US')} founding fee and open it.`, data: { ticker, name, cost: type.CreationCost } };
};

export const cancelPending = async (robloxId: string, tickerIn: unknown): Promise<Result> => {
    const ticker = cleanTicker(tickerIn);
    const found = await loadCompany(ticker);
    if(!found || found.data.State !== 'Pending' || String(found.data.OwnerId) !== robloxId) return fail('You have no unpaid corporation with that ticker.');
    await removePending(ticker);
    await log('company_cancelled', { ticker, ownerId: robloxId });
    return { ok: true, msg: `${found.data.Name} (${ticker}) was cancelled and the ticker is free again.` };
};

const removePending = async (ticker: string) => {
    await db().econCompany.deleteMany({ where: { ticker, state: 'PENDING' } });
    await db().econTicker.deleteMany({ where: { ticker } });
};

// ---------------------------------------------------------------------------
// Paying for a registration in-game
// ---------------------------------------------------------------------------

export const pendingFor = async (robloxId: string) => {
    const rows = await db().econCompany.findMany({ where: { ownerId: robloxId, state: 'PENDING' } });
    return rows.map((row: any) => {
        const data = JSON.parse(row.data);
        return { ticker: data.Ticker, name: data.Name, typeId: data.TypeId, cost: data.PendingFee, logoId: data.Appearance?.LogoId || '', description: data.Description || '' };
    });
};

/**
 * The game has taken the fee from the founder's Wallet/Bank and the name
 * passed Roblox's filter: the corporation opens, just like one founded in-game.
 */
export const activate = async (ticker: string, robloxId: string, overrides: any = {}): Promise<Result> => {
    const found = await loadCompany(cleanTicker(ticker));
    if(!found || found.data.State !== 'Pending' || String(found.data.OwnerId) !== robloxId) return fail('Nothing to activate.');
    const c = found.data;
    const type = TYPES_BY_ID[c.TypeId];
    const cost = c.PendingFee || type.CreationCost;
    c.State = 'Raising';
    c.SharesHeld = type.FounderShares;
    c.Treasury = cost;
    c.Holders = { [robloxId]: { shares: type.FounderShares, spent: cost } };
    c.CreatedAt = Math.floor(Date.now() / 1000);
    if(typeof overrides.logoId === 'string') c.Appearance.LogoId = overrides.logoId;
    if(typeof overrides.description === 'string') c.Description = overrides.description.slice(0, 400);
    delete c.PendingFee;
    delete c.PendingSince;
    if(await saveCompany(c.Ticker, found.row.version, c) === null) return fail('Try again.');
    await recordPrice(c.Ticker, priceOf(c));
    await log('company_created', { ticker: c.Ticker, name: c.Name, typeId: c.TypeId, ownerId: robloxId, cost, source: c.RegisteredFrom || 'WEB' });
    return { ok: true, data: { company: c } };
};

/** The name or ticker failed Roblox's filter in-game: the registration is cancelled and the founder sees why. */
export const reject = async (ticker: string, reason: string): Promise<Result> => {
    const found = await loadCompany(cleanTicker(ticker));
    if(!found || found.data.State !== 'Pending') return fail('Nothing to reject.');
    await removePending(found.data.Ticker);
    await addLedger({ robloxId: String(found.data.OwnerId), kind: 'rejected', ticker: found.data.Ticker, name: found.data.Name, source: 'GAME', note: reason });
    await log('company_rejected', { ticker: found.data.Ticker, name: found.data.Name, reason });
    return { ok: true };
};

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

/** Creates the system companies (Kaliber) if they don't exist yet. */
export const seedSystemCompanies = async () => {
    for(const def of ECONOMY_SETTINGS.systemCompanies) {
        if(await loadCompany(def.Ticker)) continue;
        await reserveTicker(def.Ticker, '0', def.Name);
        const t = Math.floor(Date.now() / 1000);
        const record = {
            Ticker: def.Ticker, Name: def.Name, TypeId: def.TypeId, OwnerId: 0, State: 'Listed',
            SharesIssued: def.SharesIssued, SharesHeld: def.SharesHeld, Treasury: def.Treasury,
            BasePrice: def.BasePrice, Scale: def.Scale, IPOPrice: def.BasePrice,
            Holders: {}, CreatedAt: t, ListedAt: t, Description: def.Description,
            Appearance: { LogoId: def.LogoId || '', ShirtId: '', PantsId: '', LiveryId: '' }, System: true,
        };
        try {
            await insertCompany(record, 'SYSTEM');
            await recordPrice(def.Ticker, priceOf(record));
            await log('system_company_seeded', { ticker: def.Ticker, name: def.Name, treasury: def.Treasury });
            console.log(`[economy] seeded ${def.Ticker} (${def.Name})`);
        } catch (err) {
            // Another start-up got there first.
        }
    }
};

let sampling = false;
let ticks = 0;

/** Once a minute: a price sample for every company (so quiet ones still draw a line), and tidy-ups. */
const sampleAll = async () => {
    if(sampling) return;
    sampling = true;
    try {
        const all = await allCompanies(false);
        for(const { data } of all) {
            if(data.State !== 'Raising') await recordPrice(data.Ticker, priceOf(data));
        }
        await refreshReferences();
        ticks += 1;
        if(ticks % 60 === 1) {
            await prunePrices();
            const cutoff = Math.floor(Date.now() / 1000) - ECONOMY_SETTINGS.pendingExpiryDays * 86400;
            for(const { data } of await allCompanies(true)) {
                if(data.State === 'Pending' && (data.PendingSince || 0) < cutoff) {
                    await removePending(data.Ticker);
                    await addLedger({ robloxId: String(data.OwnerId), kind: 'rejected', ticker: data.Ticker, name: data.Name, source: 'WEB', note: `Not paid within ${ECONOMY_SETTINGS.pendingExpiryDays} days.` });
                }
            }
        }
    } catch (err) {
        console.error('[economy] sampler', err);
    } finally {
        sampling = false;
    }
};

export const startEconomy = async () => {
    try {
        await seedSystemCompanies();
        await sampleAll();
    } catch (err) {
        console.error('[economy] start-up', err);
    }
    setInterval(sampleAll, 60 * 1000);
};
