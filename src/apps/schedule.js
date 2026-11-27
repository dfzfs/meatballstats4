// 📆 Schedule: each person's ROUTINE — time blocks of their usual day (05:00–07:00 …), what they do, and how they
// move (which ways and places they use or avoid, habits) — on one clean timeline per story day, inside a shared
// timetable («👥 공동»: what the group does together, where their routines meet or keep apart). A block runs every
// day, on some weekdays, or once. 「🪄 AI로 짜기」 asks ONE model call (only when pressed) for everyone ticked:
// their routines, this week's seven days, or the picked day. Promise deadlines (📌) and marked days (📅) from the other
// apps show on the shared timeline. The story clock is WATCHED from 🧭 Scene's lines (nothing new is asked of the
// reader), so swipes and deletions move «today» like every other record.
import { clip } from '../core/text.js';
import { tick, newClock, dayDate } from '../core/clock.js';
import { wdOf, onDay } from '../core/plan.js';
export { wdOf };
import { esc, hint, acts, val, face, inCast, TOD, TOD_KO } from '../ui/kit.js';

export const SHARED = '*';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOD_ICO = { dawn: '🌅', morning: '☀️', noon: '🌞', afternoon: '🌤️', evening: '🌇', night: '🌙', midnight: '🌌' };
const MAX_SEL = 6, MAX_ITEMS = 400;
// a block's time: "05:00–07:00", "19:00 – 01:00+", "7시~9시" or a time-of-day word
export function startOf(time) { const m = String(time ?? '').match(/(\d{1,2})\s*(?::\s*(\d{2}))?\s*(?:시)?/); return m ? Math.min(23, +m[1]) + (m[2] ? +m[2] / 60 : 0) : null; }
export const todOfHour = (h) => (h < 5 ? 'midnight' : h < 7 ? 'dawn' : h < 11 ? 'morning' : h < 13 ? 'noon' : h < 17 ? 'afternoon' : h < 20 ? 'evening' : 'night');
const TOD_H = { dawn: 5, morning: 8, noon: 12, afternoon: 14, evening: 18, night: 21, midnight: 23.9 };
const hourOf = (x) => { const h = startOf(x.time); return h != null ? (h < 4 ? h + 24 : h) : x.tod ? TOD_H[x.tod] : -1; };   // after-midnight blocks sort last
const timeLabel = (x) => (x.time ? String(x.time).replace(/\s*[–~-]\s*/, '–') : x.tod ? TOD_KO[x.tod] : '종일');
const todIx = (t) => TOD.indexOf(t);

// ───── days ─────
const dateAt = (S, day, start) => { const t = dayDate(S, day, start); return t == null ? null : new Date(t); };
const rel = (n) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : n > 0 ? `${n}일 뒤` : `${-n}일 전`);
const dayName = (S, day, start) => { const d = dateAt(S, day, start); return d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WD[d.getUTCDay()]}요일` : `${rel(day - S.day)} (${WD[wdOf(S, day, start)]})`; };
export function weekOf(S, day, start) { const first = day - wdOf(S, day, start); return Array.from({ length: 7 }, (_x, n) => first + n); }
const repText = (x) => (x.rep === 'daily' ? '매일' : x.rep === 'weekly' ? (x.wd?.length === 5 && [1, 2, 3, 4, 5].every((n) => x.wd.includes(n)) ? '평일마다' : x.wd?.length === 2 && x.wd.includes(0) && x.wd.includes(6) ? '주말마다' : `매주 ${(x.wd ?? []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((n) => WD[n]).join('·')}`) : '이날만');
const REP_ICO = { daily: '🔁', weekly: '🗓', once: '📍' };

// older saved plans ({ day, who: [names] }) -> { rep: 'once', day, who: '*' | name }
export function migrate(st) {
    st.items = (Array.isArray(st.items) ? st.items : []).filter((x) => x && x.what).map((x) => {
        if (typeof x.who === 'string' && x.rep) return x;
        const who = Array.isArray(x.who) && x.who.length === 1 ? x.who[0] : SHARED;
        return { what: x.what, where: x.where ?? '', how: '', tod: x.tod ?? '', who, rep: 'once', day: x.day, ...(x.ai ? { ai: true } : {}), doneOn: x.done ? { [x.day]: true } : {} };
    });
}

// ───── the model's answer: "who | when | time | what | where | how" ─────
// when: daily · Mon,Wed · weekdays · weekend · D<n> (one of `days`)
const SHARED_RE = /^(?:shared|together|everyone|all|group|공동|함께|다 ?같이|모두)$/i;
export function parsePlan(text, { days = [], people = [] } = {}) {
    const out = [], low = new Map(people.map((n) => [n.toLowerCase(), n]));
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const p = raw.replace(/^[\s\-*•]+/, '').split('|').map((x) => x.trim());
        if (p.length < 4 || !p[3]) continue;
        const who = SHARED_RE.test(p[0]) ? SHARED : low.get(p[0].toLowerCase());
        if (!who) continue;
        const w = p[1].toLowerCase(), it = { who, what: clip(p[3], 120), where: clip(p[4] ?? '', 60), how: clip(p.slice(5).join(' | '), 300), ai: true, doneOn: {} };
        const dn = w.match(/^d\s*(\d)/);
        if (dn) { if (days[+dn[1] - 1] == null) continue; Object.assign(it, { rep: 'once', day: days[+dn[1] - 1] }); }
        else if (/daily|every ?day|매일/.test(w)) it.rep = 'daily';
        else {
            const wd = new Set();
            if (/weekday|평일/.test(w)) [1, 2, 3, 4, 5].forEach((n) => wd.add(n));
            if (/weekend|주말/.test(w)) [0, 6].forEach((n) => wd.add(n));
            WD_EN.forEach((d, n) => { if (new RegExp(`\\b${d.toLowerCase()}`).test(w)) wd.add(n); });
            WD.forEach((d, n) => { if (new RegExp(`(^|[\\s,·])${d}(요일)?(?=$|[\\s,·])`).test(p[1])) wd.add(n); });
            if (!wd.size) continue;
            Object.assign(it, { rep: 'weekly', wd: [...wd].sort() });
        }
        const tl = p[2].toLowerCase(), h = startOf(p[2]);
        if (h != null) { it.time = clip(p[2], 30); it.tod = todOfHour(h); }
        else it.tod = TOD.find((t) => new RegExp(`\\b${t}\\b`).test(tl)) ?? Object.entries(TOD_KO).find(([, ko]) => p[2].includes(ko))?.[0] ?? '';
        out.push(it);
        if (out.length >= 90) break;
    }
    return out;
}

// ───── everything on one story day ─────
// -> [{ kind: 'own'|'due'|'done'|'mark'|'memo', n?, who ('*' | name), tod, time, hour, label, title, how, rep, done, tag?, go? }]
export function collect(S, env, day) {
    const st = env.store ?? {}, out = [];
    const start = env.peekStore?.('calendar')?.start ?? '', d = dateAt(S, day, start), wd = wdOf(S, day, start);
    (Array.isArray(st.items) ? st.items : []).forEach((x, n) => {
        if (!x?.what || typeof x.who !== 'string' || !onDay(x, day, wd)) return;
        out.push({ kind: 'own', n, who: x.who, tod: x.tod ?? '', time: x.time ?? '', hour: hourOf(x), label: timeLabel(x), title: x.what, where: x.where ?? '', how: x.how ?? '', rep: repText(x), repKind: x.rep, done: !!x.doneOn?.[day] });
    });
    const todo = env.peek?.('todo');
    const cut = (w) => { const t = String(w), i = t.indexOf('='); return i < 0 ? t : t.slice(i + 1).trim().replace(WHEN_TAIL, ''); };
    for (const p of todo?.open ?? []) if (p.due === day) out.push({ kind: 'due', who: SHARED, tod: '', title: cut(p.what), how: '', hour: -1, label: '종일', tag: day < S.day ? '약속 기한 지남' : '약속 기한', go: 'app:todo' });
    for (const p of todo?.closed ?? []) if (p.end === day) out.push({ kind: 'done', who: SHARED, tod: '', title: cut(p.what), how: '', hour: -1, label: '종일', tag: p.st === 'broken' ? '약속 어김' : p.st === 'cancelled' ? '약속 취소' : '약속 지킴', go: 'app:todo', done: true });
    const cal = env.peekStore?.('calendar'), iso = d ? d.toISOString().slice(0, 10) : '';
    if (cal && iso) {
        for (const m of Array.isArray(cal.marks) ? cal.marks : []) if (m?.label && typeof m.date === 'string' && (m.date === iso || (m.yearly && m.date.slice(5) === iso.slice(5)))) out.push({ kind: 'mark', who: SHARED, tod: '', title: m.label, how: '', hour: -1, label: '종일', tag: m.yearly ? '기념일' : '달력', go: 'app:calendar' });
        const memo = cal.notes?.[iso]?.text; if (memo) out.push({ kind: 'memo', who: SHARED, tod: '', title: memo, how: '', hour: -1, label: '종일', tag: '달력 메모', go: 'app:calendar' });
    }
    return out;
}
// a promise keeps its «when» words for the clock ("…, tomorrow"); on the timetable the day already says it
const WHEN_TAIL = /\s*[,，]\s*(?:by |until |before |on |at |this |next |in )?(?:today|tonight|tomorrow(?: \w+)?|the day after tomorrow|\d+ (?:days?|weeks?)|(?:morning|afternoon|evening|night|week|weekend|month)|오늘|내일|모레|이따|주말|다음 ?주|다음 ?달)(?: (?:morning|afternoon|evening|night|아침|저녁|밤))?\s*$/i;

export default {
    api: 1,
    id: 'schedule',
    name: '일정',
    icon: '📆',
    color: '#7a6ad8',
    cost: 'tap',
    desc: '👥 공동 일정 안에 사람마다 루틴(시간대 · 일과 · 동선)이 색깔별로 들어가요. 🪄 한 번이면 다 짜 줘요.',
    watch: ['time', 'date'],
    start: () => newClock(),
    reduce(S, { k, v, i, watched }) { if (watched && (k === 'time' || k === 'date')) tick(S, k, v, i); },
    // Today's plans in one or two short lines; off with one switch.
    note(S, env) {
        if (env?.cfg?.tell === false) return null;
        const me = env.user || 'the user', here = new Set([me, ...(env.peek?.('scene')?.with ?? [])]), cur = todIx(S.tod);
        const L = collect(S, env, S.day).filter((e) => e.kind === 'own' && !e.done).sort((a, b) => a.hour - b.hour);
        if (!L.length) return null;
        const say = (e) => `${e.time || e.tod || 'any time'} — ${e.who === SHARED ? 'everyone together' : e.who}: ${e.title}${e.where ? ` (at ${e.where})` : ''}`;
        const plans = L.filter((e) => (cur < 0 || todIx(e.tod) < 0 || todIx(e.tod) >= cur) && (e.who === SHARED || here.has(e.who))).slice(0, 5);
        const away = cur < 0 ? [] : L.filter((e) => e.tod === S.tod && e.who !== SHARED && !here.has(e.who)).slice(0, 3);   // by their routine, where the absent are now
        const state = [];
        if (plans.length) state.push(`On today's schedule (plans people remember; they can run late or change, but are not forgotten): ${plans.map(say).join(' ; ')}.`);
        if (away.length) state.push(`Right now (${S.tod}), by their usual routine: ${away.map((e) => `${e.who} — ${e.title}${e.where ? ` at ${e.where}` : ''}${e.how ? ` (${clip(e.how, 140)})` : ''}`).join(' ; ')}. Unless the story says otherwise.`);
        return state.length ? { state } : null;
    },
    hud(S, env) {
        const cur = todIx(S.tod), e = collect(S, env, S.day).filter((x) => x.kind === 'own' && !x.done && (todIx(x.tod) < 0 || cur < 0 || todIx(x.tod) >= cur)).sort((a, b) => a.hour - b.hour)[0];
        return e ? [`📆 ${e.label} · ${clip(e.title, 14)}`] : [];
    },
    widget(S, env) {
        const L = collect(S, env, S.day).filter((e) => !e.done && e.kind !== 'memo').sort((a, b) => a.hour - b.hour).slice(0, 4);
        return L.map((e) => `<div class="mb4-row"><span class="mb4-row-k">${esc(e.label)}</span><span class="mb4-row-v">${esc(e.title)} <small>${e.who === SHARED ? (e.tag ? esc(e.tag) : '👥 공동') : `${face(e.who)} ${esc(e.who)}`}</small></span></div>`).join('');
    },
    widgetTitle: '오늘 일정',
    css: `
.mb4-sch-top { padding: 14px 14px 12px; }
.mb4-sch-head { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; }
.mb4-sch-head b { flex: 1; font-size: 14px; font-weight: 700; color: var(--sub); }
.mb4-sch-month { padding: 3px 12px; border: 1.5px solid var(--a); border-radius: 999px; background: transparent; color: var(--a) !important; font-size: 13px !important; font-weight: 700 !important; }
.mb4-sch-nav { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--a) !important; font-size: 17px !important; font-weight: 700 !important; }
.mb4-sch-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
.mb4-sch-day { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 9px 0 8px; border: 0; border-radius: 999px; background: transparent; color: var(--fg) !important; min-width: 0; }
.mb4-sch-day small { font-size: 12px; font-weight: 600; color: var(--sub); }
.mb4-sch-day b { font-size: 17px; font-weight: 500; line-height: 1.1; }
.mb4-sch-day.rel b { font-size: 12px; }
.mb4-sch-day.today:not(.on) b { color: var(--a); font-weight: 800; }
.mb4-sch-day.on { background: var(--a); }
.mb4-sch-day.on small, .mb4-sch-day.on b { color: #fff; font-weight: 800; }
.mb4-sch-day.out { opacity: .25; pointer-events: none; }
.mb4-sch-dots { display: flex; gap: 2px; height: 4px; }
.mb4-sch-dots i { width: 4px; height: 4px; border-radius: 50%; background: var(--c, var(--a)); }
.mb4-sch-day.on .mb4-sch-dots i { background: #fff; }
.mb4-sch-tabs { display: flex; gap: 6px; overflow-x: auto; margin: 2px -14px 12px; padding: 2px 14px 4px; scrollbar-width: none; }
.mb4-sch-tabs::-webkit-scrollbar { display: none; }
.mb4-sch-tab { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px 7px 9px; border: 1.5px solid var(--line); border-radius: 999px; background: var(--card); color: var(--fg) !important; font-size: 13.5px !important; font-weight: 600 !important; white-space: nowrap; }
.mb4-sch-tab i { font-style: normal; font-size: 16px; }
.mb4-sch-tab.on { border-color: var(--a); background: color-mix(in srgb, var(--a) 16%, var(--card)); color: var(--a) !important; font-weight: 700 !important; }
.mb4-sch-tab.add { border-style: dashed; color: var(--sub) !important; background: transparent; }
.mb4-sch-bar { display: flex; gap: 8px; margin: 0 0 12px; }
.mb4-sch-bar > button { flex: 1; min-height: 42px; border: 0; border-radius: 14px; font-size: 14px !important; font-weight: 700 !important; }
.mb4-sch-ai { background: var(--a); color: #fff !important; }
.mb4-sch-add { background: color-mix(in srgb, var(--a) 14%, var(--card)); color: var(--a) !important; }
.mb4-sch-panel { margin: 0 0 14px; padding: 14px; border-radius: 18px; background: var(--card); box-shadow: 0 4px 14px rgba(0, 0, 0, .06); }
.mb4-sch-panel > b { display: block; margin: 0 0 8px; font-size: 14.5px; }
.mb4-sch-panel > small { display: block; margin: 10px 0 5px; color: var(--sub); font-size: 12px; font-weight: 700; }
.mb4-sch-chks { display: flex; flex-wrap: wrap; gap: 6px; }
.mb4-sch-chk { position: relative; }
.mb4-sch-chk input { position: absolute; opacity: 0; pointer-events: none; }
.mb4-sch-chk span { display: inline-block; padding: 6px 12px; border: 1.5px solid var(--line); border-radius: 999px; font-size: 13px; }
.mb4-sch-chk input:checked + span { background: color-mix(in srgb, var(--a) 16%, var(--card)); border-color: var(--a); color: var(--a); font-weight: 700; }
.mb4-sch-chk input:focus-visible + span { outline: 2px solid var(--a); outline-offset: 1px; }
.mb4-phone .mb4-sch-go-btn { width: 100%; margin-top: 12px; min-height: 42px; border-radius: 14px; background: var(--a) !important; color: #fff !important; }
.mb4-sch-tl { margin: 4px 0 8px; }
.mb4-sch-wipe { padding: 6px 12px; border: 1.5px solid var(--line); border-radius: 999px; background: transparent; color: var(--fg) !important; font-size: 13px !important; }
.mb4-sch-ev { position: relative; display: grid; grid-template-columns: 52px 22px 1fr; }
.mb4-sch-t { display: flex; flex-direction: column; align-items: center; gap: 1px; padding-top: 6px; font-size: 11.5px; font-weight: 700; color: var(--sub); text-align: center; }
.mb4-sch-t i { font-style: normal; font-size: 22px; line-height: 1.1; }
.mb4-sch-rail { position: relative; display: flex; justify-content: center; }
.mb4-sch-rail::after { content: ''; position: absolute; top: 22px; bottom: 0; left: 50%; width: 2px; margin-left: -1px; border-radius: 2px; background: color-mix(in srgb, var(--a) 30%, transparent); }
.mb4-sch-ev:last-child .mb4-sch-rail::after { display: none; }
.mb4-sch-dot { position: relative; z-index: 1; margin-top: 12px; width: 10px; height: 10px; border-radius: 50%; background: var(--a); box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 22%, transparent); }
.mb4-sch-rows { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 0 0 16px 4px; }
.mb4-sch-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--fg) 8%, transparent); border-radius: 14px; background: color-mix(in srgb, var(--card) 62%, transparent); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--fg) !important; text-align: left; }
.mb4-sch-row.shared { background: color-mix(in srgb, var(--a) 12%, color-mix(in srgb, var(--card) 62%, transparent)); border-color: color-mix(in srgb, var(--a) 25%, transparent); }
.mb4-sch-row > i { flex: none; width: 26px; font-style: normal; font-size: 20px; text-align: center; }
.mb4-sch-row > span { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mb4-sch-row b { font-size: 14.5px !important; font-weight: 650; line-height: 1.35; color: var(--fg); overflow-wrap: anywhere; }
.mb4-sch-row small { font-size: 11.5px; color: var(--sub); }
.mb4-sch-row .mb4-sch-how { opacity: .8; }
.mb4-sch-badge { flex: none; align-self: flex-start; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--a) 13%, transparent); color: var(--a); font-style: normal; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.mb4-sch-form > small { display: block; margin: 9px 0 4px; color: var(--sub); font-size: 11.5px; font-weight: 700; }
.mb4-sch-form .mb4-sch-wds { margin-top: 6px; }
.mb4-sch-form:not(:has(input[value="weekly"]:checked)) .mb4-sch-wds { display: none; }
.mb4-sch-form .mb4-btnrow .mb4-btn:first-child { flex: 1; }
.mb4-sch-row.done { opacity: .5; } .mb4-sch-row.done b { text-decoration: line-through; }
.mb4-sch-row.tag { border-style: dashed; }
.mb4-sch-more { margin: -2px 0 2px; padding: 9px 12px; border-radius: 12px; background: color-mix(in srgb, var(--card) 45%, transparent); font-size: 12.5px; line-height: 1.5; color: var(--sub); overflow-wrap: anywhere; }
.mb4-sch-more > div:not(.mb4-sch-form) { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.mb4-sch-more > div:not(.mb4-sch-form) button { min-height: 28px; padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--fg) !important; font-size: 12px !important; }
.mb4-sch-rep { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--a) 14%, transparent); color: var(--a); font-size: 11px; font-weight: 700; }
.mb4-sch-now { position: relative; margin: 0 -14px; padding: 24px 14px 0; background: linear-gradient(180deg, color-mix(in srgb, var(--a) 16%, transparent), transparent 85%); }
.mb4-sch-now::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1.5px; background: var(--a); }
.mb4-sch-now::after { content: ''; position: absolute; left: 10px; top: -6px; width: 13px; height: 13px; border-radius: 50%; background: var(--a); }
.mb4-sch-now > small { position: absolute; right: 14px; top: 3px; font-size: 10.5px; font-weight: 800; color: var(--a); }
.mb4-sch-empty { padding: 26px 0 18px; text-align: center; color: var(--sub); font-size: 13px; line-height: 1.6; }
`,
    render(el, api) {
        const env = api.env, st = api.store, S = api.state(), me = env.user || '나';
        migrate(st);
        const ok = inCast(env);   // someone removed in 👥 인물 is gone from here too
        st.sel = Array.isArray(st.sel) ? st.sel.filter((n) => n && n !== me && ok(n)).slice(0, MAX_SEL) : [];
        const scene = env.peek('scene'), start = env.peekStore?.('calendar')?.start ?? '', people = env.peek('people')?.list ?? {};
        const today = S.day, pick = Number.isFinite(st.pick) && st.pick >= 1 ? st.pick : today;
        const known = [...new Set([...st.sel, ...(scene?.with ?? []), ...Object.values(people).filter((p) => p && !p.gone).sort((a, b) => (b.i ?? 0) - (a.i ?? 0)).map((p) => p.name)])].filter((n) => n && n !== me && ok(n)).slice(0, 16);
        if (!st.seeded) { st.seeded = true; if (!st.sel.length) st.sel = known.slice(0, 3); }
        const order = [me, ...st.sel];
        const colorOf = () => 'var(--a)';   // one theme colour; people are told apart by their emoji
        const view = st.view === SHARED || order.includes(st.view) ? st.view : SHARED;
        const nameOf = (n) => (n === SHARED ? '공동' : n === me ? `${n} (나)` : n);
        const icoOf = (n) => (n === SHARED ? '👥' : face(n));
        // the shared view holds the shared plans and, inside them, everyone's own; a person's view holds only theirs
        const inView = (e) => (view === SHARED ? e.who === SHARED || order.includes(e.who) : e.who === view);

        // ── week strip ──
        const week = weekOf(S, pick, start), pd = dateAt(S, pick, start);
        const strip = week.map((day) => {
            if (day < 1) return '<span class="mb4-sch-day out"><small>&nbsp;</small><b>·</b><span class="mb4-sch-dots"></span></span>';
            const d = dateAt(S, day, start), cs = [...new Set(collect(S, env, day).filter(inView).map((e) => colorOf(e.who)))].slice(0, 3);
            return `<button class="mb4-sch-day${day === pick ? ' on' : ''}${day === today ? ' today' : ''}${d ? '' : ' rel'}" data-act="pick" data-v="${day}" aria-label="${esc(dayName(S, day, start))}"><small>${WD[wdOf(S, day, start)]}</small><b>${d ? d.getUTCDate() : esc(rel(day - today))}</b><span class="mb4-sch-dots">${cs.map((c) => `<i style="--c:${c}"></i>`).join('')}</span></button>`;
        }).join('');
        const top = `<section class="mb4-card mb4-sch-top"><div class="mb4-sch-head"><b>${esc(pick === today ? '오늘 일정' : dayName(S, pick, start))}</b><button class="mb4-sch-nav" data-act="pick" data-v="${Math.max(1, pick - 7)}" aria-label="앞 주">‹</button>${pick !== today ? '<button class="mb4-sch-month" data-act="pick" data-v="today">오늘로</button>' : `<span class="mb4-sch-month">${esc(pd ? `${pd.getUTCMonth() + 1}월` : '이번 주')}</span>`}<button class="mb4-sch-nav" data-act="pick" data-v="${pick + 7}" aria-label="다음 주">›</button></div><div class="mb4-sch-strip">${strip}</div></section>`;

        // ── whose timetable ──
        const tabs = `<div class="mb4-sch-tabs" role="tablist">${[SHARED, ...order].map((n) => `<button class="mb4-sch-tab${view === n ? ' on' : ''}" style="--c:${colorOf(n)}" role="tab" aria-selected="${view === n}" data-act="view" data-v="${esc(n)}"><i>${icoOf(n)}</i>${esc(nameOf(n))}</button>`).join('')}<button class="mb4-sch-tab add" data-act="panel" data-v="ppl">＋ 사람</button></div>`;

        // ── panels: AI · add · people ──
        const chk = (name, n, on, attr = 'data-ai') => `<label class="mb4-sch-chk" style="--c:${colorOf(n)}"><input type="checkbox" ${attr}="${esc(n)}" ${on ? 'checked' : ''}><span>${icoOf(n)} ${esc(name)}</span></label>`;
        const radio = (group, v, label, on) => `<label class="mb4-sch-chk"><input type="radio" name="${group}" value="${v}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
        // one form for a new plan and for changing one (like a calendar app's event sheet)
        const places = [...new Set([...Object.values(env.peek('map')?.P ?? {}).map((x) => x?.name), ...st.items.map((x) => x.where)].filter(Boolean))].slice(0, 40);
        const form = (x, key) => { const r = x.rep ?? 'daily', wds = x.wd?.length ? x.wd : [wdOf(S, pick, start)], dn = esc(pick === today ? '오늘' : dayName(S, x.rep === 'once' && x.day ? x.day : pick, start)); return `<div class="mb4-sch-form" data-form="${key}">
            <input class="mb4-input" data-ff="what" maxlength="120" placeholder="무엇을 하나요" value="${esc(x.what ?? '')}">
            <div class="mb4-btnrow"><input class="mb4-input" data-ff="time" maxlength="30" placeholder="🕰 07:00–09:00" value="${esc(x.time ?? '')}"><input class="mb4-input" data-ff="where" maxlength="60" placeholder="📍 장소" list="mb4-sch-places" value="${esc(x.where ?? '')}"></div>
            <small>누구 일정</small><div class="mb4-sch-chks">${[SHARED, ...order].map((n) => `<label class="mb4-sch-chk"><input type="radio" name="mb4-sch-who-${key}" value="${esc(n)}" ${n === (x.who ?? SHARED) ? 'checked' : ''}><span>${icoOf(n)} ${esc(nameOf(n))}</span></label>`).join('')}</div>
            <small>반복</small><div class="mb4-sch-chks">${[['daily', '🔁 매일'], ['weekly', '🗓 매주'], ['once', `📍 ${dn}만`]].map(([v, t]) => `<label class="mb4-sch-chk"><input type="radio" name="mb4-sch-rep-${key}" value="${v}" ${v === r ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
            <div class="mb4-sch-chks mb4-sch-wds">${[1, 2, 3, 4, 5, 6, 0].map((n) => `<label class="mb4-sch-chk"><input type="checkbox" data-fwd="${n}" ${wds.includes(n) ? 'checked' : ''}><span>${WD[n]}</span></label>`).join('')}</div>
            <textarea class="mb4-input" data-ff="how" rows="2" maxlength="300" placeholder="메모 · 동선 (비워도 돼요)">${esc(x.how ?? '')}</textarea>
            <div class="mb4-btnrow"><button class="mb4-btn" data-act="savei" data-v="${key}">${key === 'new' ? '넣기' : '저장'}</button>${key === 'new' ? '' : `<button class="mb4-btn ghost" data-act="done" data-v="${key.slice(1)}">${x.doneOn?.[pick] ? '↩ 안 끝냄' : '✓ 끝냄'}</button><button class="mb4-btn ghost" data-act="deli" data-v="${key}">${st._del === key ? '⚠ 한 번 더' : '🗑'}</button>`}</div></div>`; };
        const panels = {
            ai: `<div class="mb4-sch-panel"><b>🪄 AI로 일정 짜기</b>
                <small>누구 일정</small><div class="mb4-sch-chks">${[SHARED, ...order].map((n) => chk(nameOf(n), n, true)).join('')}</div>
                <small>어떻게</small><div class="mb4-sch-chks">${radio('mb4-sch-mode', 'routine', '🔁 루틴 (평소 하루 · 요일별)', true)}${radio('mb4-sch-mode', 'week', '🗓 이번 주 7일')}${radio('mb4-sch-mode', 'day', `📍 ${esc(pick === today ? '오늘' : dayName(S, pick, start))} 하루`)}</div>
                <small>바라는 것 (자유롭게 · 비워도 돼요)</small><textarea class="mb4-input" data-f="wish" rows="4" maxlength="2000" placeholder="예: 한 명은 아침형이라 일찍 일어나고, 다른 한 명은 밤늦게까지 가게를 봐요. 주말엔 다 같이 시장에 가요.">${esc(st.wish ?? '')}</textarea>
                ${hint('누를 때 AI를 1번 불러요. 다시 짜면 AI가 짠 것만 바뀌고, 직접 넣은 건 그대로예요. 적은 말은 저장돼서 다음에도 남아요.')}
                <button class="mb4-btn mb4-sch-go-btn" data-act="magic">🪄 짜기</button>
                <small>지우기 (위에서 고른 사람 것만)</small><div class="mb4-sch-chks"><button class="mb4-sch-wipe" data-act="wipe" data-v="ai">${st._wipe === 'ai' ? '⚠ 한 번 더 누르면 지워져요' : '🗑 AI가 짠 것 지우기'}</button><button class="mb4-sch-wipe" data-act="wipe" data-v="all">${st._wipe === 'all' ? '⚠ 한 번 더 누르면 지워져요' : '🗑 전부 지우기'}</button></div></div>`,
            add: `<div class="mb4-sch-panel"><b>＋ 일정 넣기</b>${form({ who: view, rep: 'daily' }, 'new')}</div>`,
            ppl: `<div class="mb4-sch-panel"><b>👥 일정을 볼 사람</b>
                ${known.length ? `<div class="mb4-sch-chks">${known.map((n) => `<label class="mb4-sch-chk" style="--c:${st.sel.includes(n) ? colorOf(n) : 'var(--a)'}"><input type="checkbox" data-act="sel" data-v="${esc(n)}" ${st.sel.includes(n) ? 'checked' : ''}><span>${face(n)} ${esc(n)}</span></label>`).join('')}</div>` : hint('이야기에 사람이 나오면 여기서 고를 수 있어요.')}
                ${hint(`${MAX_SEL}명까지. 고른 사람마다 탭이 생기고, 그 사람 일정이 공동 일정 안에 자기 색으로 들어가요.`)}</div>`,
        };
        const bar = `<div class="mb4-sch-bar"><button class="mb4-sch-ai" data-act="panel" data-v="ai">🪄 AI로 짜기</button><button class="mb4-sch-add" data-act="panel" data-v="add">＋ 일정 넣기</button></div>`;

        // ── the day ──
        const L = collect(S, env, pick).filter(inView).sort((a, b) => (b.who === SHARED) - (a.who === SHARED) || a.hour - b.hour);   // shared plans on top, then by the hour
        const ICON = { due: '📌', done: '📌', mark: '📅', memo: '📝' };
        // blocks are grouped by time of day (새벽 · 아침 · 낮 …), one short line each with its own hours; tapping a line opens its details
        const span = (e) => { if (e.hour < 0) return [-1, -1]; const m = String(e.time ?? '').match(/\d{1,2}\s*(?::\s*\d{2})?[^\d]+(\d{1,2})\s*(?::\s*(\d{2}))?/); let end = m ? +m[1] + (m[2] ? +m[2] / 60 : 0) : e.hour + 1; if (end < 4) end += 24; if (end <= e.hour) end += 24; return [e.hour, end]; };
        const clusters = [];
        for (const e of L) { const [a, z] = span(e), key = a < 0 ? '' : e.tod || todOfHour(a % 24), c = clusters.find((x) => x.key === key); if (c) { c.list.push(e); c.z = Math.max(c.z, z); } else clusters.push({ key, a, z, list: [e] }); }
        const open = String(st.open ?? '');
        const row = (e) => {
            const key = e.kind === 'own' ? `n${e.n}` : `t${e.kind}:${e.title}`;
            const sub = e.kind === 'own' ? [esc(e.label), esc(nameOf(e.who)), e.where ? `📍 ${esc(e.where)}` : ''].filter(Boolean).join(' · ') : esc(e.tag);
            const head = `<button class="mb4-sch-row${e.done ? ' done' : ''}${e.kind !== 'own' ? ' tag' : ''}${e.who === SHARED && e.kind === 'own' ? ' shared' : ''}" data-act="open" data-v="${esc(key)}" aria-expanded="${open === key}"><i>${e.kind === 'own' ? icoOf(e.who) : ICON[e.kind]}</i><span><b>${esc(e.title)}</b><small>${sub}</small>${e.how && open !== key ? `<small class="mb4-sch-how">${esc(e.how)}</small>` : ''}</span>${e.kind === 'own' ? `<em class="mb4-sch-badge">${REP_ICO[e.repKind] ?? ''} ${esc(e.rep)}</em>` : ''}</button>`;
            if (open !== key) return head;
            if (e.kind === 'own') return head + `<div class="mb4-sch-more">${form(st.items[e.n], key)}${e.where && api.isOn('map') ? `<div><button data-act="go" data-v="app:map">🗺 지도에서 「${esc(e.where)}」 보기 ›</button></div>` : ''}</div>`;
            return head + `<div class="mb4-sch-more"><div>${e.go && api.isOn(e.go.slice(4)) ? `<button data-act="go" data-v="${e.go}">${ICON[e.kind]} 보러 가기 ›</button>` : ''}</div></div>`;
        };
        const nowTod = pick === today ? S.tod : '';
        const ORDER = ['', ...TOD];
        clusters.sort((x, y) => ORDER.indexOf(x.key) - ORDER.indexOf(y.key));
        const tl = L.length ? clusters.map((c) => {
            const label = `<i>${c.key ? TOD_ICO[c.key] : '📌'}</i>${c.key ? TOD_KO[c.key] : '종일'}`;
            const html = `<div class="mb4-sch-ev"><span class="mb4-sch-t">${label}</span><span class="mb4-sch-rail"><i class="mb4-sch-dot"></i></span><div class="mb4-sch-rows">${c.list.map(row).join('')}</div></div>`;
            const isNow = !!nowTod && c.key === nowTod;
            return isNow ? `<div class="mb4-sch-now"><small>지금 · ${TOD_KO[nowTod]}</small>${html}</div>` : html;
        }).join('') : `${nowTod ? `<div class="mb4-sch-now"><small>지금 · ${TOD_KO[nowTod]}</small></div>` : ''}<div class="mb4-sch-empty">${view === SHARED ? '공동' : esc(nameOf(view))} 일정이 비어 있어요<br>🪄 AI로 짜기를 누르거나 직접 넣어요</div>`;

        el.innerHTML = `${scene ? '' : `<section class="mb4-card warn">${esc('🧭 장면 앱을 켜야 이야기 속 날과 때가 흘러요. 지금은 넣은 일정만 보여 줘요.')}</section>`}
        ${top}${tabs}${bar}${panels[st.panel] ?? ''}<div class="mb4-sch-tl">${tl}</div><datalist id="mb4-sch-places">${places.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <label class="mb4-sw"><span><b>오늘 일정을 AI에게도 알려 주기</b><small>오늘 남은 일정과, 다른 곳에 있는 사람이 지금 뭘 하는지 한두 줄로 보내요.</small></span><input type="checkbox" data-act="tell" ${api.cfg.tell !== false ? 'checked' : ''}><i></i></label>`;

        const save = () => { api.save(); api.redraw(); };
        const radioVal = (name) => el.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
        acts(el, {
            pick: (v) => { st.pick = v === 'today' ? today : Math.max(1, +v || today); api.redraw(); },
            view: (v) => { st.view = v; api.redraw(); },
            panel: (v) => { const w = el.querySelector('[data-f="wish"]'); if (w) st.wish = w.value.slice(0, 2000); st.panel = st.panel === v ? '' : v; st._wipe = ''; api.redraw(); },
            open: (v) => { st.open = st.open === v ? '' : v; st._del = ''; api.redraw(); },
            // two taps: the first only asks; the second removes every plan (or only the AI's) of the people ticked above
            wipe: (v) => {
                const whoList = [...el.querySelectorAll('[data-ai]')].filter((x) => x.checked).map((x) => x.dataset.ai);
                if (st._wipe !== v) { st._wipe = v; api.redraw(); return; }
                const gone = (x) => whoList.includes(x.who) && (v === 'all' || x.ai);
                const n = st.items.filter(gone).length;
                st.items = st.items.filter((x) => !gone(x)); st._wipe = '';
                api.toast(n ? `🗑 일정 ${n}개를 지웠어요.` : '지울 일정이 없어요.');
                save();
            },
            go: (v) => api.go(v),
            tell: (_v, b) => { api.cfg.tell = b.checked; api.save(); },
            done: (n) => { const x = st.items[+n]; if (!x) return; x.doneOn = x.doneOn && typeof x.doneOn === 'object' ? x.doneOn : {}; if (x.doneOn[pick]) delete x.doneOn[pick]; else x.doneOn[pick] = true; save(); },
            sel: (n, b) => {
                if (b.checked && !st.sel.includes(n)) { if (st.sel.length >= MAX_SEL) { api.toast(`${MAX_SEL}명까지 고를 수 있어요.`); b.checked = false; return; } st.sel.push(n); }
                else if (!b.checked) { st.sel = st.sel.filter((x) => x !== n); if (st.view === n) st.view = SHARED; }
                save();
            },
            savei: (key) => {
                const box = el.querySelector(`[data-form="${CSS.escape(key)}"]`); if (!box) return;
                const f = (n) => String(box.querySelector(`[data-ff="${n}"]`)?.value ?? '').trim();
                const what = f('what'), time = f('time'), h = startOf(time), who = radioVal(`mb4-sch-who-${key}`) || SHARED, r = radioVal(`mb4-sch-rep-${key}`) || 'daily';
                const wd = [...box.querySelectorAll('[data-fwd]')].filter((x) => x.checked).map((x) => +x.dataset.fwd).sort();
                if (!what) { api.toast('무엇을 하는지 적어 주세요.'); return; }
                if (r === 'weekly' && !wd.length) { api.toast('매주 무슨 요일인지 골라 주세요.'); return; }
                const old = key === 'new' ? null : st.items[+key.slice(1)];
                const it = { ...(old ?? { doneOn: {} }), who, what: what.slice(0, 120), where: f('where').slice(0, 60), how: f('how').slice(0, 300), rep: r };
                delete it.time; delete it.wd; delete it.day; delete it.from; delete it.ai;   // changed by hand: it is yours now
                if (h != null) { it.time = time.slice(0, 30); it.tod = todOfHour(h); } else it.tod = old && !old.time ? old.tod ?? '' : '';
                if (r === 'once') it.day = old?.rep === 'once' ? old.day : pick; else it.from = old?.from ?? Math.min(pick, today);
                if (r === 'weekly') it.wd = wd;
                if (old) st.items[+key.slice(1)] = it; else { st.items.push(it); if (st.items.length > MAX_ITEMS) st.items.splice(0, st.items.length - MAX_ITEMS); st.view = view === SHARED ? SHARED : who; }
                st.panel = ''; st.open = ''; save();
            },
            deli: (key) => { if (st._del !== key) { st._del = key; api.redraw(); return; } st.items.splice(+key.slice(1), 1); st._del = ''; st.open = ''; save(); },
            // ONE model call, only because 「짜기」 was pressed: every ticked timetable at once
            magic: async (_v, b) => {
                const whoList = [...el.querySelectorAll('[data-ai]')].filter((x) => x.checked).map((x) => x.dataset.ai), mode = radioVal('mb4-sch-mode') || 'routine';
                if (!whoList.length) { api.toast('누구 일정을 짤지 골라 주세요.'); return; }
                st.wish = val(el, '[data-f="wish"]').slice(0, 2000);
                b.disabled = true; b.textContent = '🪄 짜는 중…';
                const days = mode === 'week' ? week.filter((d) => d >= 1) : mode === 'day' ? [pick] : [];
                const dayLine = (day, n) => { const d = dateAt(S, day, start); return `D${n + 1} = ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wdOf(S, day, start)]}${d ? ` ${d.toISOString().slice(0, 10)}` : ''}${day === today ? ' (today)' : ''}`; };
                const who = whoList.map((n) => (n === SHARED ? '- shared: what the group does together, and where and when these people\'s routines cross or deliberately keep apart' : n === me ? `- ${me}: the user's own character` : `- ${n}${people[n]?.about ? `: ${people[n].about}` : ''}`)).join('\n');
                const fixed = st.items.filter((x) => !x.ai && whoList.includes(x.who)).slice(-30).map((x) => `${x.who === SHARED ? 'shared' : x.who} | ${x.rep === 'once' ? `once on ${dayName(S, x.day, start)}` : repText(x)} | ${x.time || x.tod || 'any'} | ${x.what}`);
                const shape = mode === 'routine'
                    ? 'Each person\'s ROUTINE: their usual day as time blocks from waking to sleeping (and the night, if they are up). Not one particular day\'s events. when: "daily", or the days a block applies among Mon Tue Wed Thu Fri Sat Sun joined with ",", or "weekdays" / "weekend" (use these only where their week really differs). 5 to 8 blocks per person, 3 to 6 for shared.'
                    : `Plans for ${days.length === 1 ? 'this one day' : 'these days'} only:\n${days.map(dayLine).join('\n')}\nwhen: the day's code (D1${days.length > 1 ? `…D${days.length}` : ''}). ${days.length === 1 ? '3 to 6' : '2 to 5'} lines per timetable${days.length > 1 ? ' per day' : ''}.`;
                const answer = await api.ask(`Make believable schedules for the timetables below, for an ongoing story.
Timetables:\n${who}
${shape}
One block per line, exactly in this shape:
who | when | time | what | where | how
who: "shared" or one of the names above. time: a 24-hour range like 07:00–09:00 (or a time of day: dawn, morning, noon, afternoon, evening, night, midnight). what: a SHORT PHRASE of about 4 to 10 words, like a calendar entry with a little context — the activity and where or with whom (e.g. "morning rounds in the surgical ward", "walk alone along the river path") — not a full sentence. where: the place, a short name — one of the story's places when it fits. how: optional, a few words on how they move or what they avoid in that block (may be left empty).
Build it from what is known about these people, their situation and their relationships; keep to the plans already fixed below (do not repeat those). Write "what", "where" and "how" in the language the story is written in. No other text.
${st.wish ? `\n[What the user wants — follow it closely]\n${st.wish}\n` : ''}${fixed.length ? `\n[Already fixed — keep, do not repeat]\n${fixed.join('\n')}\n` : ''}
${places.length ? `[Places the story has]\n${places.join(', ')}\n\n` : ''}[What is known]\n${api.facts() || '(nothing recorded)'}

[Latest part of the story]\n${clip(env.recent(1)[0] ?? '', 1500)}`, 2000);
                const rows = parsePlan(answer, { days, people: order }).filter((x) => whoList.includes(x.who)).map((x) => (x.rep === 'once' ? x : { ...x, from: Math.min(pick, today) }));
                if (!rows.length) { api.toast('받지 못했어요. 멈춤 중이 아닌지 보고 다시 눌러 주세요.'); api.redraw(); return; }
                // what the AI made before for the same people and the same kind of plan goes; your own stays
                const old = (x) => x.ai && whoList.includes(x.who) && (mode === 'routine' ? x.rep !== 'once' : x.rep === 'once' && days.includes(x.day));
                st.items = [...st.items.filter((x) => !old(x)), ...rows];
                if (st.items.length > MAX_ITEMS) st.items.splice(0, st.items.length - MAX_ITEMS);
                st.panel = '';
                api.toast(`📆 일정 ${rows.length}개를 짰어요.`);
                save();
            },
        });
    },
};
