// 📅 Calendar: turns the story's day count into real dates and keeps the person's own marked days.
// No classifier key and no model call: it only reads what the Scene app already recorded.
// Ported from the second generation's calendar-plus (D-day counting, a pinned D-day, yearly anniversaries, a note per
// day, an optional cycle, "someone close notices a note") and the third generation's handling of vague time skips.
import { esc, card, hint, acts, val, empty, pill } from '../ui/kit.js';
import { namedDate, anchoredDate } from '../core/clock.js';
import { plain, spendPlain, stamped, spendStamped } from '../core/once.js';

const DAY = 86400000;
const WD_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const iso = (d) => d.toISOString().slice(0, 10);
// Day 1's date: the one the person set; else counted back from the last date the story named (records carried over
// from an earlier Meatball hold those dates), so the calendar is never empty when the story has a date.
const startOf = (env) => {
    const t = Date.parse(`${env.store.start ?? ''}T00:00:00Z`);
    if (!Number.isNaN(t)) return t;
    const sc = env.peek?.('scene'), a = sc ? anchoredDate(sc) : null;
    return a == null || Number.isNaN(a) ? null : a - (sc.day - 1) * DAY;
};
// The calendar date of a story day (day 1 = the start date).
export const dateOf = (start, day) => new Date(start + (day - 1) * DAY);
const dayOfIso = (start, s) => { const t = Date.parse(`${s}T00:00:00Z`); return Number.isNaN(t) ? null : Math.round((t - start) / DAY) + 1; };
const marks = (env) => (Array.isArray(env.store.marks) ? env.store.marks : []).filter((m) => m?.date && m?.label);
const fmtEN = (d) => `${WD_EN[d.getUTCDay()]}, ${MON_EN[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
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
    return { date: named != null ? new Date(named) : dateOf(start, sc.day), fuzzy: null, day: sc.day };
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
// The optional cycle: day n of a period (or 0), from the start days the person marked.
export function cycleOn(cyc, day) {
    if (!cyc?.on) return 0;
    const past = (cyc.starts ?? []).filter((n) => n <= day).sort((a, b) => a - b), last = past.at(-1);
    if (last == null) return 0;
    const len = cyc.len || 28, dur = cyc.dur || 5, k = (day - last) % len;
    return day - last < len * 3 && k < dur ? k + 1 : 0;   // predicted for three cycles after the last one marked
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
        const T = today(env);
        if (!T) return null;
        const st = env.store, state = [], now = [];
        if (T.fuzzy) state.push(`Calendar: some ${{ d: 'days', w: 'weeks', mo: 'months', y: 'years' }[T.fuzzy.unit] ?? 'days'} after ${fmtEN(T.fuzzy.since)}; the exact date is not known yet. Do not name one unless the story settles it.`);
        else {
            state.push(`Calendar: today is ${fmtEN(T.date)}.`);
            for (const m of upcoming(env, T.date, 1)) state.push(`${m.in === 0 ? 'Today' : 'Tomorrow'} is marked on the calendar: ${m.label}${m.years > 0 ? ` (${m.years} years)` : ''}.`);
            const note = st.notes?.[iso(T.date)];
            if (note?.text && note.tell) state.push(`On today's page of the calendar the user wrote: ${String(note.text).slice(0, 80)}.`);
        }
        const user = env.user || 'the user', cd = cycleOn(st.cycle, T.day);
        if (cd && st.cycle.tell) { state.push(`${user} is on their period (day ${cd}).`); if (cd <= 3) now.push(`People close to ${user} know or notice it and act on it naturally: care, warmth, food, rest.`); }
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
        const out = [`📅 ${T.date.getUTCMonth() + 1}/${T.date.getUTCDate()} ${WD_KO[T.date.getUTCDay()]}`];
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
.mb4-cal-d.cyp { box-shadow: inset 0 0 0 1px rgba(229, 72, 77, .35); }
`,
    render(el, api) {
        const env = api.env, st = api.store, sc = env.peek('scene'), start = startOf(env);
        st.marks = marks(env);
        st.notes = st.notes && typeof st.notes === 'object' ? st.notes : {};
        st.cycle = { on: false, starts: [], len: 28, dur: 5, tell: false, ...(st.cycle ?? {}) };
        if (!sc) { el.innerHTML = empty('🧭', '「장면」 앱을 켜 주세요', '날짜가 흐르는 건 장면 앱이 세요. 달력은 그걸 읽어서 보여 줘요.'); return; }
        const T = start == null ? null : today(env), now = T?.date ?? T?.fuzzy?.since ?? null;
        const pick = st.pick && now ? st.pick : now ? iso(now) : '';
        const loveCal = Array.isArray(env.peekStore?.('touch')?.cal) ? env.peekStore('touch').cal : [];
        let grid = '';
        if (now) {
            const y = now.getUTCFullYear(), m = now.getUTCMonth(), first = new Date(Date.UTC(y, m, 1)), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
            const marked = new Set(st.marks.flatMap((x) => (x.yearly ? [`${y}${x.date.slice(4)}`, x.date] : [x.date])));
            for (const c of loveCal) marked.add(iso(new Date(start + (c.day - 1) * 86400000)));
            const cells = [...Array(first.getUTCDay()).fill(''), ...Array.from({ length: days }, (_x, i) => i + 1)];
            grid = `<div class="mb4-cal-h">${y}년 ${m + 1}월 ${T.fuzzy ? '<small>· 며칠 흐름</small>' : ''}</div><div class="mb4-cal">${WD_KO.map((w) => `<span class="mb4-cal-w">${w}</span>`).join('')}${cells.map((n) => {
                if (!n) return '<span></span>';
                const key = iso(new Date(Date.UTC(y, m, n))), dn = dayOfIso(start, key), cy = st.cycle.on ? (cycleOn(st.cycle, dn) ? (st.cycle.starts.some((s) => dn >= s && dn < s + st.cycle.dur) ? ' cy' : ' cyp') : '') : '';
                return `<span class="mb4-cal-d${!T.fuzzy && n === now.getUTCDate() ? ' today' : ''}${marked.has(key) ? ' mark' : ''}${st.notes[key]?.text ? ' memo' : ''}${cy}" data-act="pick" data-v="${key}">${n}</span>`;
            }).join('')}</div>`;
        }
        const note = st.notes[pick] ?? {};
        const loveHtml = loveCal.length ? card('💌 누가 몰래 적어 놨어요', loveCal.map((c) => `<div class="mb4-row"><span class="mb4-row-k">${start != null ? esc(iso(new Date(start + (c.day - 1) * 86400000)).slice(5).replace('-', '/')) : ''}</span><span class="mb4-row-v">${esc(c.text)} <small>— ${esc(c.who)}</small></span></div>`).join('')) : '';
        const partner = (() => { const P = Object.values(env.peek('bonds')?.pairs ?? {}).filter((p) => p.a === env.user || p.b === env.user).sort((a, b) => b.lvl - a.lvl)[0]; return P ? (P.a === env.user ? P.b : P.a) : ''; })();
        el.innerHTML = `${card('', grid || hint('이야기에 날짜가 나오거나 아래에서 시작 날짜를 정하면 달력으로 보여 줘요.'))}
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
            <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="cystart">고른 날을 시작일로</button></div>
            <label class="mb4-sw"><span><b>AI에 알리기</b><small>기간 중에만 1줄 · 가까운 사람이 챙겨 줘요</small></span><input type="checkbox" data-act="cytell" ${st.cycle.tell ? 'checked' : ''}><i></i></label>` : ''}
        </details>
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
            cystart: () => { const d = dayOfIso(start, pick); if (d != null && !st.cycle.starts.includes(d)) st.cycle.starts.push(d); save(); },
        });
    },
};
