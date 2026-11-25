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
