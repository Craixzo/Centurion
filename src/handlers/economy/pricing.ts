import { ECONOMY_SETTINGS } from './settings';

/**
 * Share prices. A copy of the game's StockPricing module, so a trade costs the
 * same whether it's made in-game, on the website or on Discord.
 *
 * Price rises with the number of shares players hold. Cost is the area under
 * the price line, not shares x price. Money is whole Y$: buying rounds up,
 * selling rounds down, and both go the treasury's way.
 */

export const priceAt = (sharesHeld: number, basePrice: number, scale: number) => basePrice * (1 + sharesHeld / scale);

const area = (s: number, n: number, basePrice: number, scale: number) => basePrice * (n + (n * s + n * n / 2) / scale);

export const costToBuy = (sharesHeld: number, n: number, basePrice: number, scale: number, feePercent: number) => {
    const raw = area(sharesHeld, n, basePrice, scale);
    const fee = raw * (feePercent / 100);
    return { total: Math.ceil(raw + fee), fee: Math.ceil(fee) };
};

export const proceedsToSell = (sharesHeld: number, n: number, basePrice: number, scale: number, feePercent: number) => {
    const start = Math.max(sharesHeld - n, 0);
    const raw = area(start, Math.min(n, sharesHeld), basePrice, scale);
    const fee = raw * (feePercent / 100);
    return { total: Math.max(Math.floor(raw - fee), 0), fee: Math.floor(fee) };
};

/** The company's share price right now: fixed IPO price while raising, the curve after. */
export const priceOf = (c: any): number => {
    if(c.State === 'Raising') return Number(c.IPOPrice) || 0;
    return priceAt(Number(c.SharesHeld) || 0, Number(c.BasePrice) || 0, Number(c.Scale) || 1);
};

/** Same as quote() in the game's CompanyService. */
export const quote = (c: any, amount: number, buying: boolean) => {
    if(c.State === 'Raising') {
        const raw = (Number(c.IPOPrice) || 0) * amount;
        return { total: buying ? Math.ceil(raw) : Math.floor(raw), fee: 0 };
    }
    const fee = ECONOMY_SETTINGS.trading.FeePercent;
    return buying
        ? costToBuy(c.SharesHeld, amount, c.BasePrice, c.Scale, fee)
        : proceedsToSell(c.SharesHeld, amount, c.BasePrice, c.Scale, fee);
};

/** Most shares a budget buys right now, capped at the largest trade allowed. */
export const maxAffordable = (c: any, budget: number) => {
    const cap = Math.min(ECONOMY_SETTINGS.trading.MaxTradeSize, (c.SharesIssued || 0) - (c.SharesHeld || 0));
    let lo = 0, hi = Math.max(cap, 0);
    while(lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if(quote(c, mid, true).total <= budget) lo = mid; else hi = mid - 1;
    }
    return lo;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
