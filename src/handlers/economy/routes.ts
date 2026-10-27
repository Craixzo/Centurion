import { getLinkedRobloxUser } from '../accountLinks';
import { ECONOMY_SETTINGS } from './settings';
import { priceOf } from './pricing';
import {
    db, loadCompany, saveCompany, insertCompany, reserveTicker, getCash, changeCash, addLedger, ledgerFor,
    log, recentLog, recordPrice, priceHistory, referencePrices, RANGE_NAMES,
} from './store';
import {
    listCompanies, companyDetail, historyFor, companyTypes, portfolio, previewTrade, trade, fileListing,
    register, cancelPending, suggestTicker, pendingFor, activate, reject,
} from './market';

/**
 * Economy routes. All sit after the API key check in api.ts.
 *
 *   /economy/game/...   called by the game servers (CenturionEconomy module).
 *                       The game keeps the same API key in a Roblox secret.
 *   /economy/web/...    called by the website for a logged-in Discord user.
 */
export const registerEconomyRoutes = (app: any) => {
    const wrap = (where: string, run: (req: any) => Promise<any>) => async (req: any, res: any) => {
        try {
            const result = await run(req);
            return res.json({ success: true, ... result });
        } catch (err) {
            console.error(`[api] ${where}`, err);
            return res.status(500).json({ success: false, msg: 'Something went wrong in Centurion.' });
        }
    };
    const id = (value: unknown) => {
        const text = String(value ?? '');
        return /^\d{1,20}$/.test(text) ? text : null;
    };
    const ticker = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);

    // ------------------------------------------------------------------
    // Game
    // ------------------------------------------------------------------

    /** Everything that changed since change number `since` (0 = everything), plus 24h reference prices. */
    app.get('/economy/game/feed', wrap('/economy/game/feed', async (req) => {
        const since = Math.max(0, Math.floor(Number(req.query.since) || 0));
        const rows = await db().econCompany.findMany({
            where: { seq: { gt: since }, NOT: { state: 'PENDING' } },
            orderBy: { seq: 'asc' },
            take: 300,
        });
        const counter = await db().econCounter.findUnique({ where: { id: 'seq' } });
        const last = rows.length ? rows[rows.length - 1].seq : since;
        return {
            seq: rows.length === 300 ? last : Math.max(last, counter?.value || 0),
            more: rows.length === 300,
            companies: rows.map((r: any) => ({ ticker: r.ticker, version: r.version, data: JSON.parse(r.data) })),
            refs: referencePrices,
        };
    }));

    app.get('/economy/game/company', wrap('/economy/game/company', async (req) => {
        const found = await loadCompany(ticker(req.query.ticker));
        if(!found || found.data.State === 'Pending') return { company: null };
        return { company: { version: found.row.version, data: found.data } };
    }));

    /**
     * Saves a record the game changed, if nobody changed it since the game read it.
     * On a clash, sends back the current record so the game can redo its change on it.
     */
    app.post('/economy/game/commit', wrap('/economy/game/commit', async (req) => {
        const t = ticker(req.body?.ticker);
        const version = Math.floor(Number(req.body?.version) || 0);
        const data = req.body?.data;
        if(!t || !data || typeof data !== 'object' || data.Ticker !== t) return { ok: false, msg: 'Bad commit.' };

        const found = await loadCompany(t);
        if(!found || found.data.State === 'Pending') return { ok: false, missing: true };
        const before = priceOf(found.data);

        const saved = await saveCompany(t, version, data);
        if(saved === null) {
            const current = await loadCompany(t);
            return { ok: false, conflict: true, version: current?.row.version, data: current?.data };
        }
        const after = priceOf(data);
        if(after !== before) await recordPrice(t, after);
        return { ok: true, version: saved };
    }));

    app.post('/economy/game/reserve', wrap('/economy/game/reserve', async (req) => {
        const t = ticker(req.body?.ticker);
        if(t.length < 2) return { ok: false, msg: 'Bad ticker.' };
        const ok = await reserveTicker(t, id(req.body?.ownerId) || '0', String(req.body?.name || ''));
        return ok ? { ok: true } : { ok: false, msg: 'That ticker is already taken.' };
    }));

    app.get('/economy/game/tickers', wrap('/economy/game/tickers', async () => {
        const rows = await db().econTicker.findMany();
        const tickers: Record<string, any> = {};
        for(const r of rows) tickers[r.ticker] = { owner: Number(r.ownerId), name: r.name, at: Math.floor(new Date(r.createdAt).getTime() / 1000) };
        return { tickers };
    }));

    /** A company founded in-game (or a system company seeded by the game). */
    app.post('/economy/game/create', wrap('/economy/game/create', async (req) => {
        const data = req.body?.data;
        const t = ticker(data?.Ticker);
        if(!t || !data) return { ok: false, msg: 'Bad company.' };
        if(await loadCompany(t)) return { ok: false, exists: true };
        await insertCompany(data, data.System ? 'SYSTEM' : 'GAME');
        await recordPrice(t, priceOf(data));
        return { ok: true, version: 1 };
    }));

    app.post('/economy/game/log', wrap('/economy/game/log', async (req) => {
        await log(String(req.body?.kind || 'event'), req.body?.entry || {});
        return { ok: true };
    }));

    app.get('/economy/game/log', wrap('/economy/game/log', async () => ({ log: await recentLog(300) })));

    app.get('/economy/game/history', wrap('/economy/game/history', async (req) => {
        const range = String(req.query.range || '1D');
        return await priceHistory(ticker(req.query.ticker), RANGE_NAMES.includes(range) ? range : '1D');
    }));

    /** A player's History list (trades in-game, on the website and on Discord, deposits and withdrawals). */
    app.get('/economy/game/ledger', wrap('/economy/game/ledger', async (req) => {
        const robloxId = id(req.query.robloxId);
        if(!robloxId) return { entries: [] };
        return { entries: await ledgerFor(robloxId, 100) };
    }));

    app.post('/economy/game/ledger', wrap('/economy/game/ledger', async (req) => {
        const robloxId = id(req.body?.robloxId);
        const e = req.body?.entry || {};
        if(!robloxId) return { ok: false };
        const kind = [ 'buy', 'sell', 'founded' ].includes(e.kind) ? e.kind : 'other';
        await addLedger({ robloxId, kind, ticker: ticker(e.ticker), name: String(e.name || ''), shares: Number(e.shares) || 0, total: Number(e.total) || 0, source: 'GAME' });
        return { ok: true };
    }));

    // Brokerage accounts. The game takes the Y$ from the Wallet/Bank before calling deposit,
    // and pays it into the Wallet only after withdraw succeeds.
    app.get('/economy/game/account', wrap('/economy/game/account', async (req) => {
        const robloxId = id(req.query.robloxId);
        return { cash: robloxId ? await getCash(robloxId) : 0 };
    }));

    const amountFrom = (value: unknown) => {
        const n = Math.floor(Number(value) || 0);
        return n >= 1 && n <= ECONOMY_SETTINGS.maxTransfer ? n : 0;
    };

    app.post('/economy/game/deposit', wrap('/economy/game/deposit', async (req) => {
        const robloxId = id(req.body?.robloxId);
        const amount = amountFrom(req.body?.amount);
        if(!robloxId || !amount) return { ok: false, msg: 'Bad amount.' };
        const refund = req.body?.refund === true;
        const cash = await changeCash(robloxId, amount);
        if(!refund) await addLedger({ robloxId, kind: 'deposit', ticker: '', name: 'Brokerage account', total: amount, source: 'GAME' });
        await log(refund ? 'brokerage_refund' : 'brokerage_deposit', { userId: robloxId, userName: String(req.body?.userName || ''), amount });
        return { ok: true, cash };
    }));

    app.post('/economy/game/withdraw', wrap('/economy/game/withdraw', async (req) => {
        const robloxId = id(req.body?.robloxId);
        const amount = amountFrom(req.body?.amount);
        if(!robloxId || !amount) return { ok: false, msg: 'Bad amount.' };
        const cash = await changeCash(robloxId, -amount);
        if(cash === null) return { ok: false, msg: `Your brokerage account has Y$${(await getCash(robloxId)).toLocaleString('en-US')}.` };
        await addLedger({ robloxId, kind: 'withdraw', ticker: '', name: 'Brokerage account', total: amount, source: 'GAME' });
        await log('brokerage_withdraw', { userId: robloxId, userName: String(req.body?.userName || ''), amount });
        return { ok: true, cash };
    }));

    // Corporations registered on Discord or the website, paid for when the founder joins.
    app.get('/economy/game/pending', wrap('/economy/game/pending', async (req) => {
        const robloxId = id(req.query.robloxId);
        return { pending: robloxId ? await pendingFor(robloxId) : [] };
    }));

    app.post('/economy/game/activate', wrap('/economy/game/activate', async (req) => {
        const robloxId = id(req.body?.robloxId);
        if(!robloxId) return { ok: false, msg: 'Bad request.' };
        const result = await activate(String(req.body?.ticker || ''), robloxId, { logoId: req.body?.logoId });
        return result.ok ? { ok: true, version: 2, data: result.data.company } : { ok: false, msg: result.msg };
    }));

    app.post('/economy/game/reject', wrap('/economy/game/reject', async (req) => {
        const result = await reject(String(req.body?.ticker || ''), String(req.body?.reason || 'The name isn\'t allowed.').slice(0, 200));
        return { ok: result.ok };
    }));

    // ------------------------------------------------------------------
    // Website
    // ------------------------------------------------------------------

    const linked = async (discordId: string) => {
        const user = await getLinkedRobloxUser(discordId);
        return user ? { robloxId: String(user.id), name: String(user.name) } : null;
    };
    const NOT_LINKED = 'Your Discord isn\'t linked to a Roblox account yet. Verify in the Yellonia Discord server first, then try again.';

    const WEB: Record<string, (body: any) => Promise<any>> = {
        'market': async () => ({ companies: await listCompanies(null), types: companyTypes() }),
        'company': async (b) => {
            const viewer = b.discordId ? await linked(String(b.discordId)) : null;
            const result = await companyDetail(String(b.ticker || ''), String(b.range || '1D'), viewer?.robloxId || null);
            return result.ok ? result.data : { success: false, msg: result.msg };
        },
        'history': async (b) => (await historyFor(String(b.ticker || ''), String(b.range || '1D'))) || { success: false, msg: 'That corporation doesn\'t exist.' },
        'types': async () => companyTypes(),
        'suggest': async (b) => ({ ticker: await suggestTicker(String(b.name || '')) }),
        'me': async (b) => {
            const user = await linked(String(b.discordId));
            if(!user) return { linked: null };
            return { linked: user, ... await portfolio(user.robloxId) };
        },
        'preview': async (b) => {
            const user = await linked(String(b.discordId));
            if(!user) return { success: false, msg: NOT_LINKED };
            const r = await previewTrade(user.robloxId, b.ticker, b.amount, b.buying === true);
            return r.ok ? r.data : { success: false, msg: r.msg };
        },
        'trade': async (b) => {
            const user = await linked(String(b.discordId));
            if(!user) return { success: false, msg: NOT_LINKED };
            const r = await trade(user.robloxId, user.name, b.ticker, b.amount, b.buying === true, 'WEB');
            return r.ok ? { msg: r.msg, ... r.data } : { success: false, msg: r.msg };
        },
        'list': async (b) => {
            const user = await linked(String(b.discordId));
            if(!user) return { success: false, msg: NOT_LINKED };
            const r = await fileListing(user.robloxId, b.ticker);
            return r.ok ? { msg: r.msg, ... r.data } : { success: false, msg: r.msg };
        },
        'register': async (b) => {
            const user = await linked(String(b.discordId));
            if(!user) return { success: false, msg: NOT_LINKED };
            const r = await register(user.robloxId, user.name, b, 'WEB', String(b.discordId));
            return r.ok ? { msg: r.msg, ... r.data } : { success: false, msg: r.msg };
        },
        'cancel': async (b) => {
            const user = await linked(String(b.discordId));
            if(!user) return { success: false, msg: NOT_LINKED };
            const r = await cancelPending(user.robloxId, b.ticker);
            return r.ok ? { msg: r.msg } : { success: false, msg: r.msg };
        },
    };
    const NEEDS_DISCORD = new Set([ 'me', 'preview', 'trade', 'list', 'register', 'cancel' ]);

    app.post('/economy/web/:action', async (req: any, res: any) => {
        try {
            const action = String(req.params.action);
            const run = WEB[action];
            if(!run) return res.status(404).json({ success: false, msg: 'Unknown action.' });
            const body = req.body || {};
            if(NEEDS_DISCORD.has(action) && !/^\d{15,22}$/.test(String(body.discordId || ''))) return res.status(400).json({ success: false, msg: 'Missing Discord ID.' });
            const result = await run(body);
            return res.json({ success: true, ... result });
        } catch (err) {
            console.error('[api] /economy/web', err);
            return res.status(500).json({ success: false, msg: 'Something went wrong in Centurion. Please try again.' });
        }
    });
};
