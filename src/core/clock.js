// Story time, shared by 🧭 scene and by every app that keeps its own day count (todo, wallet, map): they all call
// tick() with the same `time:` and `date:` lines, so "today" is the same day everywhere.
//
// The day count and the date follow the third generation's engine (v3 core/time.js, calendar.js):
//   · a clock keeps `cal`: n = days gone by (day 1 = n 0); on day `an` the date was day-of-year `doy`, weekday `wd`,
//     year `y` (only once the story named one). A 365-day year; the weekday is kept apart, so the story's own wins.
//   · «a few days later» never makes up a date: the stretch stays open (fz) until the text names one, then gets its
//     real length; a date far behind the count is a memory or a slip, the count wins; a date may jump far ahead only
//     when the same reply said a long time passed.
// From the fourth: hours roll over into days, «night → morning» is the next day, and time of day is kept.
export const TOD = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'midnight'];
const ALSO = { dusk: 'evening', sunset: 'evening', twilight: 'evening', sunrise: 'dawn', daybreak: 'dawn', midday: 'noon', 'late night': 'night' };
const DAY = 86400000;
const mod = (a, n) => ((a % n) + n) % n;

// ── calendar arithmetic ──
const ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const doyOf = (m, d) => ML.slice(0, m - 1).reduce((a, b) => a + b, 0) + Math.min(d, ML[m - 1]) - 1;
const mdOf = (doy) => { let m = 0; while (doy >= ML[m]) doy -= ML[m++]; return { m: m + 1, d: doy + 1 }; };
// Date.UTC reads years 0–99 as 1900s: build the date, then set the full year
export const utc = (y, m, d) => { const x = new Date(Date.UTC(2000, m - 1, d)); x.setUTCFullYear(y, m - 1, d); return x; };
export const dimOf = (y, m) => utc(y, m + 1, 0).getUTCDate();
const wdOf = (y, m, d) => utc(y, m, d).getUTCDay();
// A year we trust: four digits. Anything else (6, 26, a broken saved start) means "not known".
export const okYear = (y) => { const n = Number(y); return Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : new Date().getUTCFullYear(); };
const fourDigits = (y) => Number.isInteger(y) && y >= 1000 && y <= 9999;
// A story that never named a year: the year nearest this one that puts that date on that weekday.
function guessYear(m, d, wd, nowY = new Date().getUTCFullYear()) {
    if (wd == null) return nowY;
    for (let k = 0; k <= 12; k++) for (const y of [nowY - k, nowY + k]) if (wdOf(y, m, Math.min(d, dimOf(y, m))) === wd) return y;
    return nowY;
}

// ── reading what the reader (English) or the person (Korean) wrote ──
const MON = [['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'], ['may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'], ['september', 'sept', 'sep'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec']];
const WD = [['sunday', '일요일'], ['monday', '월요일'], ['tuesday', '화요일'], ['wednesday', '수요일'], ['thursday', '목요일'], ['friday', '금요일'], ['saturday', '토요일']];
const PARTS = { early: ['early', 'beginning of', 'start of', '초순', '초'], mid: ['mid', 'middle of', '중순'], late: ['late', 'end of', '하순', '말'] };
const PART_DAY = { early: 5, mid: 15, late: 25 };
const UNITS = { d: ['d', 'day', 'days', '일'], w: ['w', 'wk', 'wks', 'week', 'weeks', '주', '주일'], mo: ['mo', 'mos', 'month', 'months', '달', '개월'], y: ['y', 'yr', 'yrs', 'year', 'years', '년'] };
const FUZZY_WORDS = { d: ['a few days', 'several days', 'some days', 'few days', '며칠', '몇일', '수일'], w: ['a few weeks', 'several weeks', 'few weeks', '몇 주', '몇주', '수 주'], mo: ['a few months', 'several months', 'few months', '몇 달', '몇달', '몇 개월', '수개월'], y: ['a few years', 'several years', '몇 해', '몇 년', '수년'] };
const NEXT = ['next day', 'next morning', 'tomorrow', 'following day', '다음 날', '다음날', '이튿날'];
export const FUZZY_NOM = { d: 2, w: 7, mo: 30, y: 365 };
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(/[a-z]/i.test(w) ? `(^|[^a-z])${esc(w)}(?![a-z])` : esc(w), 'i');

// "March 2", "late March, Tuesday", "1월 25일 수요일", "2026-03-02" -> { m, d, wd, y, part, rest } or null
export function readDate(v) {
    let s = ` ${String(v ?? '').replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (a, y, m, d) => (+m >= 1 && +m <= 12 ? `${MON[+m - 1][0]} ${+d}, ${y}` : a))} `;
    const o = {}, take = (re) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
    WD.forEach((ws, i) => ws.forEach((w) => { if (o.wd == null && take(wordRe(w))) o.wd = i; }));
    const months = MON.flat().map(esc).join('|');
    for (const [part, ws] of Object.entries(PARTS)) for (const w of ws) if (!o.part && /[a-z]/i.test(w) && take(new RegExp(`(^|[^a-z])${esc(w)}[\\s-]*(?=${months})`, 'i'))) o.part = part;
    MON.forEach((ws, i) => [...ws].sort((a, b) => b.length - a.length).forEach((w) => { if (o.m == null && take(wordRe(w))) o.m = i + 1; }));
    if (o.m == null) { const m = take(/(\d{1,2})\s*월/); if (m && +m[1] >= 1 && +m[1] <= 12) o.m = +m[1]; }
    if (o.m != null && !o.part) for (const [part, ws] of Object.entries(PARTS)) for (const w of ws) if (!o.part && !/[a-z]/i.test(w) && take(new RegExp(`^\\s*${esc(w)}`))) o.part = part;
    for (const re of [/(\d{3,4})\s*년/, /(?:^|[\s,])(\d{4})(?=$|[\s,.)])/]) { const m = o.y == null && take(re); if (m) o.y = +m[1]; }
    if (o.y != null && !fourDigits(o.y)) delete o.y;            // «6년» is not a year we can put on a calendar
    if (o.m != null) for (const re of [/(\d{1,2})\s*일(?!요|째)/, /(?:^|[\s,])(\d{1,2})(?:st|nd|rd|th)?(?=$|[\s,.)])/]) { const m = o.d == null && take(re); if (m && +m[1] >= 1 && +m[1] <= 31) o.d = +m[1]; }
    o.rest = s.replace(/\s+/g, ' ').trim();
    return o.m != null || o.wd != null ? o : null;
}
// A written date -> UTC ms (needs a month and a day or «early / mid / late»); `year` fills a missing year.
export function namedDate(text, year) {
    const p = readDate(text);
    if (p?.m == null || (p.d == null && !p.part)) return null;
    return utc(p.y ?? okYear(year), p.m, p.d ?? PART_DAY[p.part]).getTime();
}
// "+4d morning", "+?mo noon", "+20min", "next day" -> { days, hrs, fuzzy, tod, date }
function readTime(v) {
    let s = String(v ?? ''), days = 0, hrs = 0, fuzzy = '';
    s = s.replace(/\+\s*(\d+)\s*(min|mins|minutes?|m|h|hrs?|hours?)\b/gi, (_a, n, u) => { hrs += /^m/i.test(u) ? Math.min(+n, 6000) / 60 : Math.min(+n, 240); return ' '; });
    s = s.replace(/\+\s*(\d+)\s*([^\s\d,]*)/g, (_a, n, u) => { const unit = Object.entries(UNITS).find(([, ws]) => ws.includes(u.toLowerCase())); if (unit) days += Math.min(+n, { d: 3650, w: 520, mo: 120, y: 10 }[unit[0]]) * { d: 1, w: 7, mo: 30, y: 365 }[unit[0]]; return ' '; });
    s = s.replace(/\+\s*\?\s*([a-z가-힣]*)/gi, (_a, u) => { fuzzy = Object.entries(UNITS).find(([, ws]) => ws.includes(u.toLowerCase()))?.[0] ?? 'd'; return ' '; });
    if (!days && !fuzzy) for (const [u, ws] of Object.entries(FUZZY_WORDS)) for (const w of ws) if (!fuzzy && wordRe(w).test(s)) { fuzzy = u; s = s.replace(wordRe(w), ' '); }
    if (!days && !fuzzy && NEXT.some((w) => wordRe(w).test(s))) days = 1;
    const t = s.toLowerCase(), tod = TOD.find((x) => new RegExp(`\\b${x}\\b`).test(t)) ?? Object.entries(ALSO).find(([w]) => new RegExp(`\\b${w}\\b`).test(t))?.[1] ?? '';
    return { days: Math.min(days, 3650), hrs, fuzzy: !days ? fuzzy : '', tod, date: readDate(s) };
}

// ── the clock ──
const newCal = () => ({ n: 0, an: 0, doy: null, wd: null, y: null, fz: null });
export const newClock = () => ({ day: 1, hrs: 0, tod: '', date: '', vague: false, fz: null, cal: newCal() });
function rawAt(cal, n) {
    const off = n - cal.an, o = {};
    if (cal.doy != null) { const t = cal.doy + off; Object.assign(o, mdOf(mod(t, 365))); if (cal.y != null) o.y = cal.y + Math.floor(t / 365); }
    if (cal.wd != null) o.wd = mod(cal.wd + off, 7);
    return o;
}
const inFog = (cal, n) => !!cal.fz && n > cal.fz.from;
function anchor(cal, doy, p) {
    const cur = rawAt(cal, cal.n);
    cal.wd = p.wd ?? cur.wd ?? null; cal.an = cal.n; cal.doy = doy;
    if (p.y != null) cal.y = p.y;
}
// a vague stretch ends when the text names a date (or a weekday after «a few days»): it gets its real length
function settle(cal, p) {
    const fz = cal.fz, base = rawAt(cal, fz.from);
    if (cal.doy == null || (p.m == null && cal.wd == null)) { cal.fz = null; return null; }
    let gap;
    if (p.m != null) {
        gap = mod(doyOf(p.m, p.d ?? PART_DAY[p.part] ?? 15) - doyOf(base.m, base.d), 365);
        if (gap === 0) return 'kept';
        // «a few days» then a date months away is not a few days (a full date is a stronger sign than a month alone)
        if (gap > ((p.d != null ? { d: 45, w: 120, mo: 365 } : { d: 13, w: 70, mo: 340 })[fz.unit] ?? 365)) return 'kept';
    } else if (fz.unit === 'd' && p.wd != null) gap = FUZZY_NOM.d + mod(p.wd - (base.wd + FUZZY_NOM.d), 7);
    else return 'same';
    cal.n = fz.from + gap; cal.fz = null;
    if (p.wd != null && cal.wd == null) cal.wd = mod(p.wd - (cal.n - cal.an), 7);
    return 'calibrated';
}
// -> 'set' | 'calibrated' | 'jump' | 'same' | 'kept' (the count wins) | 'wd'
function applyDate(cal, p, force, maxJump) {
    if (cal.fz && force) cal.fz = null;
    if (cal.fz) { const r = settle(cal, p); if (r) return r; }
    const cur = rawAt(cal, cal.n);
    if (p.m == null) {                                     // a weekday alone
        if (cal.wd == null || force) { cal.wd = mod(p.wd - (cal.n - cal.an), 7); return 'wd'; }
        return cur.wd === p.wd ? 'same' : 'kept';
    }
    const exact = p.d != null, target = doyOf(p.m, exact ? p.d : PART_DAY[p.part] ?? 15);
    if (cal.doy == null || force) { anchor(cal, target, p); return 'set'; }
    const curDoy = doyOf(cur.m, cur.d);
    if (!exact && cur.m === p.m) {
        const [lo, hi] = { early: [1, 10], mid: [11, 20], late: [21, 31] }[p.part] ?? [1, 31];
        if (cur.d >= lo && cur.d <= hi) return 'same';
    }
    // a month alone ahead of the count moves as little as it can («June had come» on May 28 = June 1)
    const tgt = exact ? target : doyOf(p.m, { early: 1, mid: 11, late: 21 }[p.part] ?? 1), fwd = mod(tgt - curDoy, 365);
    if (fwd === 0) return 'same';
    if (fwd > 275 || fwd > maxJump) return 'kept';        // behind the count, or months ahead with no «months later»
    const y = cal.y != null ? cur.y + (tgt < curDoy ? 1 : 0) : null, wd = p.wd ?? (cur.wd != null ? mod(cur.wd + fwd, 7) : null);
    cal.n += fwd; cal.wd = wd; cal.y = p.y ?? y; cal.an = cal.n; cal.doy = tgt;
    return 'jump';
}

// One `time:` or `date:` line on a clock. i: the reply's index (a date may jump far only in a reply that said a long
// time passed). A `date:` starting with «!» is the person's own (✏️ 고치기, 🎲) and wins over the count.
export function tick(C, k, v, i = -1) {
    const cal = (C.cal ??= newCal());
    if (k === 'time') {
        const t = readTime(v);
        let days = t.days;
        if (t.hrs) { C.hrs = (C.hrs ?? 0) + t.hrs; while (C.hrs >= 24) { C.hrs -= 24; days += 1; } }
        // night (or late evening) followed by morning with nothing else written: the next day
        if (!days && !t.hrs && !t.fuzzy && ['evening', 'night', 'midnight'].includes(C.tod) && ['dawn', 'morning'].includes(t.tod)) days = 1;
        if (t.fuzzy) {
            const nom = FUZZY_NOM[t.fuzzy], RANK = { d: 0, w: 1, mo: 2, y: 3 };
            if (!cal.fz) cal.fz = { from: cal.n, unit: t.fuzzy, nom };
            else { cal.fz.nom += nom; if (RANK[t.fuzzy] > RANK[cal.fz.unit]) cal.fz.unit = t.fuzzy; }
            cal.n += nom;
        } else cal.n += days;
        if (days || t.fuzzy) { C.hrs = t.hrs && !days ? C.hrs : 0; C.date = ''; }
        if (t.tod) C.tod = t.tod; else if (days || t.fuzzy) C.tod = '';
        if (days >= 30 || t.fuzzy === 'mo' || t.fuzzy === 'y') C.longI = i;
        if (t.date) date(C, t.date, false, i);
    } else if (k === 'date') {
        const force = String(v).trimStart().startsWith('!'), text = String(v).replace(/^\s*!\s*/, '').slice(0, 60), p = readDate(text);
        if (p && date(C, p, force, i) !== 'kept') C.date = text;   // a bare «spring» or an older date: kept as it was
    }
    C.day = cal.n + 1; C.vague = !!cal.fz; C.fz = cal.fz ? { from: cal.fz.from + 1, unit: cal.fz.unit } : null;
}
function date(C, p, force, i) {
    const cal = C.cal, r = applyDate(cal, p, force, C.longI === i ? 275 : 120);
    if (r !== 'kept' && cal.doy != null && !cal.fz) {
        const off = cal.n - cal.an;
        if (p.y != null) cal.y = p.y - Math.floor((cal.doy + off) / 365);        // the named year counts even when the day was already right
        if (p.d != null && p.wd != null) cal.wd = mod(p.wd - off, 7);           // a full date with its weekday: the story's weekday from here on
    }
    return r;
}

// The date of story day `day` (1-based) as { y, m, d, wd }: the story's year, else `year1` (the person's year for
// day 1), else a guess that fits the weekday. null when no date was named yet, or the day is inside a vague stretch.
export function dayOn(C, day = C?.day, year1 = null) {
    const cal = C?.cal;
    if (!cal || cal.doy == null || inFog(cal, day - 1)) return null;
    const r = rawAt(cal, day - 1);
    let y = r.y;
    if (y == null) {
        const t = (n) => Math.floor((cal.doy + n - cal.an) / 365), a = rawAt(cal, cal.an);   // whole years from the anchor's
        y = fourDigits(year1) ? year1 + t(day - 1) - t(0) : guessYear(a.m, a.d, a.wd) + t(day - 1);
    }
    return { y, m: r.m, d: Math.min(r.d, dimOf(y, r.m)), wd: r.wd ?? null };
}
// A saved start date («2026-03-02») -> UTC ms, or null. A start saved with a broken year («0001-…») counts as not set.
export function startMs(start) {
    const m = String(start ?? '').match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
    if (!m || !fourDigits(+m[1])) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(t) ? null : t;
}
// Today's date as UTC ms, or null. year: the person's, for a story that never named one.
export function anchoredDate(C, year = null) { const o = dayOn(C, C?.day, year); return o ? utc(o.y, o.m, o.d).getTime() : null; }
// The date of a story day: from the story's dates, else from the calendar's start date. Shown instead of a bare day count.
export function dayDate(C, day, start = '') {
    if (!C || !Number.isFinite(day)) return null;
    const s0 = startMs(start);
    if (C.cal?.doy != null) { const o = dayOn(C, day, s0 == null ? null : new Date(s0).getUTCFullYear()); return o ? utc(o.y, o.m, o.d).getTime() : null; }
    return s0 == null ? null : s0 + (day - 1) * DAY;
}
export const dayKo = (C, day, start = '') => { const t = dayDate(C, day, start); if (t == null) return ''; const d = new Date(t); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
