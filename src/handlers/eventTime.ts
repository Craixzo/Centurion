/**
 * Parsing event start times.
 *
 * Accepts, in order:
 *   <t:1735689600:F>     a Discord timestamp pasted straight in
 *   1735689600           raw unix seconds
 *   in 2h / 2h / 90m     relative to now
 *   2026-09-12 20:00     absolute, in config.timezone
 *   2026-09-12 8pm       same, 12-hour
 *   20:00 / 8pm          today in config.timezone, or tomorrow if already past
 *
 * Everything is stored as a real Date, so the announcement can render a
 * Discord timestamp that is correct in every viewer's own timezone.
 */

import ms from 'ms';
import { config } from '../config';

const zone = (): string => config.timezone || 'UTC';

/** Offset in ms between UTC and the named IANA zone at a given instant. */
const offsetAt = (date: Date, timeZone: string): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).reduce((acc: any, part) => {
        if(part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});

    const asUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
    );
    return asUtc - date.getTime();
}

/** Wall-clock time in a zone -> the real instant it refers to. */
const fromZone = (y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date => {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    // Two passes so a DST boundary resolves correctly.
    const first = guess - offsetAt(new Date(guess), timeZone);
    return new Date(guess - offsetAt(new Date(first), timeZone));
}

const parseClock = (text: string): { hour: number; minute: number } | null => {
    const ampm = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if(ampm) {
        const raw = Number(ampm[1]);
        if(raw < 1 || raw > 12) return null;   // "13pm" is not a time
        let hour = raw % 12;
        if(ampm[3].toLowerCase() === 'pm') hour += 12;
        const minute = Number(ampm[2] || 0);
        if(minute > 59) return null;
        return { hour, minute };
    }
    const h24 = text.match(/^(\d{1,2}):(\d{2})$/);
    if(h24) {
        const hour = Number(h24[1]);
        const minute = Number(h24[2]);
        if(hour > 23 || minute > 59) return null;
        return { hour, minute };
    }
    return null;
}

export const parseEventTime = (input: string, now = new Date()): Date | null => {
    if(!input) return null;
    const text = input.trim();

    const discord = text.match(/^<t:(\d+)(?::[a-zA-Z])?>$/);
    if(discord) return new Date(Number(discord[1]) * 1000);

    if(/^\d{10}$/.test(text)) return new Date(Number(text) * 1000);
    if(/^\d{13}$/.test(text)) return new Date(Number(text));

    const relative = text.replace(/^in\s+/i, '');
    if(/^\d+(\.\d+)?\s*(s|m|h|d|min|mins|hour|hours|day|days)$/i.test(relative)) {
        const delta = Number(ms(relative as any));
        if(delta && delta > 0) return new Date(now.getTime() + delta);
    }

    const tz = zone();

    const dated = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T]+(.+)$/);
    if(dated) {
        const clock = parseClock(dated[4].trim());
        if(!clock) return null;
        return fromZone(Number(dated[1]), Number(dated[2]), Number(dated[3]), clock.hour, clock.minute, tz);
    }

    const clock = parseClock(text);
    if(clock) {
        // Today in the configured zone, rolling to tomorrow if already past.
        const local = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(now).split('-').map(Number);

        let result = fromZone(local[0], local[1], local[2], clock.hour, clock.minute, tz);
        if(result.getTime() <= now.getTime()) {
            result = new Date(result.getTime() + 24 * 60 * 60 * 1000);
        }
        return result;
    }

    return null;
}

/** Discord timestamp markup, rendered per-viewer. */
export const discordTime = (date: Date, style = 'F'): string => {
    return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}
