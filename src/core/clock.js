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
    if (tod) S.tod = tod; else if (d || w || mo) S.tod = '';
    if (d || w || mo) { S.hrs = 0; S.date = ''; }          // a written date is only true for the day it was written for
}

// A date written in the story ("March 14", "3월 14일", "2024-03-14") -> UTC ms, or null. `year` fills a missing year.
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_RE = MON_EN.map((m, i) => [new RegExp(`\\b${m.slice(0, 3)}[a-z]*\\.?\\s+(\\d{1,2})\\b`, 'i'), i]);
export function namedDate(text, year) {
    const s = String(text ?? '');
    const iso = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
    for (const [re, m] of MON_RE) { const x = s.match(re); if (x) { const y = s.slice(x.index).match(/^[^,]*,\s*(\d{4})\b/); return Date.UTC(y ? +y[1] : year, m, +x[1]); } }
    const k = s.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    return k ? Date.UTC(k[1] ? +k[1] : year, +k[2] - 1, +k[3]) : null;
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
