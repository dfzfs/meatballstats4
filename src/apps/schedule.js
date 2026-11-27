// 📆 Schedule: one timeline for the whole story day. A shared plan («함께») with the picked people's own plans laid
// into it, each in their colour — and, on the same line, what the other apps already know about that day:
// promises that fall due (📌), marked days and notes (📅), places passed and people met (🧭 · 🗺), the day's summary.
// Nothing new is asked of the reader: the clock, places and summaries are WATCHED from 🧭 Scene's lines, so the
// timeline follows swipes and deletions like every other record. One model call only when «🪄 일주일 짜기» is tapped.
import { clip } from '../core/text.js';
import { tick, newClock, dayDate } from '../core/clock.js';
import { esc, card, hint, acts, val, empty, face, room, TOD, TOD_KO } from '../ui/kit.js';

const ALL = '*';                                  // the shared plan
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const WD_EN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const PAL = ['#f4a340', '#7a6ad8', '#22b07d', '#ef5da8', '#3a8ee6', '#16a3a8', '#c98a00'];
const MAX_SEL = 6, MAX_ITEMS = 200, MAX_RT = 14, MAX_LOG = 160;
const names = (v) => String(v).split(/[,，、]/).map((x) => x.trim()).filter((x) => x && x.length <= 40);
const none = (t) => /^=?\s*\(?\s*(?:none|nobody|no one|alone|empty|-)?\s*\)?\s*$/i.test(t);
const todIx = (t) => { const n = TOD.indexOf(t); return n < 0 ? -1 : n; };

// ───── days ─────
const dateAt = (S, day, start) => { const t = dayDate(S, day, start); return t == null ? null : new Date(t); };
const isoAt = (S, day, start) => dateAt(S, day, start)?.toISOString().slice(0, 10) ?? '';
const rel = (n) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : n > 0 ? `${n}일 뒤` : `${-n}일 전`);
const dayName = (S, day, start) => { const d = dateAt(S, day, start); return d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WD[d.getUTCDay()]}요일` : rel(day - S.day); };

// ───── a person's repeating week ─────
const fits = (r, d) => !r.wd?.length || (d ? r.wd.includes(d.getUTCDay()) : false);
const wdText = (r) => (r.wd?.length ? (r.wd.length === 7 ? '매일' : [1, 2, 3, 4, 5].every((n) => r.wd.includes(n)) && r.wd.length === 5 ? '평일' : r.wd.length === 2 && r.wd.includes(0) && r.wd.includes(6) ? '주말' : r.wd.slice().sort((a, b) => a - b).map((n) => WD[n]).join('·')) : '매일');
// "days | time | what | where" lines (a model's answer, or typed by hand) -> rows
export function parseRoutine(text) {
    const out = [];
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const p = raw.replace(/^[\s\-*•\d.)]+/, '').split('|').map((x) => x.trim());
        if (p.length < 3 || !p[2]) continue;
        const dl = p[0].toLowerCase();
        const wd = /every|daily|매일|all/.test(dl) ? [] : [...new Set([...WD_EN.map((w, n) => (dl.includes(w) ? n : -1)), ...WD.map((w, n) => (new RegExp(`(^|[\\s,·])${w}(요일)?(?=$|[\\s,·])`).test(p[0]) ? n : -1))].filter((n) => n >= 0))];
        if (/weekday|평일/.test(dl)) wd.push(...[1, 2, 3, 4, 5].filter((n) => !wd.includes(n)));
        if (/weekend|주말/.test(dl)) wd.push(...[0, 6].filter((n) => !wd.includes(n)));
        const tl = p[1].toLowerCase(), tod = TOD.find((t) => tl.includes(t)) ?? Object.entries(TOD_KO).find(([, ko]) => p[1].includes(ko))?.[0] ?? '';
        out.push({ wd, tod, what: clip(p[2], 60), where: clip(p[3] ?? '', 60) });
        if (out.length >= 10) break;
    }
    return out;
}

// ───── everything known about one story day, as timeline entries ─────
// -> [{ kind: 'own'|'rt'|'due'|'done'|'mark'|'memo'|'loc'|'gist'|'met', tod, title, who: [], where, tag, go, n? }]
export function collect(S, env, day) {
    const st = env.store ?? {}, me = env.user || '나', out = [];
    const start = env.peekStore?.('calendar')?.start ?? '', d = dateAt(S, day, start);
    const tracked = [ALL, me, ...(st.sel ?? [])];
    (st.items ?? []).forEach((x, n) => { if (x?.day === day && x.what) out.push({ kind: 'own', n, tod: x.tod ?? '', title: x.what, who: x.who ?? [], where: x.where ?? '', done: !!x.done, tag: '' }); });
    for (const who of tracked) for (const [n, r] of (st.rt?.[who] ?? []).entries()) if (fits(r, d)) out.push({ kind: 'rt', rt: `${who}|${n}`, tod: r.tod ?? '', title: r.what, who: who === ALL ? [] : [who], where: r.where ?? '', tag: `늘 · ${wdText(r)}` });
    // 📌 promises: on the day they fall due, and on the day they were closed
    const todo = env.peek?.('todo');
    const cut = (w) => { const t = String(w), i = t.indexOf('='); return i < 0 ? { who: [], what: t } : { who: t.slice(0, i).split('>').map((x) => x.trim()).filter(Boolean), what: t.slice(i + 1).trim().replace(WHEN_TAIL, '') }; };
    for (const p of todo?.open ?? []) if (p.due === day) { const c = cut(p.what); out.push({ kind: 'due', tod: '', title: c.what, who: c.who, where: '', tag: day < S.day ? '약속 · 기한 지남' : '약속 기한', go: 'app:todo', late: day < S.day }); }
    for (const p of todo?.closed ?? []) if (p.end === day) { const c = cut(p.what); out.push({ kind: 'done', tod: '', title: c.what, who: c.who, where: '', tag: p.st === 'broken' ? '약속 · 어김' : p.st === 'cancelled' ? '약속 · 취소' : '약속 · 지킴', go: 'app:todo', done: true }); }
    // 📅 marked days and that day's note
    const cal = env.peekStore?.('calendar'), iso = d ? d.toISOString().slice(0, 10) : '';
    if (cal && iso) {
        for (const m of Array.isArray(cal.marks) ? cal.marks : []) if (m?.label && typeof m.date === 'string' && (m.date === iso || (m.yearly && m.date.slice(5) === iso.slice(5)))) out.push({ kind: 'mark', tod: '', title: m.label, who: [], where: '', tag: m.yearly ? '기념일' : '달력에 표시한 날', go: 'app:calendar' });
        const memo = cal.notes?.[iso]?.text; if (memo) out.push({ kind: 'memo', tod: '', title: memo, who: [], where: '', tag: '달력 메모', go: 'app:calendar' });
    }
    // what happened (folded from the chat): places, people met, the summary of the moment
    const mapOn = !!env.peek?.('map');
    for (const l of S.log ?? []) if (l.d === day) out.push(l.k === 'loc' ? { kind: 'loc', tod: l.t, title: l.v, who: [], where: '', tag: '지나온 곳', go: mapOn ? 'app:map' : 'app:scene' } : l.k === 'met' ? { kind: 'met', tod: l.t, title: `${l.v} 만남`, who: [], where: '', tag: '' } : { kind: 'gist', tod: l.t, title: l.v, who: [], where: '', tag: '있었던 일', go: 'app:scene' });
    return out;
}
// the promise keeps its «when» words for the clock ("…, tomorrow"); on the timeline the day already says it
const WHEN_TAIL = /\s*[,，]\s*(?:by |until |before |on |at |this |next |in )?(?:today|tonight|tomorrow(?: \w+)?|the day after tomorrow|\d+ (?:days?|weeks?)|(?:morning|afternoon|evening|night|week|weekend|month)|오늘|내일|모레|이따|주말|다음 ?주|다음 ?달)(?: (?:morning|afternoon|evening|night|아침|저녁|밤))?\s*$/i;
const isLog = (e) => e.kind === 'loc' || e.kind === 'gist' || e.kind === 'met';
const isPlan = (e) => !isLog(e) && e.kind !== 'done';

export default {
    api: 1,
    id: 'schedule',
    name: '일정',
    icon: '📆',
    color: '#7a6ad8',
    cost: 'tap',
    desc: '함께하는 일정 안에 고른 사람들의 일정이 색깔별로 들어가요. 약속 기한 · 달력에 표시한 날 · 지나온 곳도 같은 시간표에 모여요.',
    watch: ['time', 'date', 'loc', 'with', 'gist'],
    start: () => ({ ...newClock(), with: [], log: [] }),
    reduce(S, { k, v, i, watched }) {
        if (!watched) return;
        const add = (o) => { S.log.push({ d: S.day, t: S.tod ?? '', ...o }); if (S.log.length > MAX_LOG) S.log.shift(); };
        if (k === 'time' || k === 'date') { tick(S, k, v, i); return; }
        if (k === 'loc') { const r = clip(room(v), 60), last = S.log.filter((l) => l.k === 'loc').at(-1); if (r && !(last && last.v === r && last.d === S.day)) add({ k: 'loc', v: r }); return; }
        if (k === 'gist') { add({ k: 'gist', v: clip(v, 220) }); return; }
        if (k === 'with') {
            const t = String(v).trim(), before = S.with;
            if (none(t)) S.with = [];
            else if (t.startsWith('=')) S.with = names(t.slice(1)).filter((n) => !/^\(?(?:none|nobody|no one)\)?$/i.test(n)).slice(0, 12);
            else { S.with = [...S.with]; for (const part of t.split(/\s*[;/]\s*|\s+(?=[+-])/)) { const n = part.slice(1).trim(); if (part.startsWith('+') && n && !S.with.includes(n)) S.with.push(n); if (part.startsWith('-')) S.with = S.with.filter((x) => x !== n); } }
            const came = S.with.filter((n) => !before.includes(n));
            if (came.length) add({ k: 'met', v: clip(came.join(', '), 80) });
        }
    },
    // Today's plans in one or two short lines — only what the person put on the schedule (promises and marked days
    // are told by their own apps). Off with one switch.
    note(S, env) {
        if (env?.cfg?.tell === false) return null;
        // a person who is here is doing what the scene shows, not their usual week: habits are told only for people who are away
        const st = env.store ?? {}, me = env.user || 'the user', here = new Set([me, ...(S.with ?? [])]);
        const L = collect(S, env, S.day).filter((e) => (e.kind === 'own' && !e.done) || e.kind === 'rt').sort((a, b) => todIx(a.tod) - todIx(b.tod));
        if (!L.length) return null;
        const say = (e) => `${e.tod || 'any time'} — ${e.who.length ? e.who.join(' & ') : 'everyone together'}: ${e.title}${e.where ? ` (at ${e.where})` : ''}`;
        const cur = todIx(S.tod), plans = L.filter((e) => e.kind === 'own' || e.who.every((n) => n === me)).filter((e) => cur < 0 || todIx(e.tod) < 0 || todIx(e.tod) >= cur).slice(0, 5);
        const away = cur < 0 ? [] : L.filter((e) => e.kind === 'rt' && e.tod === S.tod && e.who.length && e.who.every((n) => !here.has(n)) && (st.sel ?? []).includes(e.who[0])).slice(0, 3);
        const state = [];
        if (plans.length) state.push(`On today's schedule (plans people remember; they can run late or change, but are not forgotten): ${plans.map(say).join(' ; ')}.`);
        if (away.length) state.push(`By habit, right now (${S.tod}): ${away.map((e) => `${e.who[0]} is ${e.where ? `at ${e.where}` : 'busy'} (${e.title})`).join(' ; ')}. Unless the story says otherwise.`);
        return state.length ? { state } : null;
    },
    hud(S, env) {
        const cur = todIx(S.tod), e = collect(S, env, S.day).filter((x) => x.kind === 'own' && !x.done && (todIx(x.tod) < 0 || cur < 0 || todIx(x.tod) >= cur)).sort((a, b) => todIx(a.tod) - todIx(b.tod))[0];
        return e ? [`📆 ${e.tod ? `${TOD_KO[e.tod]} · ` : ''}${clip(e.title, 14)}`] : [];
    },
    widget(S, env) {
        const L = collect(S, env, S.day).filter((e) => isPlan(e) && !e.done).sort((a, b) => todIx(a.tod) - todIx(b.tod)).slice(0, 4);
        return L.map((e) => `<div class="mb4-row"><span class="mb4-row-k">${e.tod ? TOD_KO[e.tod] : '오늘'}</span><span class="mb4-row-v">${esc(e.title)}${e.who.length ? ` <small>${e.who.map(esc).join(' · ')}</small>` : ''}</span></div>`).join('');
    },
    widgetTitle: '오늘 일정',
    css: `
.mb4-sch-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
.mb4-sch-day { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 0 6px; border: 0; border-radius: 999px; background: transparent; color: var(--fg) !important; min-width: 0; }
.mb4-sch-day small { font-size: 11px; color: var(--sub); }
.mb4-sch-day b { font-size: 15px; font-weight: 600; line-height: 1.2; }
.mb4-sch-day.rel b { font-size: 12px; }
.mb4-sch-day.today b { color: var(--a); font-weight: 800; }
.mb4-sch-day.on { background: var(--a); box-shadow: 0 4px 12px color-mix(in srgb, var(--a) 35%, transparent); }
.mb4-sch-day.on small, .mb4-sch-day.on b { color: #fff; }
.mb4-sch-day.out { opacity: .3; pointer-events: none; }
.mb4-sch-dots { display: flex; gap: 2px; height: 5px; }
.mb4-sch-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--c, var(--a)); }
.mb4-sch-day.on .mb4-sch-dots i { background: #fff; }
.mb4-sch-head { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; }
.mb4-sch-head b { flex: 1; font-size: 15px; font-weight: 700; }
.mb4-sch-nav { min-width: 30px; height: 28px; padding: 0 9px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--a) !important; font-size: 12.5px !important; font-weight: 700 !important; }
.mb4-sch-who { display: flex; gap: 8px; overflow-x: auto; margin: 0 -14px 12px; padding: 2px 14px 4px; scrollbar-width: none; }
.mb4-sch-who::-webkit-scrollbar { display: none; }
.mb4-sch-p { flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px; width: 52px; padding: 0; border: 0; background: none; color: var(--fg) !important; }
.mb4-sch-p i { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; font-style: normal; font-size: 20px; background: color-mix(in srgb, var(--c) 16%, var(--card)); box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--c); }
.mb4-sch-p span { max-width: 52px; font-size: 11px; line-height: 1.25; overflow-wrap: anywhere; text-align: center; }
.mb4-sch-p.off { opacity: .38; } .mb4-sch-p.off i { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--line); }
.mb4-sch-p.plus i { box-shadow: none; border: 1.5px dashed var(--sub); background: transparent; color: var(--sub); }
.mb4-sch-slot { display: grid; grid-template-columns: 46px 1fr; gap: 0 6px; padding: 4px 0; }
.mb4-sch-slot.now { margin: 2px -14px; padding: 8px 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--a) 20%, transparent), color-mix(in srgb, var(--a) 5%, transparent)); border-top: 1.5px solid var(--a); }
.mb4-sch-t { padding-top: 3px; font-size: 12px; font-weight: 700; color: var(--sub); }
.mb4-sch-slot.now .mb4-sch-t { color: var(--a); }
.mb4-sch-t small { display: block; font-size: 10px; font-weight: 800; }
.mb4-sch-evs { min-width: 0; }
.mb4-sch-ev { position: relative; display: flex; align-items: flex-start; gap: 8px; padding: 0 0 12px 24px; --c: var(--a); }
.mb4-sch-ev::before { content: ''; position: absolute; left: 8px; top: 20px; bottom: -2px; width: 2px; border-radius: 2px; background: color-mix(in srgb, var(--c) 55%, transparent); }
.mb4-sch-evs > .mb4-sch-ev:last-child::before { bottom: 6px; }
.mb4-sch-dot { position: absolute; left: 0; top: 1px; display: grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 2px solid var(--c); border-radius: 50%; background: var(--card); color: #fff !important; font-size: 10px !important; font-style: normal; line-height: 1; }
.mb4-sch-dot::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
.mb4-sch-ev.done .mb4-sch-dot { background: var(--c); } .mb4-sch-ev.done .mb4-sch-dot::after { content: '✓'; width: auto; height: auto; background: none; }
.mb4-sch-ev.log .mb4-sch-dot { width: 12px; height: 12px; left: 3px; top: 4px; border-width: 2px; } .mb4-sch-ev.log .mb4-sch-dot::after { display: none; }
.mb4-sch-b { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.mb4-sch-b b { display: block; font-size: 14.5px; font-weight: 700; line-height: 1.35; color: color-mix(in srgb, var(--c) 72%, var(--fg)); }
.mb4-sch-ev.done .mb4-sch-b b { text-decoration: line-through; opacity: .6; }
.mb4-sch-ev.log .mb4-sch-b b { font-size: 13px; font-weight: 500; color: var(--fg); opacity: .8; }
.mb4-sch-m { display: block; margin-top: 2px; font-size: 12px; color: var(--sub); line-height: 1.4; }
.mb4-sch-go { flex: none; min-height: 26px; padding: 2px 9px; border: 0; border-radius: 999px; background: var(--fill, rgba(120, 120, 128, .14)); color: var(--sub) !important; font-size: 11.5px !important; white-space: nowrap; }
.mb4-sch-free { padding: 2px 0 10px 24px; font-size: 12.5px; color: var(--sub); }
.mb4-sch-next { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 8px 0; border: 0; background: none; text-align: left; color: var(--fg) !important; }
.mb4-sch-next + .mb4-sch-next { border-top: 1px solid var(--line); }
.mb4-sch-next > small { flex: none; min-width: 62px; color: var(--a); font-weight: 700; font-size: 12px; }
.mb4-sch-next span { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 13.5px; }
.mb4-sch-chks { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
.mb4-sch-chk { position: relative; }
.mb4-sch-chk input { position: absolute; opacity: 0; pointer-events: none; }
.mb4-sch-chk span { display: inline-block; padding: 5px 11px; border: 1px solid var(--line); border-radius: 999px; font-size: 13px; }
.mb4-sch-chk input:checked + span { background: var(--c, var(--a)); border-color: var(--c, var(--a)); color: #fff; font-weight: 700; }
.mb4-sch-chk input:focus-visible + span { outline: 2px solid var(--a); outline-offset: 1px; }
.mb4-sch-rt { display: flex; align-items: baseline; gap: 6px; padding: 5px 0; font-size: 13px; }
.mb4-sch-rt small { flex: none; min-width: 74px; color: var(--sub); }
.mb4-sch-rt span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.mb4-sch-ph { display: flex; align-items: center; gap: 8px; margin: 10px 0 2px; padding-top: 10px; border-top: 1px solid var(--line); }
.mb4-sch-ph:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.mb4-sch-ph b { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.mb4-sch-ph i { width: 10px; height: 10px; border-radius: 50%; background: var(--c); flex: none; }
`,
    render(el, api) {
        const env = api.env, st = api.store, S = api.state(), k = api.kit, me = env.user || '나';
        st.items = Array.isArray(st.items) ? st.items.filter((x) => x && x.what) : [];
        st.rt = st.rt && typeof st.rt === 'object' ? st.rt : {};
        st.sel = Array.isArray(st.sel) ? st.sel.filter((n) => n && n !== me).slice(0, MAX_SEL) : [];
        st.off = st.off && typeof st.off === 'object' ? st.off : {};
        const scene = env.peek('scene'), start = env.peekStore?.('calendar')?.start ?? '';
        const today = S.day, pick = Number.isFinite(st.pick) && st.pick >= 1 ? st.pick : today;
        const order = [me, ...st.sel], colorOf = (n) => (n === ALL ? 'var(--a)' : order.includes(n) ? PAL[order.indexOf(n) % PAL.length] : 'var(--sub)');
        const evColor = (e) => (isLog(e) ? 'var(--sub)' : e.who.length ? colorOf(e.who.find((n) => order.includes(n)) ?? e.who[0]) : 'var(--a)');
        const shown = (e) => (isLog(e) ? !st.off.log : e.who.length ? e.who.some((n) => (order.includes(n) ? !st.off[n] : !st.off[ALL])) : !st.off[ALL]);

        // ── the week strip ──
        const pd = dateAt(S, pick, start), first = pd ? pick - pd.getUTCDay() : pick - 3;
        const strip = Array.from({ length: 7 }, (_x, n) => first + n).map((day) => {
            if (day < 1) return '<span class="mb4-sch-day out"><small>&nbsp;</small><b>·</b><span class="mb4-sch-dots"></span></span>';
            const d = dateAt(S, day, start), L = collect(S, env, day).filter((e) => isPlan(e) && shown(e));
            const dots = [...new Set(L.map(evColor))].slice(0, 3).map((c) => `<i style="--c:${c}"></i>`).join('');
            return `<button class="mb4-sch-day${day === pick ? ' on' : ''}${day === today ? ' today' : ''}${d ? '' : ' rel'}" data-act="pick" data-v="${day}" aria-label="${esc(dayName(S, day, start))}"><small>${d ? WD[d.getUTCDay()] : '&nbsp;'}</small><b>${d ? d.getUTCDate() : esc(rel(day - today))}</b><span class="mb4-sch-dots">${dots}</span></button>`;
        }).join('');
        const title = pd ? `${pd.getUTCFullYear()}년 ${pd.getUTCMonth() + 1}월` : '이야기 시간표';

        // ── who is on the timeline ──
        const chip = (key, label, ico, c) => `<button class="mb4-sch-p${st.off[key] ? ' off' : ''}" style="--c:${c}" data-act="flt" data-v="${esc(key)}" aria-pressed="${st.off[key] ? 'false' : 'true'}"><i>${ico}</i><span>${esc(label)}</span></button>`;
        const who = `<div class="mb4-sch-who">${chip(ALL, '함께', '👥', 'var(--a)')}${order.map((n) => chip(n, n === me ? `${n} (나)` : n, face(n), colorOf(n))).join('')}${chip('log', '지난 일', '📒', 'var(--sub)')}<button class="mb4-sch-p plus" data-act="open" data-v="ppl"><i>＋</i><span>고르기</span></button></div>`;

        // ── the day ──
        const L = collect(S, env, pick).filter(shown);
        const whoLine = (e) => (isLog(e) ? '' : e.who.length ? e.who.map((n) => `${face(n)} ${esc(n)}`).join(' · ') : '👥 함께');
        const ev = (e) => `<div class="mb4-sch-ev${e.done ? ' done' : ''}${isLog(e) ? ' log' : ''}" style="--c:${evColor(e)}">
            ${e.kind === 'own' ? `<button class="mb4-sch-dot" data-act="done" data-v="${e.n}" aria-label="${e.done ? '끝냄 풀기' : '끝냄'}"></button>` : '<i class="mb4-sch-dot"></i>'}
            <div class="mb4-sch-b"><b>${esc(e.title)}</b>${e.where ? `<span class="mb4-sch-m">📍 ${esc(e.where)}</span>` : ''}${[whoLine(e), esc(e.tag)].filter(Boolean).length ? `<span class="mb4-sch-m">${[whoLine(e), e.late ? `<span class="mb4-bad">${esc(e.tag)}</span>` : esc(e.tag)].filter(Boolean).join(' · ')}</span>` : ''}</div>
            ${e.go && api.isOn(e.go.slice(4)) ? `<button class="mb4-sch-go" data-act="go" data-v="${e.go}">${{ 'app:todo': '📌', 'app:calendar': '📅', 'app:map': '🗺', 'app:scene': '🧭' }[e.go]} ›</button>` : ''}</div>`;
        const slotIds = ['', ...TOD], nowTod = pick === today ? S.tod : '';
        const slots = slotIds.map((t) => {
            const inSlot = L.filter((e) => (e.tod ?? '') === t), now = !!t && t === nowTod;
            if (!inSlot.length && !now) return '';
            return `<div class="mb4-sch-slot${now ? ' now' : ''}"><div class="mb4-sch-t">${now ? '<small>지금</small>' : ''}${t ? TOD_KO[t] : '하루<br>종일'}</div><div class="mb4-sch-evs">${inSlot.map(ev).join('') || '<div class="mb4-sch-free">비어 있어요</div>'}</div></div>`;
        }).join('');
        const dayCard = card(`${esc(dayName(S, pick, start))}${pick !== today && pd ? ` <small>${esc(rel(pick - today))}</small>` : ''}`, slots || empty('🫧', '이 날은 비어 있어요', '아래 「＋ 일정 넣기」로 채워요'));

        // ── what is coming (the next two weeks, from every app) ──
        const next = [];
        for (let day = today + 1; day <= today + 14 && next.length < 5; day++) for (const e of collect(S, env, day)) if (e.kind !== 'rt' && isPlan(e) && shown(e) && next.length < 5) next.push({ day, e });
        const late = (env.peek('todo')?.open ?? []).filter((p) => p.due != null && p.due < today).length;
        const nextCard = next.length || late ? card('다가오는 일정', `${late ? `<button class="mb4-sch-next" data-act="go" data-v="app:todo"><small class="mb4-bad">⏰ 지남</small><span>기한이 지난 약속 ${late}개</span></button>` : ''}${next.map(({ day, e }) => `<button class="mb4-sch-next" data-act="pick" data-v="${day}"><small>${esc(dateAt(S, day, start) ? `${dateAt(S, day, start).getUTCMonth() + 1}/${dateAt(S, day, start).getUTCDate()} ${WD[dateAt(S, day, start).getUTCDay()]}` : rel(day - today))}</small><span>${esc(e.title)}${e.tag ? ` <small class="mb4-dim">${esc(e.tag)}</small>` : ''}</span></button>`).join('')}`) : '';

        // ── add ──
        const dayOpts = Array.from({ length: 15 }, (_x, n) => today + n).concat(pick < today || pick > today + 14 ? [pick] : []).sort((a, b) => a - b).map((day) => `<option value="${day}" ${day === pick ? 'selected' : ''}>${esc(dayName(S, day, start))}${day === today && dateAt(S, day, start) ? ' · 오늘' : ''}</option>`).join('');
        const places = [...new Set([...(S.log ?? []).filter((l) => l.k === 'loc').map((l) => l.v), ...Object.values(env.peek('map')?.P ?? {}).map((p) => p?.name).filter(Boolean)])].slice(-30);
        const addCard = `<details class="mb4-card" ${st.open === 'add' ? 'open' : ''} data-box="add"><summary>＋ 일정 넣기</summary>
            <input class="mb4-input" data-f="what" maxlength="60" placeholder="무엇을 하나요">
            <div class="mb4-sch-chks" role="group" aria-label="누구 일정인가요">${order.map((n) => `<label class="mb4-sch-chk" style="--c:${colorOf(n)}"><input type="checkbox" data-w="${esc(n)}"><span>${face(n)} ${esc(n)}</span></label>`).join('')}</div>
            ${hint('아무도 안 고르면 「함께」하는 일정이에요.')}
            <div class="mb4-btnrow"><select class="mb4-input" data-f="day" aria-label="날">${dayOpts}</select><select class="mb4-input" data-f="tod" aria-label="때"><option value="">하루 종일</option>${TOD.map((t) => `<option value="${t}" ${t === (pick === today ? S.tod : 'morning') ? 'selected' : ''}>${TOD_KO[t]}</option>`).join('')}</select></div>
            <input class="mb4-input" data-f="where" maxlength="60" placeholder="어디서 (비워도 돼요)" list="mb4-sch-places"><datalist id="mb4-sch-places">${places.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
            <div class="mb4-btnrow"><select class="mb4-input" data-f="rep" aria-label="되풀이"><option value="once">한 번만</option><option value="daily">매일</option><option value="weekly">매주 이 요일</option></select><button class="mb4-btn" data-act="add">넣기</button></div></details>`;

        // ── people and their week ──
        const known = [...new Set([...(scene?.with ?? []), ...Object.values(env.peek('people')?.list ?? {}).filter((p) => p && !p.gone).map((p) => p.name), ...st.sel])].filter((n) => n && n !== me).slice(0, 30);
        const rtRows = (key) => (st.rt[key] ?? []).map((r, n) => `<div class="mb4-sch-rt"><small>${esc(wdText(r))} ${r.tod ? TOD_KO[r.tod] : ''}</small><span>${esc(r.what)}${r.where ? ` <small class="mb4-dim">📍 ${esc(r.where)}</small>` : ''}</span><button class="mb4-x" data-act="rtdel" data-v="${esc(`${key}|${n}`)}" aria-label="지우기">✕</button></div>`).join('');
        const weekOf = [ALL, ...order].filter((key) => key !== ALL || (st.rt[ALL] ?? []).length).map((key) => `<div class="mb4-sch-ph" style="--c:${colorOf(key)}"><i></i><b>${key === ALL ? '함께' : esc(key)}</b>${key !== ALL && key !== me ? `<button class="mb4-btn ghost sm" data-act="ai" data-v="${esc(key)}">🪄 일주일 짜기</button>` : ''}</div>${rtRows(key) || `<p class="mb4-hint">${key === me ? '내가 늘 하는 일은 위 「＋ 일정 넣기」에서 「매일 · 매주」로 넣어요.' : '아직 늘 하는 일이 없어요.'}</p>`}`).join('');
        const pplCard = `<details class="mb4-card" ${st.open === 'ppl' ? 'open' : ''} data-box="ppl"><summary>👥 함께 보는 사람 · 늘 하는 일</summary>
            ${known.length ? `<div class="mb4-sch-chks">${known.map((n) => `<label class="mb4-sch-chk" style="--c:${st.sel.includes(n) ? colorOf(n) : 'var(--a)'}"><input type="checkbox" data-act="sel" data-v="${esc(n)}" ${st.sel.includes(n) ? 'checked' : ''}><span>${face(n)} ${esc(n)}</span></label>`).join('')}</div>` : hint('이야기에 사람이 나오면 여기서 고를 수 있어요.')}
            ${hint(`고른 사람(${MAX_SEL}명까지)의 일정이 자기 색으로 시간표에 들어가요. 🪄는 그 사람의 일주일을 AI가 한 번 짜 줘요.`)}
            ${weekOf}</details>`;

        el.innerHTML = `${scene ? '' : card('', '🧭 장면 앱을 켜야 이야기 속 날과 때가 흘러요. 지금은 넣은 일정만 보여 줘요.', 'warn')}
        ${card('', `<div class="mb4-sch-head"><b>${esc(title)}</b><button class="mb4-sch-nav" data-act="pick" data-v="${Math.max(1, pick - 7)}" aria-label="앞 주">‹</button>${pick !== today ? `<button class="mb4-sch-nav" data-act="pick" data-v="${today}">오늘</button>` : ''}<button class="mb4-sch-nav" data-act="pick" data-v="${pick + 7}" aria-label="다음 주">›</button></div><div class="mb4-sch-strip">${strip}</div>`)}
        ${who}${dayCard}${nextCard}${addCard}${pplCard}
        <label class="mb4-sw"><span><b>오늘 일정을 AI에게도 알려 주기</b><small>내가 넣은 오늘 일정과, 고른 사람이 지금 늘 있는 곳을 한두 줄로 보내요. 끄면 화면에만 보여요.</small></span><input type="checkbox" data-act="tell" ${api.cfg.tell !== false ? 'checked' : ''}><i></i></label>
        ${hint('📌 약속의 기한 · 📅 달력에 표시한 날과 메모 · 🧭 지나온 곳과 요약이 같은 시간표에 모여요. 옆의 작은 단추를 누르면 그 앱으로 가요.')}`;

        api.menu([{ sec: '이어진 앱' }, ...[['map', '🗺', '지도', '지나온 곳을 노선도로'], ['record', '📒', '기록', '답마다 무엇이 적혔는지'], ['scene', '🧭', '장면', '지금 언제 · 어디 · 누구와']].filter(([id]) => api.isOn(id)).map(([id, icon, label, sub]) => ({ icon, label, sub, act: () => api.go(`app:${id}`) }))]);

        const save = () => { api.save(); api.redraw(); };
        const rtText = (r) => `${wdText(r)} | ${r.tod ? TOD_KO[r.tod] : ''} | ${r.what} | ${r.where ?? ''}`;
        k.editMore(el, api, [
            { name: 'item', list: st.items, max: 30, label: (x) => `${dayName(S, x.day, start)}${x.tod ? ` ${TOD_KO[x.tod]}` : ''} · ${x.who?.length ? x.who.join(' · ') : '함께'}`, get: (x) => x.what, set: (x, t) => { x.what = t.slice(0, 60); } },
            { name: 'where', list: st.items.filter((x) => x.where), max: 30, del: false, label: (x) => `${x.what}: 어디서`, get: (x) => x.where, set: (x, t) => { x.where = t.slice(0, 60); } },
            ...[ALL, ...order].map((key) => ({ name: `rt-${key}`, list: st.rt[key], label: () => `${key === ALL ? '함께' : key}: 요일 | 때 | 무엇 | 어디`, get: rtText, set: (r, t) => parseRoutine(t)[0] })),
        ]);
        el.querySelectorAll('details[data-box]').forEach((d) => d.addEventListener('toggle', () => { st.open = d.open ? d.dataset.box : st.open === d.dataset.box ? '' : st.open; }));
        acts(el, {
            pick: (v) => { st.pick = Math.max(1, +v || today); api.redraw(); },
            flt: (v) => { if (st.off[v]) delete st.off[v]; else st.off[v] = true; save(); },
            open: (v) => { st.open = v; api.redraw(); },
            go: (v) => api.go(v),
            tell: (_v, b) => { api.cfg.tell = b.checked; api.save(); },
            done: (n) => { const x = st.items[+n]; if (x) { x.done = !x.done; save(); } },
            sel: (n, b) => {
                if (b.checked && !st.sel.includes(n)) { if (st.sel.length >= MAX_SEL) { api.toast(`${MAX_SEL}명까지 고를 수 있어요.`); b.checked = false; return; } st.sel.push(n); }
                else if (!b.checked) { st.sel = st.sel.filter((x) => x !== n); delete st.off[n]; }
                st.open = 'ppl'; save();
            },
            rtdel: (v) => { const cut = v.lastIndexOf('|'), key = v.slice(0, cut); st.rt[key]?.splice(+v.slice(cut + 1), 1); if (!st.rt[key]?.length) delete st.rt[key]; st.open = 'ppl'; save(); },
            add: () => {
                const what = val(el, '[data-f="what"]'), day = +val(el, '[data-f="day"]') || pick, tod = val(el, '[data-f="tod"]'), where = val(el, '[data-f="where"]'), rep = val(el, '[data-f="rep"]');
                const whoPicked = [...el.querySelectorAll('[data-w]')].filter((x) => x.checked).map((x) => x.dataset.w);
                if (!what) { api.toast('무엇을 하는지 적어 주세요.'); return; }
                if (rep === 'once') { st.items.push({ id: Date.now().toString(36), day, tod, what: what.slice(0, 60), who: whoPicked, where: where.slice(0, 60) }); if (st.items.length > MAX_ITEMS) st.items.splice(0, st.items.length - MAX_ITEMS); }
                else {
                    const d = dateAt(S, day, start), wd = rep === 'weekly' && d ? [d.getUTCDay()] : [];
                    if (rep === 'weekly' && !d) api.toast('이야기 속 요일을 아직 몰라서 「매일」로 넣었어요.');
                    for (const key of whoPicked.length ? whoPicked : [ALL]) { const R = (st.rt[key] ??= []); R.push({ wd, tod, what: what.slice(0, 60), where: where.slice(0, 60) }); if (R.length > MAX_RT) R.shift(); }
                }
                st.pick = day; st.open = ''; save();
            },
            // one model call, only because this button was pressed: a plausible week for one person
            ai: async (name, b) => {
                b.disabled = true; b.textContent = '짜는 중…';
                const about = env.peek('people')?.list?.[name]?.about ?? '';
                const answer = await api.ask(`Write a plausible weekly routine for ${name}, a character in an ongoing story: where they usually are and what they do there.\nGive 5 to 8 lines, one per line, exactly in this shape:\ndays | time | what | where\ndays: "every", or weekdays out of Mon Tue Wed Thu Fri Sat Sun separated by commas. time: one of dawn, morning, noon, afternoon, evening, night, midnight. what: a few words. where: a place the story already has when one fits, otherwise a short place name.\nWrite "what" and "where" in the language the story is written in. Keep to what is known about ${name}; nothing that contradicts it. No other text.\n\n[What is known]\n${api.facts() || '(nothing recorded)'}${about ? `\n\n[About ${name}]\n${about}` : ''}\n\n[Latest part of the story]\n${clip(env.recent(1)[0] ?? '', 1500)}`, 500);
                const rows = parseRoutine(answer).map((r) => ({ ...r, ai: true }));
                st.open = 'ppl';
                if (!rows.length) { api.toast('받지 못했어요. 멈춤 중이 아닌지 보고 다시 눌러 주세요.'); api.redraw(); return; }
                st.rt[name] = [...(st.rt[name] ?? []).filter((r) => !r.ai), ...rows].slice(-MAX_RT);
                save();
            },
        });
    },
};
