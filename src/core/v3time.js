// 🕰 The third generation's time engine, brought over as it was (v3 src/core/time.js + the year rules of
// src/core/calendar.js). The scene app keeps its day count and date with it.
//   cal.n = elapsed story days (day 1 of the story = n 0). Anchor: on elapsed day `an` the date was day-of-year `doy`,
//   weekday `wd`, year `y` (only when the story named one). A 365-day year; the weekday is kept on its own, so the
//   story's own weekdays win over a real calendar's.
const ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mod = (a, n) => ((a % n) + n) % n;
const doyOf = (m, d) => ML.slice(0, m - 1).reduce((a, b) => a + b, 0) + Math.min(d, ML[m - 1]) - 1;
const mdOf = (doy) => { let m = 0; while (doy >= ML[m]) doy -= ML[m++]; return { m: m + 1, d: doy + 1 }; };
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(/[a-z]/i.test(w) ? `(^|[^a-z])${esc(w)}(?![a-z])` : esc(w), 'i');

export const newCal = () => ({ n: 0, an: 0, doy: null, wd: null, y: null, src: '', tod: '', fz: null });
// A vague skip ("a few days later") is never turned into a made-up date: cal.fz = { from, unit, nom } marks the day it
// happened; every day after it has no known date until the text names one (then the gap is fixed, see applyDate).
export const FUZZY_NOM = { d: 2, w: 7, mo: 30, y: 365 };
export const isFuzzy = (cal, day = cal.n) => !!cal.fz && day > cal.fz.from;
export function dateAt(cal, day = cal.n) {
    return isFuzzy(cal, day) ? {} : rawAt(cal, day);
}
// The date the engine counts for that day, also inside a vague skip (then it is only a guess: the nominal length)
export const dateRaw = (cal, day = cal.n) => rawAt(cal, day);
function rawAt(cal, day = cal.n) {
    const off = day - cal.an, o = {};
    if (cal.doy != null) { const t = cal.doy + off; Object.assign(o, mdOf(mod(t, 365))); if (cal.y != null) o.y = cal.y + Math.floor(t / 365); }
    if (cal.wd != null) o.wd = mod(cal.wd + off, 7);
    return o;
}

// "March 2", "late March, Tuesday", "1월 25일 수요일" -> { m, d, wd, y, part, rest }
export function parseDate(v, V) {
    let s = ` ${String(v || '')} `; const o = {};
    const take = (re) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
    V.weekdays.forEach((ws, i) => ws.forEach((w) => { if (o.wd == null && take(wordRe(w))) o.wd = i; }));
    for (const [part, ws] of Object.entries(V.parts)) for (const w of ws) {
      if (o.part) break;
      const months = V.months.flat().map(esc).join('|');
      const re = /[a-z]/i.test(w) ? new RegExp(`(^|[^a-z])${esc(w)}[\\s-]*(?=${months})`, 'i') : null;
      if (re && take(re)) o.part = part;
    }
    V.months.forEach((ws, i) => [...ws].sort((a, b) => b.length - a.length).forEach((w) => { if (o.m == null && take(wordRe(w))) o.m = i + 1; }));
    for (const p of V.monthNum) { const m = o.m == null && take(new RegExp(p)); if (m && +m[1] >= 1 && +m[1] <= 12) o.m = +m[1]; }
    if (o.m != null && !o.part) for (const [part, ws] of Object.entries(V.parts)) for (const w of ws) if (!/[a-z]/i.test(w) && !o.part && take(new RegExp(`^\\s*${esc(w)}`))) o.part = part;
    for (const p of V.yearNum) { const m = o.y == null && take(new RegExp(p)); if (m) o.y = +m[1]; }
    if (o.m != null) for (const p of V.dayNum) { const m = o.d == null && take(new RegExp(p)); if (m && +m[1] >= 1 && +m[1] <= 31) o.d = +m[1]; }
    o.rest = s.replace(/\s*[,·]\s*(?=[,·(]|$)/g, ' ').replace(/^[\s,·]+|[\s,·]+$/g, '').replace(/\s+/g, ' ');
    return (o.m != null || o.wd != null) ? o : null;
}

// "+4d morning", "+5mo late March, Tuesday afternoon", "night" -> { days, tod, date }
export function parseTime(v, V) {
    let s = String(v || ''), days = 0;
    s = s.replace(/\+\s*(\d+)\s*([^\s\d,]*)/g, (all, n, u) => {
      const unit = Object.entries(V.units).find(([, ws]) => ws.includes(u.toLowerCase()));
      if (unit) days += +n * { d: 1, w: 7, mo: 30, y: 365 }[unit[0]];
      return ' ';
    });
    let fuzzy = '';
    s = s.replace(/\+\s*\?\s*([a-z가-힣]*)/gi, (all, u) => {
      const unit = Object.entries(V.units).find(([, ws]) => ws.includes(u.toLowerCase()));
      fuzzy = unit ? unit[0] : 'd'; return ' ';
    });
    if (!days && !fuzzy) for (const [u, ws] of Object.entries(V.fuzzy || {})) for (const w of ws) if (!fuzzy && wordRe(w).test(s)) { fuzzy = u; s = s.replace(wordRe(w), ' '); }
    if (!days && !fuzzy) for (const w of V.next) if (wordRe(w).test(s)) { days = 1; break; }
    const date = parseDate(s, V);
    return { days: Math.min(days, 400), tod: (date ? date.rest : s.trim()).slice(0, 40), date, ...(fuzzy && !days ? { fuzzy } : {}) };
}

function anchor(cal, doy, wd, y, src) {
    const cur = rawAt(cal);
    cal.wd = wd ?? cur.wd ?? null; cal.y = y ?? cal.y; cal.an = cal.n; cal.doy = doy; if (src) cal.src = src;
}
// Returns 'set' | 'calibrated' | 'jump' | 'same' | 'kept' (engine wins) | 'wd'
// A vague skip ends when the text names a date (or a weekday after "a few days"): the skip gets its real length,
// so the dates before it stay as they were.
function settle(cal, p) {
    const fz = cal.fz, base = rawAt(cal, fz.from);
    if (cal.doy == null || (p.m == null && cal.wd == null)) { cal.fz = null; return null; }   // nothing to measure against: the plain rules decide
    let gap = null;
    if (p.m != null) {
      const d = p.d ?? ({ early: 5, mid: 15, late: 25 }[p.part] ?? 15);
      gap = mod(doyOf(p.m, d) - doyOf(base.m, base.d), 365);
      if (gap === 0) return 'kept';
      // "a few days" then a date months away is not a few days: the date is behind (a memory, a slip), the engine wins
      // …but a full date (day named) is a much stronger sign than a month alone: allow a longer skip before calling it a slip
      if (gap > ((p.d != null ? { d: 45, w: 120, mo: 365 } : { d: 13, w: 70, mo: 340 })[fz.unit] ?? 365)) return 'kept';
    } else if (fz.unit === 'd' && p.wd != null) {
      gap = FUZZY_NOM.d + mod(p.wd - (base.wd + FUZZY_NOM.d), 7);
    } else return 'same';                                   // "a few weeks" + a weekday alone: still unknown
    cal.n = fz.from + gap; cal.fz = null;
    if (p.wd != null && cal.wd == null) cal.wd = mod(p.wd - (cal.n - cal.an), 7);
    if (p.m != null && p.d != null && cal.src === 'pick') cal.src = 'text';
    return 'calibrated';
}
export function applyDate(cal, p, force, maxJump = 275) {
    if (cal.fz && force) cal.fz = null;
    if (cal.fz) { const r = settle(cal, p); if (r) return r; }
    const cur = rawAt(cal);
    if (p.m == null) {                                       // weekday only
      if (p.wd == null) return 'same';
      if (cal.wd == null || force) { cal.wd = mod(p.wd - (cal.n - cal.an), 7); return 'wd'; }
      return cur.wd === p.wd ? 'same' : 'kept';
    }
    const exact = p.d != null;
    const d = exact ? p.d : ({ early: 5, mid: 15, late: 25 }[p.part] ?? 15);
    const target = doyOf(p.m, d);
    if (cal.doy == null || force) { anchor(cal, target, p.wd, p.y, exact || force ? 'text' : 'pick'); return 'set'; }
    const curDoy = doyOf(cur.m, cur.d);
    if (!exact && cur.m === p.m) {
      const [lo, hi] = { early: [1, 10], mid: [11, 20], late: [21, 31] }[p.part] || [1, 31];
      if (cur.d >= lo && cur.d <= hi) { if (p.wd != null && cal.wd == null) anchor(cal, curDoy, p.wd); return 'same'; }
    }
    if (exact && cal.src === 'pick') { anchor(cal, target, p.wd, p.y, 'text'); return 'calibrated'; }  // first real date fixes the calendar
    // A month (or "early/mid/late month") without a day, ahead of the engine: move as little as the text allows.
    // "June had arrived" on May 28 means June 1, not mid-June.
    const tgt = exact ? target : doyOf(p.m, { early: 1, mid: 11, late: 21 }[p.part] ?? 1);
    const fwd = mod(tgt - curDoy, 365);
    if (fwd === 0) { if (p.wd != null && cal.wd == null) anchor(cal, curDoy, p.wd); return 'same'; }
    if (fwd > 275) return 'kept';                            // text is behind the engine: the engine wins
    if (!force && fwd > maxJump) return 'kept';              // months ahead with no "months later" in the reply: a mention or a misread, not a jump
    const y = cal.y != null ? cur.y + (tgt < curDoy ? 1 : 0) : null;
    const wd = p.wd ?? (cur.wd != null ? mod(cur.wd + fwd, 7) : null);
    cal.n += fwd; cal.wd = wd; cal.y = p.y ?? y; cal.an = cal.n; cal.doy = tgt; cal.src = exact ? 'text' : cal.src;
    return 'jump';
}

const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
export function fmtDate(o, L, withWd = true) {
    if (o.m == null) return withWd && o.wd != null ? L.wd[o.wd] : '';
    const md = fill(L.fmt.md, { mon: L.mon[o.m - 1], d: o.d });
    const x = withWd && o.wd != null ? fill(L.fmt.wd, { wd: L.wd[o.wd], md }) : md;
    return o.y != null ? fill(L.fmt.y, { x, y: o.y }) : x;
}
// "four days", "about ten weeks", "about three months" — whole phrases, never bare day numbers.
export function span(days, L) {
    const S = L.span, w = (n) => S.num[n - 1] || String(n), pl = (pair, n) => fill(pair[n === 1 ? 0 : 1], { n: w(n), d: n });
    if (days < 14) return S.days[days - 1] || pl(S.day, days);
    if (days < 84) return pl(S.week, Math.round(days / 7));
    if (days < 365) return pl(S.month, Math.round(days / 30));
    return days < 550 ? S.year[0] : fill(S.year[1], { n: w(Math.round(days / 365)) });
}
export const ago = (days, L) => (days <= 0 ? L.fmt.today : days === 1 ? L.fmt.yesterday : fill(L.fmt.ago, { s: span(days, L) }));
// "March 14, about ten weeks ago" — date + how long ago, as one finished phrase.
// Across a vague skip the distance is unknown: the date alone (before it) or the distance alone (after it).
export function stamp(cal, day, L) {
    const d = fmtDate(dateAt(cal, day), L, false), a = isFuzzy(cal) && !isFuzzy(cal, day) ? '' : ago(cal.n - day, L);
    return d && a ? `${d}, ${a}` : d || a;
}
// "March 13 + a few days (exact day unknown)" while a vague skip is open; the plain date otherwise.
export function nowDate(cal, L, withWd = true) {
    if (!isFuzzy(cal)) return fmtDate(dateAt(cal), L, withWd);
    const from = fmtDate(rawAt(cal, cal.fz.from), L, false), after = cal.n - cal.fz.from - cal.fz.nom;
    const x = fill(from ? L.fmt.fuzzy : L.fmt.fuzzyNoDate, { x: from, s: L.span.fuzzy[cal.fz.unit] || L.span.fuzzy.d });
    return after > 0 ? `${x} + ${span(after, L)}` : x;
}

// ── from v3 src/core/calendar.js ──
// Date.UTC reads years 0-99 as 1900-1999: build the date and set the full year after
export const utc = (y, m, d) => { const x = new Date(Date.UTC(2000, m - 1, d)); x.setUTCFullYear(y, m - 1, d); return x; };
export const wdOf = (y, m, d) => utc(y, m, d).getUTCDay();
export const dimOf = (y, m) => utc(y, m + 1, 0).getUTCDate();
// A year for a story that never said one: the year closest to `nowY` whose calendar puts that date on that weekday.
export function guessYear(m, d, wd, nowY = new Date().getUTCFullYear()) {
    if (wd == null) return nowY;
    for (let k = 0; k <= 12; k++) for (const y of [nowY - k, nowY + k]) if (wdOf(y, m, Math.min(d, dimOf(y, m))) === wd) return y;
    return nowY;
}

// The words v3 read dates with (lang/en.json + lang/ko.json «parse»), both at once: the reader writes English, the
// person may write Korean.
const EN_MON = [['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'], ['may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'], ['september', 'sept', 'sep'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec']];
const EN_WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], KO_WD = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
export const V = {
    weekdays: EN_WD.map((w, i) => [w, KO_WD[i]]),
    months: EN_MON,
    parts: { early: ['early', 'beginning of', 'start of', '초순', '초'], mid: ['mid', 'middle of', '중순'], late: ['late', 'end of', '하순', '말'] },
    monthNum: ['(\\d{1,2})\\s*월'],
    yearNum: ['(\\d{3,4})\\s*년', '(?:^|[\\s,])(\\d{4})(?=$|[\\s,.)])'],
    dayNum: ['(\\d{1,2})\\s*일(?!요|째)', '(?:^|[\\s,])(\\d{1,2})(?:st|nd|rd|th)?(?=$|[\\s,.)])'],
    units: { d: ['d', 'day', 'days', '일'], w: ['w', 'wk', 'wks', 'week', 'weeks', '주', '주일'], mo: ['mo', 'mos', 'month', 'months', '달', '개월'], y: ['y', 'yr', 'yrs', 'year', 'years', '년'] },
    fuzzy: { d: ['a few days', 'several days', 'some days', 'few days', '며칠', '몇일', '수일'], w: ['a few weeks', 'several weeks', 'few weeks', '몇 주', '몇주', '수 주'], mo: ['a few months', 'several months', 'few months', '몇 달', '몇달', '몇 개월', '수개월'], y: ['a few years', 'several years', '몇 해', '몇 년', '수년'] },
    next: ['next day', 'next morning', 'tomorrow', 'following day', '다음 날', '다음날', '이튿날'],
};

// v4: also «2026-03-04» (the person's input, older records)
export const readDate = (v) => parseDate(String(v ?? '').replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (_a, y, m, d) => (+m >= 1 && +m <= 12 ? `${EN_MON[+m - 1][0]} ${+d}, ${y}` : _a)), V);
// The date of a story day (1-based) as { y, m, d, wd } — y from the story, else `year` (the person's), else a guess
// that fits the weekday; null when the story has named no date or the day is inside a vague skip.
export function dayOn(cal, day, year = null) {
    if (!cal || cal.doy == null) return null;
    const r = dateAt(cal, day - 1);
    if (r.m == null) return null;
    let y = r.y;
    if (y == null) {
        const a = rawAt(cal, cal.an), y0 = Number.isInteger(year) ? year : guessYear(a.m, a.d, a.wd);
        y = y0 + Math.floor((cal.doy + (day - 1 - cal.an)) / 365);
    }
    return { y, m: r.m, d: Math.min(r.d, dimOf(y, r.m)), wd: r.wd ?? null };
}
