// Story time: how a `time:` line moves the day counter. Shared by the scene app and by apps that watch `time`.
export const TOD = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'midnight'];
// words a reader writes instead of the listed ones
const ALSO = { dusk: 'evening', sunset: 'evening', twilight: 'evening', sunrise: 'dawn', daybreak: 'dawn', midday: 'noon', 'late night': 'night' };
// S needs: { day, hrs, tod, date, vague, fz }
export function applyTime(S, v) {
    const t = String(v).toLowerCase();
    const d = t.match(/\+\s*(\d+)\s*d/), w = t.match(/\+\s*(\d+)\s*w/), h = t.match(/\+\s*(\d+)\s*h/), mi = t.match(/\+\s*(\d+)\s*m(?:in)?\b/);
    const mo = t.match(/\+\s*(\d+)\s*mo/);
    if (mo) S.day += Math.min(+mo[1], 120) * 30;
    if (w) S.day += Math.min(+w[1], 520) * 7;
    if (d) S.day += Math.min(+d[1], 3650);
    if (h || mi) {
        S.hrs += (h ? Math.min(+h[1], 240) : 0) + (mi ? Math.min(+mi[1], 6000) / 60 : 0);
        while (S.hrs >= 24) { S.hrs -= 24; S.day += 1; }
    }
    const fz = t.match(/\+\s*\?\s*(d|w|mo|y)?/);
    if (fz) { S.vague = true; S.fz = { from: S.day, unit: fz[1] || 'd' }; S.day += { d: 2, w: 7, mo: 30, y: 365 }[fz[1] || 'd']; }   // "a few days later": the count is a guess until a date is named
    const tod = TOD.find((x) => new RegExp(`\\b${x}\\b`).test(t)) ?? Object.entries(ALSO).find(([w]) => new RegExp(`\\b${w}\\b`).test(t))?.[1];
    // night (or late evening) followed by morning with no time written: that is the next day
    if (tod && !d && !w && !mo && !h && !mi && !fz && ['evening', 'night', 'midnight'].includes(S.tod) && ['dawn', 'morning'].includes(tod)) { S.day += 1; S.hrs = 0; S.date = ''; }
    if (tod) S.tod = tod; else if (d || w || mo) S.tod = '';
    if (d || w || mo) { S.hrs = 0; S.date = ''; }          // a written date is only true for the day it was written for
}

// A date written in the story ("March 14", "3월 14일", "2024-03-14") -> UTC ms, or null. `year` fills a missing year.
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_RE = MON_EN.map((m, i) => [new RegExp(`\\b${m.slice(0, 3)}[a-z]*\\.?\\s+(\\d{1,2})\\b`, 'i'), i]);
// A year we trust: four digits, 1000–9999. Anything else (6, 26, NaN, a broken start date) means "this year".
// Without this, a stray small year (Date.UTC maps 0–99 to 1900s; a saved «0006-…» stays year 6) kept spreading.
export const okYear = (y) => { const n = Number(y); return Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : new Date().getUTCFullYear(); };
// A saved start date («2026-03-02») -> UTC ms, or null. A start saved with a broken year («0001-…») counts as not set.
export function startMs(start) {
    const m = String(start ?? '').match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
    if (!m || okYear(m[1]) !== +m[1]) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(t) ? null : t;
}
export function namedDate(text, yearIn) {
    const s = String(text ?? ''), year = okYear(yearIn);
    const iso = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (iso) return Date.UTC(okYear(iso[1]), +iso[2] - 1, +iso[3]);
    for (const [re, m] of MON_RE) { const x = s.match(re); if (x) { const y = s.slice(x.index).match(/^[^,]*,\s*(\d{4})\b/); return Date.UTC(y ? okYear(y[1]) : year, m, +x[1]); } }
    const k = s.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (k) return Date.UTC(k[1] ? okYear(k[1]) : year, +k[2] - 1, +k[3]);
    // only part of a month ("late November", "11월 초"), as the third generation kept it: early 5 · mid 15 · late 25
    const PART = { early: 5, mid: 15, late: 25, 초: 5, 중순: 15, 말: 25 };
    const pe = s.match(/\b(early|mid|late)[\s-]+([a-z]{3,})/i);
    if (pe) { const at = MON_EN.findIndex((x) => x.slice(0, 3).toLowerCase() === pe[2].slice(0, 3).toLowerCase()); if (at >= 0) { const y = s.match(/\b(\d{4})\b/); return Date.UTC(y ? okYear(y[1]) : year, at, PART[pe[1].toLowerCase()]); } }
    const pk = s.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(초|중순|말)/);
    return pk ? Date.UTC(pk[1] ? okYear(pk[1]) : year, +pk[2] - 1, PART[pk[3]]) : null;
}
// The last date the story named keeps counting after days pass: «November 25» on day 3, now day 5 -> November 27.
// S needs { day, date, anchor: { day, date } }. -> UTC ms, or null when no readable date was ever named.
export function anchoredDate(S, year = new Date().getUTCFullYear()) {
    if (S?.date) { const t = namedDate(S.date, year); if (t != null) return t; }
    const a = S?.anchor;
    if (!a?.date || !Number.isInteger(a.day)) return null;
    const t = namedDate(a.date, year);
    return t == null ? null : t + (S.day - a.day) * 86400000;
}

// The date of a story day, when one can be known: from the last date the story named (counted on), else from the
// calendar's start date. -> UTC ms or null. Shown instead of a bare day count.
export function dayDate(sc, day, start = '') {
    if (!sc || !Number.isFinite(day)) return null;
    const now = sc.vague ? null : anchoredDate(sc);
    if (now != null && !Number.isNaN(now)) return now + (day - sc.day) * 86400000;
    const t = startMs(start);
    return t == null ? null : t + (day - 1) * 86400000;
}
export const dayKo = (sc, day, start = '') => { const t = dayDate(sc, day, start); if (t == null) return ''; const d = new Date(t); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
