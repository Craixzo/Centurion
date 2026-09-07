/**
 * Low-level transport for the Roblox APIs qbot uses.
 *
 * Two auth paths, deliberately separated:
 *
 *   openCloud()  - apis.roblox.com, authenticated with an Open Cloud API key
 *                  (x-api-key). This covers ranking, roles, memberships,
 *                  join requests, the shout, and the audit log.
 *
 *   legacy()     - groups.roblox.com, authenticated with .ROBLOSECURITY.
 *                  Roblox has NOT shipped Open Cloud equivalents for kicking
 *                  or group-banning, so those two operations still need a
 *                  cookie. Nothing else in the bot uses this path.
 *
 *   publicApi()  - unauthenticated endpoints (users, thumbnails).
 */

const OPEN_CLOUD_BASE = 'https://apis.roblox.com';

export class RobloxApiError extends Error {
    public status: number;
    public body: string;

    constructor(status: number, body: string, url: string) {
        super(`Roblox API ${status} for ${url}: ${body.slice(0, 400)}`);
        this.name = 'RobloxApiError';
        this.status = status;
        this.body = body;
    }
}

const parse = async (res: Response, url: string): Promise<any> => {
    const text = await res.text();
    if(!res.ok) throw new RobloxApiError(res.status, text, url);
    if(!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * Open Cloud request. `path` is relative to apis.roblox.com.
 */
export const openCloud = async (
    method: string,
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: any } = {},
): Promise<any> => {
    const apiKey = process.env.ROBLOX_API_KEY;
    if(!apiKey) throw new Error('ROBLOX_API_KEY is not set in the .env file.');

    const url = new URL(path, OPEN_CLOUD_BASE);
    if(options.query) {
        for(const [ key, value ] of Object.entries(options.query)) {
            if(value !== undefined && value !== null) url.searchParams.set(key, String(value));
        }
    }

    const res = await fetch(url, {
        method,
        headers: {
            'x-api-key': apiKey,
            ... (options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    return parse(res, url.toString());
}

/**
 * Walks a paginated Open Cloud v2 list endpoint and returns every item.
 * `key` is the array property on the response (e.g. 'groupRoles').
 */
export const openCloudList = async (
    path: string,
    key: string,
    query: Record<string, string | number | undefined> = {},
    maxPages = 20,
): Promise<any[]> => {
    const items: any[] = [];
    let pageToken: string | undefined = undefined;
    let pages = 0;

    do {
        const page = await openCloud('GET', path, { query: { ... query, pageToken } });
        items.push(... (page?.[key] || []));
        pageToken = page?.nextPageToken || undefined;
        pages += 1;
    } while(pageToken && pages < maxPages);

    return items;
}

let csrfToken: string | null = null;

/**
 * Cookie-authenticated request against groups.roblox.com.
 *
 * Only used for kick and group ban/unban. Handles the X-CSRF-TOKEN
 * handshake: Roblox answers the first state-changing request with 403 and
 * the token in a response header, so we cache it and retry once.
 */
export const legacy = async (
    method: string,
    url: string,
    body?: any,
    isRetry = false,
): Promise<any> => {
    const cookie = process.env.ROBLOX_COOKIE;
    if(!cookie) throw new Error('ROBLOX_COOKIE is not set. It is required for kick and group ban.');

    const res = await fetch(url, {
        method,
        headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`,
            ... (csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
            ... (body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if(res.status === 403 && res.headers.get('x-csrf-token') && !isRetry) {
        csrfToken = res.headers.get('x-csrf-token');
        return legacy(method, url, body, true);
    }

    return parse(res, url);
}

/**
 * Unauthenticated endpoint (users.roblox.com, thumbnails.roblox.com).
 */
export const publicApi = async (method: string, url: string, body?: any): Promise<any> => {
    const res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return parse(res, url);
}
