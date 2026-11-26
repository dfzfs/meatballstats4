// 📅 Calendar: turns the story's day count into real dates and keeps the person's own marked days.
// No classifier key and no model call: it only reads what the Scene app already recorded.
// Ported from the second generation's calendar-plus (D-day counting, a pinned D-day, yearly anniversaries, a note per
// day, an optional cycle, "someone close notices a note") and the third generation's handling of vague time skips.
import { esc, card, hint, acts, val, empty, pill } from '../ui/kit.js';
import { namedDate, anchoredDate, startMs, dayOn, dayDate, utc, dimOf, FUZZY_NOM, tick, newClock } from '../core/clock.js';
import { plain, spendPlain, stamped, spendStamped } from '../core/once.js';

const DAY = 86400000;
const WD_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const iso = (d) => d.toISOString().slice(0, 10);
// Day 1's date: the one the person set; else counted back from the last date the story named (records carried over
// from an earlier Meatball hold those dates), so the calendar is never empty when the story has a date.
// Day 1's date. The story's own last readable date wins (it carries the story's year, e.g. 1525); the start date the
// person typed is used only while the story has named no readable date.
const startFrom = (store, sc) => {
    // day 1's date from the story's dates (also while a «며칠 뒤» stretch is open: the days before it are known)
    const mine = startMs(store?.start), o = sc?.cal ? dayOn({ cal: { ...sc.cal, fz: null } }, 1, mine == null ? null : new Date(mine).getUTCFullYear()) : null;
    return o ? utc(o.y, o.m, o.d).getTime() : mine;
};
const startOf = (env) => startFrom(env.store, env.peek?.('scene'));
// The calendar date of a story day (day 1 = the start date).
export const dateOf = (start, day) => new Date(start + (day - 1) * DAY);
const dayOfIso = (start, s) => { const t = Date.parse(`${s}T00:00:00Z`); return Number.isNaN(t) ? null : Math.round((t - start) / DAY) + 1; };
const marks = (env) => (Array.isArray(env.store.marks) ? env.store.marks : []).filter((m) => m?.date && m?.label);
const fmtEN = (d, wd = d.getUTCDay()) => `${WD_EN[wd]}, ${MON_EN[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
// D-day words: D-3 · D-DAY · D+100
export const ddayLabel = (day, today) => (day === today ? 'D-DAY' : day > today ? `D-${day - today}` : `D+${today - day}`);

// A date the scene names ("March 14", "3월 14일") fixes where we are (third generation's settle); after days pass,
// the last named date keeps counting from there instead of falling back to the start date.
export { namedDate };
// Where the story is now: { date: Date|null, fuzzy: { since: Date } | null }
export function today(env) {
    const start = startOf(env), sc = env.peek('scene');
    if (start == null || !sc) return null;
    if (sc.fz) return { date: null, fuzzy: { since: dateOf(start, sc.fz.from), unit: sc.fz.unit }, day: sc.day };
    const named = anchoredDate(sc, dateOf(start, sc.day).getUTCFullYear());
    // the story's own weekday wins (v3 keeps it apart from the date), else the calendar's
    const wd = dayOn(sc)?.wd ?? null, date = named != null ? new Date(named) : dateOf(start, sc.day);
    return { date, fuzzy: null, day: sc.day, wd: wd ?? date.getUTCDay() };
}
// Marked days from today on, nearest first; a yearly one counts its next turn. [{ label, in, mark }]
function upcoming(env, now, span = 14) {
    const out = [];
    for (const m of marks(env)) {
        const t = Date.parse(`${m.date}T00:00:00Z`);
        if (Number.isNaN(t)) continue;
        let when = t;
        if (m.yearly) { const d = new Date(t), y = now.getUTCFullYear(); when = Date.UTC(y, d.getUTCMonth(), d.getUTCDate()); if (when < now.getTime()) when = Date.UTC(y + 1, d.getUTCMonth(), d.getUTCDate()); }
        const n = Math.round((when - now.getTime()) / DAY);
        if (n >= 0 && n <= span) out.push({ label: m.label, in: n, mark: m, years: m.yearly ? new Date(when).getUTCFullYear() - new Date(t).getUTCFullYear() : 0 });
    }
    return out.sort((a, b) => a.in - b.in);
}
// The optional cycle. Start days are kept as dates («2026-03-04»), so a change in how story days are counted never
// moves them; a number is a story day, kept only while the story has no date at all.
const cyDays = (cyc, start) => (cyc?.starts ?? []).map((s) => (typeof s === 'string' ? (start == null ? null : dayOfIso(start, s)) : Number.isInteger(s) ? s : null)).filter((n) => n != null);
// day n of a period (or 0) on story day `day`
export function cycleOn(cyc, day, start = null) {
    if (!cyc?.on) return 0;
    const past = cyDays(cyc, start).filter((n) => n <= day).sort((a, b) => a - b), last = past.at(-1);
    if (last == null) return 0;
    const len = cyc.len || 28, dur = cyc.dur || 5, k = (day - last) % len;
    return day - last < len * 3 && k < dur ? k + 1 : 0;   // predicted for three cycles after the last one marked
}

// what the cycle box says now, so it is clear whether anything is marked and whether today is in it
// 📜 Every AI reply on the calendar (as the third generation showed it): the story day each reply was on, counted
// with the same clock as the scene, then dated with today's knowledge. A reply inside a «며칠 뒤» stretch that is still
// open has no date yet (the «날짜 모름» tray); one inside a stretch that later got its date is shown as roughly (~).
export function replyDays(log, sc, start) {
    const C = newClock(), out = [];
    for (const e of log ?? []) {
        for (const [k, v] of [...(e.L ?? []), ...(e.fixed ?? [])]) if (k === 'time' || k === 'date') tick(C, k, v, e.i);
        const t = C.vague && sc?.vague && C.cal.fz?.from === sc.cal?.fz?.from ? null : dayDate(sc, C.day, start);
        out.push({ i: e.i, day: C.day, key: t == null ? '' : iso(new Date(t)), approx: C.vague });
    }
    return out;
}
const ranges = (ids) => { const out = []; for (const x of [...new Set(ids)].sort((a, b) => a - b)) { const r = out.at(-1); if (r && x - r[1] <= 2) r[1] = x; else out.push([x, x]); } return out.map(([a, b]) => (a === b ? `#${a}` : `#${a}~#${b}`)).join(', '); };
// for other apps (contacts): the period day today, from the calendar's saved data and the scene
export const cycleToday = (store, sc) => (sc ? cycleOn(store?.cycle, sc.day, startFrom(store, sc)) : 0);
const cyNow = (cyc, day, start) => {
    if (!cyc.starts?.length) return '<p class="mb4-hint">시작일을 표시해야 기간이 잡혀요.</p>';
    const cd = cycleOn(cyc, day, start);
    if (cd) return `<p class="mb4-hint">🩸 지금 기간 중 · ${cd}번째 날${cyc.tell ? ' · AI가 알아요' : ''}</p>`;
    const last = Math.max(...cyDays(cyc, start).filter((n) => n <= day));
    if (!Number.isFinite(last)) return '<p class="mb4-hint">표시한 시작일이 아직 오지 않았어요.</p>';
    if (day - last >= (cyc.len || 28) * 3) return '<p class="mb4-hint">마지막 시작일이 오래돼서 쉬고 있어요. 새 시작일을 표시해 주세요.</p>';
    const next = (cyc.len || 28) - ((day - last) % (cyc.len || 28));
    return `<p class="mb4-hint">지금은 기간이 아니에요 · 다음 시작까지 약 ${next}일 (그때만 AI에 알려요)</p>`;
};

// 🎲 「미정 날짜 정하기」 (v3 rollDates): no AI, a roll of the dice. Returns 'Month D, YYYY' or ''.
//   no date anywhere yet → a random day of the year (the person's year, else this year)
//   inside a vague skip («며칠 뒤» · «몇 주 뒤») → a random day of the week the calendar shows for it, after the day before
const MON_EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function rollDate(sc, year, rnd = Math.random) {
    const R = (a, b) => a + Math.floor(rnd() * (b - a + 1)), fmt = (x) => `${MON_EN_FULL[x.getUTCMonth()]} ${x.getUTCDate()}, ${x.getUTCFullYear()}`;
    const cal = sc?.cal;
    if (!cal || cal.doy == null) { const y = Number.isInteger(year) ? year : new Date().getUTCFullYear(), m = R(1, 12); return fmt(utc(y, m, R(1, dimOf(y, m)))); }
    if (!cal.fz) return '';
    const base = dayOn({ cal: { ...cal, fz: null } }, cal.fz.from + 1, year), nom = cal.fz.nom ?? FUZZY_NOM[cal.fz.unit] ?? 2;
    if (!base) return '';
    const b = utc(base.y, base.m, base.d), aim = new Date(b.getTime() + nom * DAY), sun = new Date(aim.getTime() - aim.getUTCDay() * DAY);
    const days = [0, 1, 2, 3, 4, 5, 6].map((j) => new Date(sun.getTime() + j * DAY)).filter((x) => x > b);
    return fmt(days.length ? days[R(0, days.length - 1)] : aim);
}

export default {
    api: 1,
    id: 'calendar',
    name: '달력',
    icon: '📅',
    color: '#3a8ee6',
    cost: 'zero',
    desc: '이야기 속 날짜를 달력으로 보여 주고, 내가 표시한 날이 다가오면 AI에 알려 줘요.',
    note(_S, env) {
        const T = today(env), sday = env.peek('scene')?.day;
        const st = env.store, state = [], now = [];
        // the cycle counts story days, so it works even when the story has no calendar date yet
        const user = env.user || 'the user', cd = sday == null ? 0 : cycleOn(st.cycle, sday, startOf(env));
        const cycle = () => { if (cd && st.cycle.tell) { state.push(`${user} is on their period (day ${cd}).`); if (cd <= 3) now.push(`People close to ${user} know or notice it and act on it naturally: care, warmth, food, rest.`); } };
        if (!T) { cycle(); return state.length || now.length ? { state, now } : null; }
        if (T.fuzzy) state.push(`Calendar: some ${{ d: 'days', w: 'weeks', mo: 'months', y: 'years' }[T.fuzzy.unit] ?? 'days'} after ${fmtEN(T.fuzzy.since)}; the exact date is not known yet. Do not name one unless the story settles it.`);
        else {
            state.push(`Calendar: today is ${fmtEN(T.date, T.wd)}.`);
            for (const m of upcoming(env, T.date, 1)) state.push(`${m.in === 0 ? 'Today' : 'Tomorrow'} is marked on the calendar: ${m.label}${m.years > 0 ? ` (${m.years} years)` : ''}.`);
            const note = st.notes?.[iso(T.date)];
            if (note?.text && note.tell) state.push(`On today's page of the calendar the user wrote: ${String(note.text).slice(0, 80)}.`);
        }
        cycle();
        // one reply only: someone close notices a calendar note (the person pressed it)
        const pk = stamped(st, 'peek', env);
        if (pk?.who && pk.text) now.push(`${pk.who} may notice ${user}'s calendar note for ${pk.md}: "${String(pk.text).slice(0, 80)}" and bring it up naturally if it fits.`);
        return state.length || now.length ? { state, now } : null;
    },
    onReply(env) { return spendStamped(env.store ?? {}, 'peek', env); },
    hud(_S, env) {
        const T = today(env);
        if (!T) return [];
        if (T.fuzzy) return [`📅 ${T.fuzzy.since.getUTCMonth() + 1}/${T.fuzzy.since.getUTCDate()} + 며칠`];
        const pin = marks(env).find((m) => m.pin), start = startOf(env);
        const out = [`📅 ${T.date.getUTCMonth() + 1}/${T.date.getUTCDate()} ${WD_KO[T.wd ?? T.date.getUTCDay()]}`];
        if (pin) { const d = dayOfIso(start, pin.date); if (d != null) out.push(`📌 ${ddayLabel(d, T.day)}`); }
        return out;
    },
    widget(_S, env) {
        const T = today(env);
        if (!T?.date) return '';
        const start = startOf(env), pin = marks(env).find((m) => m.pin);
        const top = pin ? `<div class="mb4-row"><span class="mb4-row-v">📌 ${esc(pin.label)}</span>${pill(ddayLabel(dayOfIso(start, pin.date), T.day), 'bad')}</div>` : '';
        return top + upcoming(env, T.date).filter((m) => m.mark !== pin).slice(0, 3).map((m) => `<div class="mb4-row"><span class="mb4-row-v">${m.mark.yearly ? '🎂' : '🗓'} ${esc(m.label)}</span>${pill(m.in === 0 ? '오늘' : `${m.in}일 뒤`, m.in <= 1 ? 'bad' : '')}</div>`).join('');
    },
    widgetTitle: '곧 일어날 일',
    css: `
.mb4-cal-d.memo::after { content: ''; display: block; width: 4px; height: 4px; margin: 1px auto 0; border-radius: 50%; background: var(--a); }
.mb4-cal-d.cy { background: rgba(229, 72, 77, .16); }
.mb4-cal-d.has { text-decoration: underline 2px var(--a); text-underline-offset: 4px; font-weight: 700; }
.mb4-cal-d.picked:not(.today) { box-shadow: inset 0 0 0 1.5px var(--a); }
.mb4-cal-h { display: flex; align-items: center; justify-content: center; gap: 8px; }
.mb4-cal-d.cyp { box-shadow: inset 0 0 0 1px rgba(229, 72, 77, .35); }
`,
    render(el, api) {
        const env = api.env, st = api.store, sc = env.peek('scene'), start = startOf(env);
        st.marks = marks(env);
        st.notes = st.notes && typeof st.notes === 'object' ? st.notes : {};
        if (st.start && startMs(st.start) == null) delete st.start;   // a start saved with a broken year («0001-…»): dropped, the story's date is used
        st.cycle = { on: false, starts: [], len: 28, dur: 5, tell: false, ...(st.cycle ?? {}) };
        if (!sc) { el.innerHTML = empty('🧭', '「장면」 앱을 켜 주세요', '날짜가 흐르는 건 장면 앱이 세요. 달력은 그걸 읽어서 보여 줘요.'); return; }
        const T = start == null ? null : today(env), now = T?.date ?? T?.fuzzy?.since ?? null;
        const pick = st.pick && now ? st.pick : now ? iso(now) : '';
        const R = replyDays(api.core?.log?.() ?? [], sc, st.start), onDay = new Map();
        for (const r of R) if (r.key) (onDay.get(r.key) ?? onDay.set(r.key, []).get(r.key)).push(r);
        const chatMsgs = api.core?.chat?.() ?? [];
        const loveCal = Array.isArray(env.peekStore?.('touch')?.cal) ? env.peekStore('touch').cal : [];
        let grid = '';
        if (now) {
            // the month shown: today's, or the one moved to with ‹ ›
            const vm = /^(\d{4})-(\d{2})$/.exec(st.view ?? ''), y = vm ? +vm[1] : now.getUTCFullYear(), m = vm ? +vm[2] - 1 : now.getUTCMonth(), days = dimOf(y, m + 1);
            // the month laid out on the story's own weekdays (they win over a real calendar's, as everywhere else)
            const first = utc(y, m + 1, 1), firstWd = T?.date && T.wd != null ? (((T.wd + Math.round((first - T.date) / DAY)) % 7) + 7) % 7 : first.getUTCDay();
            const marked = new Set(st.marks.flatMap((x) => (x.yearly ? [`${y}${x.date.slice(4)}`, x.date] : [x.date])));
            for (const c of loveCal) marked.add(iso(new Date(start + (c.day - 1) * 86400000)));
            const cells = [...Array(firstWd).fill(''), ...Array.from({ length: days }, (_x, i) => i + 1)];
            const mv = (k) => { const d = utc(y, m + 1 + k, 1); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
            grid = `<div class="mb4-cal-h"><button class="mb4-x" data-act="month" data-v="${mv(-1)}" aria-label="지난달">‹</button> ${y}년 ${m + 1}월 ${T.fuzzy ? '<small>· 며칠 흐름</small>' : ''}<button class="mb4-x" data-act="month" data-v="${mv(1)}" aria-label="다음 달">›</button>${vm ? ' <button class="mb4-x" data-act="month" data-v="" aria-label="오늘로">오늘</button>' : ''}</div><div class="mb4-cal">${WD_KO.map((w) => `<span class="mb4-cal-w">${w}</span>`).join('')}${cells.map((n) => {
                if (!n) return '<span></span>';
                const key = iso(new Date(Date.UTC(y, m, n))), dn = dayOfIso(start, key), cy = st.cycle.on ? (cycleOn(st.cycle, dn, start) ? (cyDays(st.cycle, start).some((s) => dn >= s && dn < s + st.cycle.dur) ? ' cy' : ' cyp') : '') : '';
                return `<span class="mb4-cal-d${!T.fuzzy && key === iso(now) ? ' today' : ''}${onDay.has(key) ? ' has' : ''}${key === pick ? ' picked' : ''}${marked.has(key) ? ' mark' : ''}${st.notes[key]?.text ? ' memo' : ''}${cy}" data-act="pick" data-v="${key}">${n}</span>`;
            }).join('')}</div>`;
        }
        const note = st.notes[pick] ?? {};
        const loveHtml = loveCal.length ? card('💌 누가 몰래 적어 놨어요', loveCal.map((c) => `<div class="mb4-row"><span class="mb4-row-k">${start != null ? esc(iso(new Date(start + (c.day - 1) * 86400000)).slice(5).replace('-', '/')) : ''}</span><span class="mb4-row-v">${esc(c.text)} <small>— ${esc(c.who)}</small></span></div>`).join('')) : '';
        const partner = (() => { const P = Object.values(env.peek('bonds')?.pairs ?? {}).filter((p) => p.a === env.user || p.b === env.user).sort((a, b) => b.lvl - a.lvl)[0]; return P ? (P.a === env.user ? P.b : P.a) : ''; })();
        const snip = (i) => esc(String(chatMsgs[i]?.mes ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60));
        const dayList = onDay.get(pick) ?? [], undated = R.filter((r) => !r.key).map((r) => r.i);
        const recHtml = pick ? card(`📜 ${+pick.slice(5, 7)}월 ${+pick.slice(8)}일의 기록`, dayList.length ? dayList.map((r) => `<div class="mb4-row"><span class="mb4-row-k">#${r.i}${r.approx ? ' ~' : ''}</span><span class="mb4-row-v">${snip(r.i)}</span></div>`).join('') + (dayList.some((r) => r.approx) ? hint('~ 는 「며칠 뒤」 사이라 그 무렵이라는 뜻이에요.') : '') : hint('이날의 답은 없어요. 밑줄 그은 날을 눌러 보세요.')) : '';
        el.innerHTML = `${card('', grid || hint('이야기에 날짜가 나오거나 아래에서 시작 날짜를 정하면 달력으로 보여 줘요.'))}
        ${recHtml}
        ${undated.length ? card('🗂 날짜 모름', hint(`${ranges(undated)} — 날짜가 나오기 전이거나 「며칠 뒤」라 날을 몰라요. 🎲로 정할 수 있어요.`)) : ''}
        ${loveHtml}
        ${T?.fuzzy ? card('', hint('「며칠 뒤」처럼 흐리게 지나서 지금 날짜를 몰라요. 이야기가 날짜를 말하면 다시 맞춰져요.'), 'warn') : ''}
        ${pick ? card(`📝 ${esc(pick.slice(5).replace('-', '/'))} 메모`, `<textarea class="mb4-input" rows="2" data-act="memo" placeholder="이 날 적어 둘 것">${esc(note.text ?? '')}</textarea>
            <label class="mb4-sw"><span><b>그날이 오면 AI도 알게</b></span><input type="checkbox" data-act="memotell" ${note.tell ? 'checked' : ''}><i></i></label>
            ${note.text && partner ? `<div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="peek">👀 다음 답에 ${esc(partner)}이(가) 이 메모를 보게</button></div>` : ''}`) : ''}
        ${card('표시한 날', `${st.marks.length ? st.marks.map((x, n) => `<div class="mb4-row"><span class="mb4-row-k">${x.yearly ? '🎂' : '🗓'} ${esc(x.date.slice(5).replace('-', '/'))}</span><span class="mb4-row-v">${esc(x.label)} ${T?.date && start != null ? pill(ddayLabel(dayOfIso(start, x.date), T.day), x.pin ? 'bad' : '') : ''}</span><button class="mb4-x" data-act="pin" data-v="${n}" aria-label="고정" title="홈에 D-day 고정">${x.pin ? '📌' : '📍'}</button><button class="mb4-x" data-act="del" data-v="${n}" aria-label="지우기">✕</button></div>`).join('') : hint('생일 · 마감 · 약속 날을 표시해 두면 하루 전과 당일에 AI가 알아요. 📌로 고정하면 D-day가 상태 줄에 떠요.')}
            <div class="mb4-btnrow"><input class="mb4-input mb4-date" data-f="date" type="date" value="${pick}"><input class="mb4-input" data-f="label" maxlength="40" placeholder="무슨 날"><button class="mb4-btn" data-act="add">표시</button></div>
            <label class="mb4-sw"><span><b>해마다 돌아오는 날</b><small>기념일 · 생일</small></span><input type="checkbox" data-f="yearly"><i></i></label>`)}
        <details class="mb4-card"><summary>🩸 주기 (켤 때만)</summary>
            <label class="mb4-sw"><span><b>주기 표시</b></span><input type="checkbox" data-act="cyon" ${st.cycle.on ? 'checked' : ''}><i></i></label>
            ${st.cycle.on ? `<div class="mb4-btnrow"><label class="mb4-label">주기(일)<input class="mb4-input mb4-short" type="number" min="15" max="60" data-act="cylen" value="${st.cycle.len}"></label><label class="mb4-label">기간(일)<input class="mb4-input mb4-short" type="number" min="1" max="10" data-act="cydur" value="${st.cycle.dur}"></label></div>
            <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="cystart">${pick ? '고른 날을 시작일로' : '오늘을 시작일로'}</button></div>
            ${cyNow(st.cycle, sc.day, start)}
            ${st.cycle.starts.length ? `<div class="mb4-chips">${st.cycle.starts.map((s, n) => `<span class="mb4-chip">🩸 ${esc(typeof s === 'string' ? `${+s.slice(5, 7)}/${+s.slice(8)}` : start != null ? (() => { const d = new Date(start + (s - 1) * DAY); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; })() : `이야기 ${s}번째 날`)} <button class="mb4-x" data-act="cydel" data-v="${n}" aria-label="지우기">✕</button></span>`).join('')}</div>` : ''}
            <label class="mb4-sw"><span><b>AI에 알리기</b><small>기간 중에만 1줄 · 가까운 사람이 챙겨 줘요</small></span><input type="checkbox" data-act="cytell" ${st.cycle.tell ? 'checked' : ''}><i></i></label>` : ''}
        </details>
        ${start == null || sc.vague ? card('🎲 미정 날짜 정하기', `${hint(start == null ? '이야기에 아직 날짜가 없어요. 주사위로 아무 날이나 정해요 (AI 안 써요).' : '「며칠 뒤」처럼 흐린 시간이라 날을 몰라요. 그 주 안에서 주사위로 정해요 (AI 안 써요).')}<div class="mb4-btnrow"><button class="mb4-btn" data-act="roll">🎲 정하기</button></div>`) : ''}
        <details class="mb4-card" ${start == null ? 'open' : ''}><summary>⚙️ 이야기 시작 날짜</summary>
            <label class="mb4-label">오늘이 며칠인가요<input class="mb4-input" data-act="now" maxlength="30" placeholder="예: 11월 25일 · 2026년 11월 25일 · 2026-11-25" value=""></label>
            <label class="mb4-label">또는 이야기가 시작한 날<input class="mb4-input" data-act="start" maxlength="30" placeholder="예: 3월 2일 · 2026-03-02" value="${esc(st.start ?? '')}"></label>
            ${hint('연도를 안 쓰면 지금 정해진 해(없으면 올해)로 봐요. 엔터를 치거나 칸 밖을 누르면 정해져요.')}
        </details>`;
        const save = () => { api.save(); api.redraw(); };
        const readDate = (v) => { const y = start != null ? new Date(start).getUTCFullYear() : new Date().getUTCFullYear(), t = namedDate(String(v ?? '').trim().replace(/^(\d{4})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{1,2})\.?$/, '$1-$2-$3'), y); return t == null || Number.isNaN(t) ? null : t; };
        const memos = Object.entries(st.notes ?? {}).filter(([, x]) => x?.text);
        api.kit.editMore(el, api, [
            { name: 'mark', list: st.marks, label: (x) => `${x.yearly ? '🎂' : '🗓'} 표시 이름 · ${x.date}`, get: (x) => x.label, set: (x, t) => { x.label = t.slice(0, 40); } },
            { name: 'markd', list: st.marks, del: false, label: (x) => `${x.label}: 날짜 (YYYY-MM-DD)`, get: (x) => x.date, set: (x, t) => { if (/^\d{4}-\d{2}-\d{2}$/.test(t)) x.date = t; } },
            { name: 'memo', list: memos, label: ([d]) => `📝 ${d} 메모`, get: ([, x]) => x.text, set: ([, x], t) => { x.text = t.slice(0, 200); }, remove: ([d]) => { delete st.notes[d]; } },
        ]);
        acts(el, {
            // typed, not picked: "11월 25일", "2026년 11월 25일", "2026-11-25", "November 25, 2026"
            start: (v) => { const t = readDate(v); if (t == null) { if (String(v).trim()) api.toast('날짜를 못 알아봤어요. 예: 11월 25일 · 2026-11-25'); return; } st.start = iso(new Date(t)); save(); },
            now: (v) => { const t = readDate(v); if (t == null) { if (String(v).trim()) api.toast('날짜를 못 알아봤어요. 예: 11월 25일 · 2026-11-25'); return; } st.start = iso(new Date(t - (sc.day - 1) * DAY)); save(); api.toast(`지금이 ${new Date(t).getUTCMonth() + 1}월 ${new Date(t).getUTCDate()}일이 되게 맞췄어요.`); },
            pick: (v) => { st.pick = v; api.redraw(); },
            month: (v) => { st.view = v; api.redraw(); },
            roll: () => { const mine = startMs(st.start), d = rollDate(sc, mine == null ? null : new Date(mine).getUTCFullYear()); if (!d) return; if (api.fix('date', `!${d}`)) api.toast(`🎲 ${d.replace(/^(\w+) (\d+), (\d+)$/, (_a, m, dd, y) => `${y}년 ${MON_EN_FULL.indexOf(m) + 1}월 ${dd}일`)}로 정했어요.`); },
            memo: (_v, t) => { const n = (st.notes[pick] ??= {}); n.text = t.value.trim().slice(0, 300); if (!n.text) delete st.notes[pick]; save(); },
            memotell: (_v, b) => { (st.notes[pick] ??= {}).tell = b.checked; save(); },
            peek: () => { st.peek = { who: partner, md: pick.slice(5).replace('-', '/'), text: note.text, at: env.last ?? 0 }; api.save(); api.toast(`다음 답에 한 번: ${partner}이(가) 메모를 볼 수 있어요.`); },
            del: (n) => { st.marks.splice(+n, 1); save(); },
            pin: (n) => { const was = st.marks[+n].pin; st.marks.forEach((x) => delete x.pin); if (!was) st.marks[+n].pin = true; save(); },
            add: () => { const date = val(el, '[data-f="date"]'), label = val(el, '[data-f="label"]'), yearly = el.querySelector('[data-f="yearly"]')?.checked; if (!date || !label) { api.toast('날짜와 이름을 적어 주세요.'); return; } st.marks.push({ date, label, ...(yearly ? { yearly: true } : {}) }); save(); },
            cyon: (_v, b) => { st.cycle.on = b.checked; save(); },
            cytell: (_v, b) => { st.cycle.tell = b.checked; save(); },
            cylen: (_v, b) => { st.cycle.len = Math.max(15, Math.min(60, +b.value || 28)); save(); },
            cydur: (_v, b) => { st.cycle.dur = Math.max(1, Math.min(10, +b.value || 5)); save(); },
            // a date when the calendar has one (it stays put whatever happens to the day count), else the story day
            cystart: () => { const d = start != null ? (pick || iso(new Date(start + (sc.day - 1) * DAY))) : sc.day; if (!st.cycle.starts.includes(d)) st.cycle.starts.push(d); save(); },
            cydel: (n) => { st.cycle.starts.splice(+n, 1); save(); },
        });
    },
};
