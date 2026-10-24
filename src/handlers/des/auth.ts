import crypto from 'crypto';
import { provider } from '../../database';
import { DES_SETTINGS, DES_ROLES } from './settings';

/**
 * DES logins: Username (Roblox username) + Badge ID + password.
 *
 * Passwords are stored only as scrypt hashes, never in a readable form.
 * A member sets (or resets) their password after the website confirms their
 * Discord login matches their DES record, so nothing ever has to be handed out.
 *
 * Every login gives the website the member's id and tokenVersion. The website
 * puts those in a signed cookie and checks them here on every request, so
 * raising tokenVersion (password change, removal) logs out every session.
 */

const db = () => (provider as any).db;

export type Result<T = any> = { ok: true; data?: T; msg?: string } | { ok: false; msg: string };
const fail = (msg: string): Result => ({ ok: false, msg });

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------- password hashing

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const scrypt = (password: string, salt: Buffer, N: number, r: number, p: number, keylen: number) =>
    new Promise<Buffer>((resolve, reject) =>
        crypto.scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));

export const hashPassword = async (password: string) => {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
    return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export const checkPassword = async (password: string, stored: string) => {
    const parts = String(stored || '').split('$');
    if(parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [ , N, r, p, salt, hash ] = parts;
    const expected = Buffer.from(hash, 'base64');
    const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(N), Number(r), Number(p), expected.length);
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Used when no account matches, so a wrong username takes as long as a wrong password. */
let dummyHash: string | null = null;
const getDummyHash = async () => dummyHash || (dummyHash = await hashPassword(crypto.randomBytes(16).toString('hex')));

// ---------------------------------------------------------------- shared

export const parseRoles = (raw: unknown): string[] => {
    try {
        const list = JSON.parse(String(raw || '[]'));
        return Array.isArray(list) ? list.filter((r) => typeof r === 'string' && DES_ROLES[r]) : [];
    } catch (err) { return []; }
}

/** What the website is allowed to know about a member. */
export const publicMember = (m: any) => ({
    id: m.id,
    username: m.robloxUsername,
    badgeId: m.badgeId,
    department: m.department,
    departmentName: DES_SETTINGS.departments[m.department]?.name || m.department,
    departmentShort: DES_SETTINGS.departments[m.department]?.short || m.department,
    rank: m.rank,
    unit: m.unit,
    roles: parseRoles(m.roles),
    tokenVersion: m.tokenVersion,
    lastLoginAt: m.lastLoginAt,
});

export const audit = async (actorId: string | null, action: string, target?: string | null, detail?: string | null) => {
    try {
        await db().desAudit.create({ data: { actorId, action, target: target || null, detail: detail ? String(detail).slice(0, 500) : null } });
    } catch (err) {
        console.error('[des] could not write audit entry', err);
    }
}

// ---------------------------------------------------------------- too many attempts from one address

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_ADDRESS = 20;
const attempts = new Map<string, number[]>();

const tooManyFrom = (ip: string) => {
    const now = Date.now();
    const recent = (attempts.get(ip) || []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
    recent.push(now);
    attempts.set(ip, recent);
    if(attempts.size > 5000) attempts.clear();   // never grows without limit
    return recent.length > MAX_ATTEMPTS_PER_ADDRESS;
}

// ---------------------------------------------------------------- login

const WRONG = 'Those details don\'t match an active account.';

export const login = async (input: any): Promise<Result> => {
    const username = clean(input.username, 40);
    const badgeId = clean(input.badgeId, 20);
    const password = String(input.password ?? '');
    const ip = clean(input.ip, 64) || 'unknown';

    if(tooManyFrom(ip)) return fail('Too many login attempts. Please wait a few minutes and try again.');
    if(!username || !badgeId || !password || password.length > 200) return fail(WRONG);

    const member = await db().desMember.findUnique({ where: { badgeId } });
    const matches = member && member.robloxUsername.toLowerCase() === username.toLowerCase();

    if(!matches || !member.passwordHash) {
        await checkPassword(password, await getDummyHash());   // same time either way
        if(matches && !member.passwordHash && member.status === 'ACTIVE') return fail('This account has no password yet. Use "First time? Set up your account" below.');
        return fail(WRONG);
    }

    if(member.lockedUntil && new Date(member.lockedUntil).getTime() > Date.now()) {
        return fail(`This account is locked after too many wrong passwords. Try again after ${new Date(member.lockedUntil).toISOString().slice(11, 16)} UTC, or reset your password.`);
    }

    const good = await checkPassword(password, member.passwordHash);
    if(!good) {
        const failed = member.failedLogins + 1;
        const lock = failed >= DES_SETTINGS.maxFailedLogins;
        await db().desMember.update({ where: { id: member.id }, data: {
            failedLogins: lock ? 0 : failed,
            lockedUntil: lock ? new Date(Date.now() + DES_SETTINGS.lockMinutes * 60000) : member.lockedUntil,
        } });
        await audit(member.id, lock ? 'Account locked' : 'Login failed', member.badgeId, `from ${ip}`);
        return fail(WRONG);
    }

    if(member.status !== 'ACTIVE') {
        await audit(member.id, 'Login refused', member.badgeId, `status ${member.status}`);
        return fail(WRONG);
    }

    const updated = await db().desMember.update({ where: { id: member.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await audit(member.id, 'Logged in', member.badgeId, `from ${ip}`);
    return { ok: true, data: { member: publicMember(updated) } };
}

/** Checks a session the website holds. Fails if the member left, was suspended, or changed password since. */
export const me = async (input: any): Promise<Result> => {
    const member = await db().desMember.findUnique({ where: { id: clean(input.memberId, 64) } });
    if(!member || member.status !== 'ACTIVE' || member.tokenVersion !== Number(input.tokenVersion)) return fail('Your session has ended. Please log in again.');
    return { ok: true, data: { member: publicMember(member) } };
}

// ---------------------------------------------------------------- set or reset a password (after the Discord check)

export const setupStatus = async (discordId: string): Promise<Result> => {
    const member = await db().desMember.findUnique({ where: { discordId } });
    if(!member || member.status !== 'ACTIVE') return { ok: true, data: { eligible: false } };
    return { ok: true, data: { eligible: true, username: member.robloxUsername, badgeId: member.badgeId, hasPassword: !!member.passwordHash, departmentName: DES_SETTINGS.departments[member.department]?.name || member.department } };
}

export const setPassword = async (discordId: string, input: any): Promise<Result> => {
    const member = await db().desMember.findUnique({ where: { discordId } });
    if(!member || member.status !== 'ACTIVE') return fail('Your Discord account isn\'t linked to an active DES member. Ask your department\'s admin to add you.');

    const password = String(input.password ?? '');
    const problem = passwordProblem(password, member);
    if(problem) return fail(problem);

    const hadPassword = !!member.passwordHash;
    await db().desMember.update({ where: { id: member.id }, data: {
        passwordHash: await hashPassword(password),
        passwordSetAt: new Date(),
        tokenVersion: member.tokenVersion + 1,   // logs out any other sessions
        failedLogins: 0,
        lockedUntil: null,
    } });
    await audit(member.id, hadPassword ? 'Password reset' : 'Password set', member.badgeId, 'verified with Discord');
    return { ok: true, msg: hadPassword ? 'Your password has been changed. You can log in now.' : 'Your password is set. You can log in now.', data: { username: member.robloxUsername, badgeId: member.badgeId } };
}

export const passwordProblem = (password: string, member: any): string | null => {
    if(password.length < DES_SETTINGS.minPasswordLength) return `Use at least ${DES_SETTINGS.minPasswordLength} characters.`;
    if(password.length > 128) return 'Use 128 characters or fewer.';
    const lower = password.toLowerCase();
    if(lower.includes(String(member.robloxUsername).toLowerCase()) || lower.includes(String(member.badgeId).toLowerCase())) return 'Your password can\'t contain your username or Badge ID.';
    if(/^(.)\1+$/.test(password)) return 'Pick a password that isn\'t one character repeated.';
    return null;
}
