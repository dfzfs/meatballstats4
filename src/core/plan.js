// 📆 Shared bits of the schedule that other apps may read (🗺 map, 📅 calendar) without loading the schedule app.
import { dayDate } from './clock.js';

// weekday (0 = Sunday) of a story day: from its date, else counted on from day 1
export const wdOf = (S, day, start = '') => { const t = dayDate(S, day, start); return t == null ? (day % 7) : new Date(t).getUTCDay(); };
// does a saved plan fall on this story day?  x: { rep: 'daily' | 'weekly' | 'once', wd?, day?, from? }
export const onDay = (x, day, wd) => (x.rep === 'daily' ? (x.from ?? 1) <= day : x.rep === 'weekly' ? (x.from ?? 1) <= day && (x.wd ?? []).includes(wd) : x.day === day);
// the plans that run right now (same story day and time of day): -> saved items
export function nowBy(items, S, start = '') {
    if (!S?.tod || !Array.isArray(items)) return [];
    const wd = wdOf(S, S.day, start);
    return items.filter((x) => x && x.what && typeof x.who === 'string' && x.tod === S.tod && onDay(x, S.day, wd) && !x.doneOn?.[S.day]);
}
