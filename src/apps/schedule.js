// 📆 Schedule: one clean timeline per story day — the time on the left, a coloured dot and line per plan, and
// what / where / who / when beside it. Each picked person has their own colour; the current time of day is marked.
// 「🪄 이번 주 다 짜기」 fills the whole week for everyone in ONE model call (only when pressed). Promise deadlines
// (📌) and marked days (📅) from the other apps show on the same line. The story clock is WATCHED from 🧭 Scene's
// lines (nothing new is asked of the reader), so swipes and deletions move «today» like every other record.
import { clip } from '../core/text.js';
import { tick, newClock, dayDate } from '../core/clock.js';
import { esc, card, hint, acts, val, face, TOD, TOD_KO } from '../ui/kit.js';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const PAL = ['#f08c2e', '#7a6ad8', '#22b07d', '#ef5da8', '#3a8ee6', '#16a3a8', '#c98a00'];
const MAX_SEL = 6, MAX_ITEMS = 300;
const todIx = (t) => TOD.indexOf(t);

// ───── days ─────
const dateAt = (S, day, start) => { const t = dayDate(S, day, start); return t == null ? null : new Date(t); };
const rel = (n) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : n > 0 ? `${n}일 뒤` : `${-n}일 전`);
const dayName = (S, day, start) => { const d = dateAt(S, day, start); return d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WD[d.getUTCDay()]}요일` : rel(day - S.day); };
// The seven story days shown together: Sunday to Saturday when the dates are known, else today and the next six.
export function weekOf(S, day, start) { const d = dateAt(S, day, start), first = d ? day - d.getUTCDay() : day; return Array.from({ length: 7 }, (_x, n) => first + n); }

// ───── the model's week: "D3 | who | time | what | where" ─────
const TOGETHER = /^(?:together|everyone|all|both|함께|다 ?같이|같이|모두)$/i;
export function parsePlan(text, days, people) {
    const out = [], low = new Map(people.map((n) => [n.toLowerCase(), n]));
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const p = raw.replace(/^[\s\-*•]+/, '').split('|').map((x) => x.trim());
        if (p.length < 4 || !p[3]) continue;
        const dn = p[0].match(/^D?\s*(\d)/i), day = dn ? days[+dn[1] - 1] : undefined;
        if (day == null) continue;
        let who = [];
        if (!TOGETHER.test(p[1])) { who = p[1].split(/\s*(?:&|,|，|\+| and |·)\s*/).map((n) => low.get(n.toLowerCase())).filter(Boolean); if (!who.length) continue; }
        const tl = p[2].toLowerCase(), tod = TOD.find((t) => new RegExp(`\\b${t}\\b`).test(tl)) ?? Object.entries(TOD_KO).find(([, ko]) => p[2].includes(ko))?.[0] ?? '';
        out.push({ day, tod, who: [...new Set(who)], what: clip(p[3], 60), where: clip(p[4] ?? '', 60), ai: true });
        if (out.length >= 70) break;
    }
    return out;
}

// ───── everything on one story day ─────
// -> [{ kind: 'own'|'due'|'done'|'mark'|'memo', tod, title, who: [], where, tag, go?, n?, done?, late? }]
export function collect(S, env, day) {
    const st = env.store ?? {}, out = [];
    const start = env.peekStore?.('calendar')?.start ?? '', d = dateAt(S, day, start);
    (st.items ?? []).forEach((x, n) => { if (x?.day === day && x.what) out.push({ kind: 'own', n, tod: x.tod ?? '', title: x.what, who: x.who ?? [], where: x.where ?? '', done: !!x.done, ai: !!x.ai, tag: '' }); });
    const todo = env.peek?.('todo');
    const cut = (w) => { const t = String(w), i = t.indexOf('='); return i < 0 ? t : t.slice(i + 1).trim().replace(WHEN_TAIL, ''); };
    for (const p of todo?.open ?? []) if (p.due === day) out.push({ kind: 'due', tod: '', title: cut(p.what), who: [], where: '', tag: day < S.day ? '약속 기한 지남' : '약속 기한', go: 'app:todo', late: day < S.day });
    for (const p of todo?.closed ?? []) if (p.end === day) out.push({ kind: 'done', tod: '', title: cut(p.what), who: [], where: '', tag: p.st === 'broken' ? '약속 어김' : p.st === 'cancelled' ? '약속 취소' : '약속 지킴', go: 'app:todo', done: true });
    const cal = env.peekStore?.('calendar'), iso = d ? d.toISOString().slice(0, 10) : '';
    if (cal && iso) {
        for (const m of Array.isArray(cal.marks) ? cal.marks : []) if (m?.label && typeof m.date === 'string' && (m.date === iso || (m.yearly && m.date.slice(5) === iso.slice(5)))) out.push({ kind: 'mark', tod: '', title: m.label, who: [], where: '', tag: m.yearly ? '기념일' : '달력', go: 'app:calendar' });
        const memo = cal.notes?.[iso]?.text; if (memo) out.push({ kind: 'memo', tod: '', title: memo, who: [], where: '', tag: '달력 메모', go: 'app:calendar' });
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
    desc: '하루를 한 줄 타임라인으로, 사람마다 색깔로 보여 줘요. 🪄 한 번이면 이번 주를 다 짜 줘요.',
    watch: ['time', 'date'],
    start: () => newClock(),
    reduce(S, { k, v, i, watched }) { if (watched && (k === 'time' || k === 'date')) tick(S, k, v, i); },
    // Today's plans in one or two short lines; off with one switch.
    note(S, env) {
        if (env?.cfg?.tell === false) return null;
        const me = env.user || 'the user', here = new Set([me, ...(env.peek?.('scene')?.with ?? [])]), cur = todIx(S.tod);
        const L = collect(S, env, S.day).filter((e) => e.kind === 'own' && !e.done).sort((a, b) => todIx(a.tod) - todIx(b.tod));
        if (!L.length) return null;
        const say = (e) => `${e.tod || 'any time'} — ${e.who.length ? e.who.join(' & ') : 'everyone together'}: ${e.title}${e.where ? ` (at ${e.where})` : ''}`;
        // what is still ahead for the people in this scene; for people elsewhere, only where they are right now
        const plans = L.filter((e) => (cur < 0 || todIx(e.tod) < 0 || todIx(e.tod) >= cur) && (!e.who.length || e.who.some((n) => here.has(n)))).slice(0, 5);
        const away = cur < 0 ? [] : L.filter((e) => e.tod === S.tod && e.who.length && e.who.every((n) => !here.has(n))).slice(0, 3);
        const state = [];
        if (plans.length) state.push(`On today's schedule (plans people remember; they can run late or change, but are not forgotten): ${plans.map(say).join(' ; ')}.`);
        if (away.length) state.push(`Right now (${S.tod}), elsewhere by their schedule: ${away.map((e) => `${e.who.join(' & ')} — ${e.title}${e.where ? ` at ${e.where}` : ''}`).join(' ; ')}. Unless the story says otherwise.`);
        return state.length ? { state } : null;
    },
    hud(S, env) {
        const cur = todIx(S.tod), e = collect(S, env, S.day).filter((x) => x.kind === 'own' && !x.done && (todIx(x.tod) < 0 || cur < 0 || todIx(x.tod) >= cur)).sort((a, b) => todIx(a.tod) - todIx(b.tod))[0];
        return e ? [`📆 ${e.tod ? `${TOD_KO[e.tod]} · ` : ''}${clip(e.title, 14)}`] : [];
    },
    widget(S, env) {
        const L = collect(S, env, S.day).filter((e) => !e.done && e.kind !== 'memo').sort((a, b) => todIx(a.tod) - todIx(b.tod)).slice(0, 4);
        return L.map((e) => `<div class="mb4-row"><span class="mb4-row-k">${e.tod ? TOD_KO[e.tod] : '오늘'}</span><span class="mb4-row-v">${esc(e.title)} <small>${e.who.length ? e.who.map(esc).join(' · ') : e.tag ? esc(e.tag) : '함께'}</small></span></div>`).join('');
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
.mb4-sch-magic { display: block; width: 100%; margin: 12px 0 0; min-height: 42px; border: 0; border-radius: 14px; background: var(--a); color: #fff !important; font-size: 14.5px !important; font-weight: 700 !important; }
.mb4-sch-magic:disabled { opacity: .6; }
.mb4-phone .mb4-sch-magic small { display: block; font-size: 11px; font-weight: 500; color: rgba(255, 255, 255, .85) !important; }
.mb4-sch-who { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 14px; }
.mb4-sch-pk { display: inline-flex; align-items: center; gap: 4px; padding: 4px 11px 4px 6px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--sub) !important; font-size: 13px !important; }
.mb4-sch-pk i { font-style: normal; font-size: 16px; }
.mb4-sch-pk.on { border-color: var(--c); color: var(--c) !important; font-weight: 700 !important; }
.mb4-sch-pk.me { cursor: default; }
.mb4-sch-tl { margin: 4px 0 8px; }
.mb4-sch-ev { position: relative; display: grid; grid-template-columns: 54px 30px 1fr; --c: var(--a); }
.mb4-sch-t { padding-top: 3px; font-size: 12.5px; font-weight: 700; color: var(--sub); white-space: nowrap; }
.mb4-sch-rail { position: relative; display: flex; justify-content: center; }
.mb4-sch-rail::after { content: ''; position: absolute; top: 26px; bottom: 2px; left: 50%; width: 2px; margin-left: -1px; border-radius: 2px; background: var(--c); }
.mb4-sch-ev:last-child .mb4-sch-rail::after { bottom: 14px; }
.mb4-sch-dot { position: relative; z-index: 1; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 2px solid var(--c); border-radius: 50%; background: var(--card); color: var(--c) !important; font-size: 12px !important; font-weight: 800 !important; line-height: 1; }
.mb4-sch-dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
.mb4-sch-ev.done .mb4-sch-dot::after { content: '✓'; width: auto; height: auto; background: none; font-size: 13px; }
.mb4-sch-ev.tag .mb4-sch-dot::after { width: 6px; height: 6px; }
.mb4-sch-b { min-width: 0; padding: 1px 0 18px 6px; overflow-wrap: anywhere; }
.mb4-sch-b > b { display: block; margin-bottom: 4px; font-size: 15.5px; font-weight: 750; line-height: 1.3; color: var(--c); }
.mb4-sch-ev.done .mb4-sch-b > b { opacity: .55; text-decoration: line-through; }
.mb4-sch-m { display: flex; align-items: baseline; gap: 7px; font-size: 12.5px; line-height: 1.55; color: var(--sub); }
.mb4-sch-m i { flex: none; width: 14px; font-style: normal; font-size: 11px; text-align: center; }
.mb4-sch-go { margin-left: 4px; padding: 0; border: 0; background: none; color: var(--a) !important; font-size: 12px !important; font-weight: 700 !important; }
.mb4-sch-now { position: relative; margin: 0 -14px; padding: 12px 14px 0; background: linear-gradient(180deg, color-mix(in srgb, var(--a) 16%, transparent), transparent 85%); }
.mb4-sch-now::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1.5px; background: var(--a); }
.mb4-sch-now::after { content: ''; position: absolute; left: 10px; top: -6px; width: 13px; height: 13px; border-radius: 50%; background: var(--a); }
.mb4-sch-now > small { position: absolute; right: 14px; top: 3px; font-size: 10.5px; font-weight: 800; color: var(--a); }
.mb4-sch-empty { padding: 26px 0 18px; text-align: center; color: var(--sub); font-size: 13px; }
.mb4-sch-chks { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
.mb4-sch-chk { position: relative; }
.mb4-sch-chk input { position: absolute; opacity: 0; pointer-events: none; }
.mb4-sch-chk span { display: inline-block; padding: 5px 11px; border: 1px solid var(--line); border-radius: 999px; font-size: 13px; }
.mb4-sch-chk input:checked + span { background: var(--c, var(--a)); border-color: var(--c, var(--a)); color: #fff; font-weight: 700; }
.mb4-sch-chk input:focus-visible + span { outline: 2px solid var(--a); outline-offset: 1px; }
`,
    render(el, api) {
        const env = api.env, st = api.store, S = api.state(), k = api.kit, me = env.user || '나';
        st.items = Array.isArray(st.items) ? st.items.filter((x) => x && x.what) : [];
        st.sel = Array.isArray(st.sel) ? st.sel.filter((n) => n && n !== me).slice(0, MAX_SEL) : [];
        const scene = env.peek('scene'), start = env.peekStore?.('calendar')?.start ?? '';
        const people = env.peek('people')?.list ?? {};
        const today = S.day, pick = Number.isFinite(st.pick) && st.pick >= 1 ? st.pick : today;
        // candidates: who is here now, then everyone the story has met (picked ones first)
        const known = [...new Set([...st.sel, ...(scene?.with ?? []), ...Object.values(people).filter((p) => p && !p.gone).sort((a, b) => (b.i ?? 0) - (a.i ?? 0)).map((p) => p.name)])].filter((n) => n && n !== me).slice(0, 16);
        // the first time: the people in the scene (or the newest few) are picked for you
        if (!st.seeded) { st.seeded = true; if (!st.sel.length) st.sel = known.slice(0, 3); }
        const order = [me, ...st.sel], colorOf = (n) => (order.includes(n) ? PAL[order.indexOf(n) % PAL.length] : 'var(--sub)');

        // ── week strip ──
        const week = weekOf(S, pick, start), pd = dateAt(S, pick, start);
        const strip = week.map((day) => {
            if (day < 1) return '<span class="mb4-sch-day out"><small>&nbsp;</small><b>·</b><span class="mb4-sch-dots"></span></span>';
            const d = dateAt(S, day, start), L = collect(S, env, day);
            const cs = [...new Set(L.map((e) => (e.kind !== 'own' || !e.who.length ? 'var(--a)' : colorOf(e.who[0]))))].slice(0, 3);
            return `<button class="mb4-sch-day${day === pick ? ' on' : ''}${day === today ? ' today' : ''}${d ? '' : ' rel'}" data-act="pick" data-v="${day}" aria-label="${esc(dayName(S, day, start))}"><small>${d ? WD[d.getUTCDay()] : '&nbsp;'}</small><b>${d ? d.getUTCDate() : esc(rel(day - today))}</b><span class="mb4-sch-dots">${cs.map((c) => `<i style="--c:${c}"></i>`).join('')}</span></button>`;
        }).join('');
        const days = week.filter((d) => d >= today).length ? week.filter((d) => d >= today) : week.filter((d) => d >= 1);
        const hasAi = st.items.some((x) => x.ai && days.includes(x.day));
        const top = `<section class="mb4-card mb4-sch-top"><div class="mb4-sch-head"><b>${esc(pick === today ? '오늘 일정' : dayName(S, pick, start))}</b><button class="mb4-sch-nav" data-act="pick" data-v="${Math.max(1, pick - 7)}" aria-label="앞 주">‹</button>${pick !== today ? `<button class="mb4-sch-month" data-act="pick" data-v="${today}">오늘로</button>` : `<span class="mb4-sch-month">${esc(pd ? `${pd.getUTCMonth() + 1}월` : '이번 주')}</span>`}<button class="mb4-sch-nav" data-act="pick" data-v="${pick + 7}" aria-label="다음 주">›</button></div>
            <div class="mb4-sch-strip">${strip}</div>
            <button class="mb4-sch-magic" data-act="magic">🪄 ${hasAi ? '이번 주 다시 짜기' : '이번 주 다 짜기'}<small>${esc(order.join(' · '))}의 ${days.length}일 일정을 한 번에 · AI 1번</small></button></section>`;

        // ── who ──
        const who = `<div class="mb4-sch-who"><span class="mb4-sch-pk on me" style="--c:${colorOf(me)}"><i>${face(me)}</i>${esc(me)} (나)</span>${known.map((n) => `<button class="mb4-sch-pk${st.sel.includes(n) ? ' on' : ''}" style="--c:${st.sel.includes(n) ? colorOf(n) : 'var(--line)'}" data-act="sel" data-v="${esc(n)}" aria-pressed="${st.sel.includes(n)}"><i>${face(n)}</i>${esc(n)}</button>`).join('')}</div>`;

        // ── the day: one line down the left, each plan in its person's colour ──
        const L = collect(S, env, pick).sort((a, b) => todIx(a.tod) - todIx(b.tod));
        const ICON = { due: '📌', done: '📌', mark: '📅', memo: '📝' };
        const evColor = (e) => (e.kind !== 'own' ? 'var(--a)' : e.who.length ? colorOf(e.who.find((n) => order.includes(n)) ?? e.who[0]) : 'var(--a)');
        const ev = (e, first) => `<div class="mb4-sch-ev${e.done ? ' done' : ''}${e.kind !== 'own' ? ' tag' : ''}" style="--c:${evColor(e)}">
            <span class="mb4-sch-t">${first ? (e.tod ? TOD_KO[e.tod] : '종일') : ''}</span>
            <span class="mb4-sch-rail">${e.kind === 'own' ? `<button class="mb4-sch-dot" data-act="done" data-v="${e.n}" aria-label="${esc(e.title)} ${e.done ? '끝냄 풀기' : '끝냄'}"></button>` : '<i class="mb4-sch-dot"></i>'}</span>
            <div class="mb4-sch-b"><b>${e.kind !== 'own' ? `${ICON[e.kind]} ` : ''}${esc(e.title)}</b>
                ${e.where ? `<span class="mb4-sch-m"><i>📍</i>${esc(e.where)}</span>` : ''}
                ${e.kind === 'own' ? `<span class="mb4-sch-m"><i>👤</i>${e.who.length ? e.who.map((n) => `${face(n)} ${esc(n)}`).join(', ') : '다 같이'}</span>` : `<span class="mb4-sch-m"><i>🏷</i>${esc(e.tag)}${e.go && api.isOn(e.go.slice(4)) ? `<button class="mb4-sch-go" data-act="go" data-v="${e.go}">보기 ›</button>` : ''}</span>`}
                <span class="mb4-sch-m"><i>🕰</i>${esc(dayName(S, pick, start))}${e.tod ? ` · ${TOD_KO[e.tod]}` : ''}</span></div></div>`;
        const nowTod = pick === today ? S.tod : '';
        const groups = ['', ...TOD].map((t) => {
            const inRow = L.filter((e) => (e.tod ?? '') === t), now = !!t && t === nowTod;
            const html = inRow.map((e, n) => ev(e, n === 0)).join('');
            return now ? `<div class="mb4-sch-now"><small>지금 · ${TOD_KO[t]}</small>${html}</div>` : html;
        }).join('');
        const tt = `<div class="mb4-sch-tl">${L.length ? groups : `${nowTod ? `<div class="mb4-sch-now"><small>지금 · ${TOD_KO[nowTod]}</small></div>` : ''}<div class="mb4-sch-empty">이 날은 비어 있어요<br>🪄를 누르거나 아래에서 직접 넣어요</div>`}</div>`;
        // ── add by hand ──
        const dayOpts = [...new Set([...Array.from({ length: 15 }, (_x, n) => today + n), pick])].sort((a, b) => a - b).map((day) => `<option value="${day}" ${day === pick ? 'selected' : ''}>${esc(dayName(S, day, start))}</option>`).join('');
        const add = `<details class="mb4-card" data-box="add" ${st.open === 'add' ? 'open' : ''}><summary>＋ 직접 넣기</summary>
            <input class="mb4-input" data-f="what" maxlength="60" placeholder="무엇을 하나요">
            <div class="mb4-sch-chks" role="group" aria-label="누구 일정인가요">${order.map((n) => `<label class="mb4-sch-chk" style="--c:${colorOf(n)}"><input type="checkbox" data-w="${esc(n)}"><span>${face(n)} ${esc(n)}</span></label>`).join('')}</div>
            ${hint('아무도 안 고르면 가운데 「함께」 일정이에요.')}
            <div class="mb4-btnrow"><select class="mb4-input" data-f="day" aria-label="날">${dayOpts}</select><select class="mb4-input" data-f="tod" aria-label="때"><option value="">하루 종일</option>${TOD.map((t) => `<option value="${t}" ${t === (pick === today && S.tod ? S.tod : 'morning') ? 'selected' : ''}>${TOD_KO[t]}</option>`).join('')}</select></div>
            <input class="mb4-input" data-f="where" maxlength="60" placeholder="어디서 (비워도 돼요)">
            <div class="mb4-btnrow"><button class="mb4-btn" data-act="add">넣기</button></div></details>`;

        el.innerHTML = `${scene ? '' : card('', '🧭 장면 앱을 켜야 이야기 속 날과 때가 흘러요. 지금은 넣은 일정만 보여 줘요.', 'warn')}
        ${top}${who}${tt}${add}
        <label class="mb4-sw"><span><b>오늘 일정을 AI에게도 알려 주기</b><small>오늘 남은 일정과, 다른 곳에 있는 사람이 지금 뭘 하는지 한두 줄로 보내요.</small></span><input type="checkbox" data-act="tell" ${api.cfg.tell !== false ? 'checked' : ''}><i></i></label>`;

        const save = () => { api.save(); api.redraw(); };
        k.editMore(el, api, [
            { name: 'item', list: st.items, max: 40, label: (x) => `${dayName(S, x.day, start)}${x.tod ? ` ${TOD_KO[x.tod]}` : ''} · ${x.who?.length ? x.who.join(' · ') : '함께'}`, get: (x) => x.what, set: (x, t) => { x.what = t.slice(0, 60); } },
            { name: 'where', list: st.items.filter((x) => x.where), max: 40, del: false, label: (x) => `${x.what}: 어디서`, get: (x) => x.where, set: (x, t) => { x.where = t.slice(0, 60); } },
        ]);
        el.querySelectorAll('details[data-box]').forEach((d) => d.addEventListener('toggle', () => { st.open = d.open ? d.dataset.box : ''; }));
        acts(el, {
            pick: (v) => { st.pick = Math.max(1, +v || today); api.redraw(); },
            go: (v) => api.go(v),
            tell: (_v, b) => { api.cfg.tell = b.checked; api.save(); },
            done: (n) => { const x = st.items[+n]; if (x) { x.done = !x.done; save(); } },
            sel: (n) => {
                if (st.sel.includes(n)) st.sel = st.sel.filter((x) => x !== n);
                else if (st.sel.length >= MAX_SEL) { api.toast(`${MAX_SEL}명까지 고를 수 있어요.`); return; }
                else st.sel.push(n);
                save();
            },
            add: () => {
                const what = val(el, '[data-f="what"]'), day = +val(el, '[data-f="day"]') || pick, tod = val(el, '[data-f="tod"]'), where = val(el, '[data-f="where"]');
                if (!what) { api.toast('무엇을 하는지 적어 주세요.'); return; }
                st.items.push({ day, tod, what: what.slice(0, 60), who: [...el.querySelectorAll('[data-w]')].filter((x) => x.checked).map((x) => x.dataset.w), where: where.slice(0, 60) });
                if (st.items.length > MAX_ITEMS) st.items.splice(0, st.items.length - MAX_ITEMS);
                st.pick = day; st.open = ''; save();
            },
            // ONE model call, only because this button was pressed: the whole week for everyone on the timetable
            magic: async (_v, b) => {
                b.disabled = true; b.firstChild.textContent = '🪄 짜는 중… ';
                const label = (day, n) => { const d = dateAt(S, day, start); return `D${n + 1} = ${d ? `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]} ${d.toISOString().slice(0, 10)}` : `story day ${day}`}${day === today ? ' (today)' : ''}`; };
                const fixed = days.flatMap((day) => collect(S, env, day).filter((e) => !(e.kind === 'own' && e.ai)).map((e) => `D${days.indexOf(day) + 1} | ${e.who.length ? e.who.join(' & ') : 'together'} | ${e.tod || 'any'} | ${e.title}${e.where ? ` | ${e.where}` : ''}`));
                const about = order.map((n) => (n === me ? `- ${me}: the user's own character` : `- ${n}${people[n]?.about ? `: ${people[n].about}` : ''}`)).join('\n');
                const answer = await api.ask(`Make a believable timetable for these story days, for the people below: what they do together and what each does on their own.
Days:\n${days.map(label).join('\n')}
People:\n${about}
Write 4 to 8 lines per day, one plan per line, exactly in this shape:
D<n> | who | time | what | where
who: "together" for everyone, or one or more of the names above joined with " & ". time: one of dawn, morning, noon, afternoon, evening, night, midnight. what: a few words. where: a short place name, one the story already has when it fits.
Mix shared plans with each person's own (work, study, errands, habits, meeting someone). Keep to what is known about them and to the plans already fixed below (do not repeat those). ${days.includes(today) && S.tod ? `For today, plan only from ${S.tod} on.` : ''}
Write "what" and "where" in the language the story is written in. No other text.
${fixed.length ? `\n[Already fixed — keep, do not repeat]\n${fixed.join('\n')}\n` : ''}
[What is known]\n${api.facts() || '(nothing recorded)'}

[Latest part of the story]\n${clip(env.recent(1)[0] ?? '', 1500)}`, 1500);
                const rows = parsePlan(answer, days, order);
                if (!rows.length) { api.toast('받지 못했어요. 멈춤 중이 아닌지 보고 다시 눌러 주세요.'); api.redraw(); return; }
                // a new plan for these days replaces the last one the AI made; what you put in or ticked off stays
                st.items = [...st.items.filter((x) => !(x.ai && !x.done && days.includes(x.day))), ...rows];
                if (st.items.length > MAX_ITEMS) st.items.splice(0, st.items.length - MAX_ITEMS);
                api.toast(`📆 일정 ${rows.length}개를 짰어요.`);
                save();
            },
        });
    },
};
