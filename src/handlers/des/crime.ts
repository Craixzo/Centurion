import { provider } from '../../database';
import { DES_SETTINGS } from './settings';
import { Result } from './auth';

/**
 * Crime reports from the public form (report.html, "Report a crime").
 *
 * A report becomes a pending police call on the CAD board, so dispatch sees
 * it straight away, marked as an online report. The person who sent it can
 * follow its status (received, officers responding, closed) on the form page.
 * They never see units, notes or anything else on the call.
 */

const db = () => (provider as any).db;
const fail = (msg: string): Result => ({ ok: false, msg });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

/** Police call types the public can choose. Only those that also exist in DES_SETTINGS.callTypes.POLICE are offered. */
const PUBLIC_TYPES = [ 'Robbery', 'Assault', 'Theft', 'Burglary', 'Shots fired', 'Disturbance', 'Suspicious person', 'Other' ];
/** Types that start as Urgent (P2) instead of Routine (P3). */
const URGENT = [ 'Shots fired', 'Robbery', 'Assault' ];

const MAX_PER_DAY = 3;
const STATUS_NAMES: Record<string, string> = { PENDING: 'Received', ACTIVE: 'Officers responding', CLOSED: 'Closed' };

export const crimeTypes = () => PUBLIC_TYPES.filter((t) => (DES_SETTINGS.callTypes.POLICE || []).includes(t));

const nextNumber = async (): Promise<string> => {
    const prefix = `C-${new Date().getFullYear()}-`;
    const latest = await db().desIncident.findMany({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, take: 1 });
    const n = latest.length ? Number(String(latest[0].number).slice(prefix.length)) + 1 : 1;
    return prefix + String(n).padStart(5, '0');
};

export const submitCrime = async (discordId: string, input: any): Promise<Result> => {
    const createdBy = `public:${discordId}`;
    const today = await db().desIncident.count({ where: { createdBy, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if(today >= MAX_PER_DAY) return fail('You\'ve sent the most crime reports allowed in a day. For anything urgent, contact an officer in-game.');

    const type = clean(input.type, 60);
    if(!crimeTypes().includes(type)) return fail('Pick what kind of crime it was.');
    const location = clean(input.location, 120);
    if(location.length < 2) return fail('Say where it happened.');
    const description = cleanLong(input.description, 2000);
    if(description.length < 20) return fail('Describe what happened (at least 20 characters).');
    const suspect = clean(input.suspect, 200);
    const name = clean(input.discordName, 60) || 'Discord user';

    const number = await nextNumber();
    const i = await db().desIncident.create({ data: {
        number,
        priority: URGENT.includes(type) ? 2 : 3,
        type,
        location,
        description: description + (suspect ? `\n\nSuspect: ${suspect}` : ''),
        caller: `${name} (online report)`,
        createdBy,
        status: 'PENDING',
    } });
    await db().desIncidentLog.create({ data: { incidentId: i.id, kind: 'SYSTEM', text: `Reported online by ${name} (Discord ${discordId}).`, actorName: 'Website' } });
    return { ok: true, msg: `Thank you. Your report is ${number} and has gone to police dispatch. In an emergency, also tell an officer in-game.`, data: { number } };
};

export const myCrimes = async (discordId: string): Promise<Result> => {
    const rows = await db().desIncident.findMany({ where: { createdBy: `public:${discordId}` }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { ok: true, data: {
        types: crimeTypes(),
        reports: rows.map((i: any) => ({
            number: i.number,
            type: i.type,
            location: i.location,
            status: i.status,
            statusName: STATUS_NAMES[i.status] || i.status,
            createdAt: i.createdAt,
            closedAt: i.status === 'CLOSED' ? i.closedAt : null,
            outcome: i.status === 'CLOSED' ? i.disposition : null,
        })),
    } };
};
