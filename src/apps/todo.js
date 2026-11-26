// 📌 Promises: what was promised, to whom, by when — and whether it was kept. The code keeps the list and the clock
// (the story time 🧭 Scene records is watched, not asked again) and works out what is due or overdue; the main model
// only gets the open ones, with «due today» / «overdue» when it matters.
import { clip } from '../core/text.js';
import { applyTime } from '../core/clock.js';
import { esc, card, hint, acts, val, empty, pill } from '../ui/kit.js';

// time words say WHEN, not WHAT: two different promises both «by tomorrow evening» are not the same promise
const STOP = new Set('the and for with from that this will was were has have had not but they them their her his she him you your tomorrow today tonight evening morning afternoon night week weekend next day days by until 내일 오늘 모레 저녁 아침 밤 주말 다음 까지'.split(' '));
const what = (s) => { const t = String(s); return t.includes('=') ? t.slice(t.indexOf('=') + 1) : t; };   // "A>B=what": compare the what, not the names
const words = (s) => (what(s).toLowerCase().match(/[a-z]{3,}|[가-힣]{2,}|\d+/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ed|ing|s)$/, ''));
const overlap = (a, b) => { const B = new Set(words(b)); return words(a).filter((w) => B.has(w)).length; };
const who = (s) => { const t = String(s); return t.includes('=') ? t.slice(0, t.indexOf('=')).replace('>', ' → ') : ''; };
// "when" in the promise -> days from now (null = no deadline said)
export function dueIn(text) {
    const t = String(text).toLowerCase();
    let m;
    if ((m = t.match(/\bin (\d{1,2}) days?\b|(\d{1,2})\s*일\s*(?:뒤|후|안에)/))) return +(m[1] ?? m[2]);
    if ((m = t.match(/\bin (\d{1,2}) weeks?\b|(\d{1,2})\s*주\s*(?:뒤|후|안에)/))) return +(m[1] ?? m[2]) * 7;
    if (/day after tomorrow|모레/.test(t)) return 2;
    if (/tomorrow|내일/.test(t)) return 1;
    if (/tonight|today|this (?:morning|afternoon|evening)|오늘|이따|오늘 밤/.test(t)) return 0;
    if (/weekend|주말/.test(t)) return 3;
    if (/next week|다음 주|일주일/.test(t)) return 7;
    if (/next month|다음 달|한 달/.test(t)) return 30;
    return null;
}
const STATUS = { kept: ['✅', '지킴'], broken: ['❌', '어김'], cancelled: ['🚫', '취소'] };
const statusOf = (v) => (/broken|broke|failed|missed|forgot|어겼|어김|못 지/i.test(v) ? 'broken' : /cancel|called off|impossible|취소|없던 일/i.test(v) ? 'cancelled' : 'kept');
const WHEN = [['', '언제든'], ['today', '오늘'], ['tomorrow', '내일'], ['in 3 days', '3일 안'], ['next week', '일주일 안']];

export default {
    api: 1,
    id: 'todo',
    name: '약속',
    icon: '📌',
    color: '#e76f51',
    cost: 'low',
    desc: '누가 누구에게 무엇을 언제까지 약속했는지 적어 두고, 기한이 다가오거나 지나면 AI가 잊지 않게 알려 줘요.',
    keys: [
        { id: 'promise', line: 'promise: A>B=what, when (keep the words for when: tomorrow, in 3 days, tonight…)', quote: true },
        { id: 'done', line: 'done: the promise — kept | broken | cancelled', when: (S) => (S?.open?.length ?? 1) > 0 },
    ],
    watch: ['time'],
    rules: ['"promise" is only for a clear commitment to do something later. Small talk and wishes are not promises.'],
    start: () => ({ open: [], closed: [], clock: { day: 1, hrs: 0, tod: '', date: '', vague: false, fz: null } }),
    reduce(S, { k, v, q, i }) {
        S.clock ??= { day: 1, hrs: 0, tod: '', date: '', vague: false, fz: null };
        if (k === 'time') { applyTime(S.clock, v); return; }
        if (k === 'promise') {
            const text = clip(v, 140), d = dueIn(text);
            const pairOf = (s) => (String(s).includes('=') ? String(s).slice(0, String(s).indexOf('=')).replace(/\s+/g, '').toLowerCase() : '');
            if (!S.open.some((p) => pairOf(p.what) === pairOf(text) && overlap(p.what, text) >= 3)) S.open.push({ what: text, q: clip(q, 120), i, day: S.clock.day, due: d == null ? null : S.clock.day + d });
            if (S.open.length > 12) S.open.shift();
        } else if (k === 'done') {
            const m = String(v).match(/^(.*?)\s*[—–|-]\s*(kept|broken|cancel(?:l?ed)?)\s*$/i), body = m ? m[1] : v, stat = m ? (/cancel/i.test(m[2]) ? 'cancelled' : m[2].toLowerCase()) : statusOf(v);
            let best = -1, score = 0;
            S.open.forEach((p, n) => { const sc = p.what === body ? 99 : overlap(p.what, body); if (sc > score) { score = sc; best = n; } });
            if (best >= 0) { S.closed.push({ ...S.open.splice(best, 1)[0], st: stat, end: S.clock.day }); if (S.closed.length > 20) S.closed.shift(); }
        }
    },
    stateLines: (S) => [S.open.length ? `open promises: ${S.open.map((p) => p.what).join(' ; ')}` : 'open promises: (none)'],
    // ✏️ a promise reworded, re-dated or taken away by hand (kept in the app's own data, by the promise's first words)
    adjust(S, env) {
        const E = env.store?.edit ?? {}, H = env.store?.hide ?? {};
        S.open = S.open.filter((p) => !H[p.what]).map((p) => { const e = E[p.what]; return e ? { ...p, _k: p.what, what: e.w ?? p.what, due: e.due !== undefined ? e.due : p.due } : p; });
    },
    note(S) {
        if (!S.open.length) return null;
        const day = S.clock?.day ?? 1;
        const tag = (p) => (p.due == null ? '' : p.due < day ? ` [OVERDUE by ${day - p.due} day${day - p.due > 1 ? 's' : ''} — the one waiting has noticed]` : p.due === day ? ' [due today]' : '');
        const L = S.open.slice(-5).map((p) => `${p.what}${tag(p)}`);
        return { state: [`Open promises (still unkept; nobody has forgotten them): ${L.join(' ; ')}.`] };
    },
    hud: (S) => { const day = S.clock?.day ?? 1, late = S.open.filter((p) => p.due != null && p.due < day).length; return S.open.length ? [`📌 ${S.open.length}${late ? ` · ⏰${late}` : ''}`] : []; },
    chip: ({ k, v }) => (k === 'promise' ? `📌 ${clip(what(v), 18)}` : `${STATUS[statusOf(v)][0]} ${clip(v, 18)}`),
    widget: (S) => { const day = S.clock?.day ?? 1; return S.open.slice(-3).reverse().map((p) => `<div class="mb4-row"><span class="mb4-row-v">📌 ${esc(what(p.what))}${p.due != null && p.due <= day ? ` <small class="mb4-bad">${p.due < day ? '기한 지남' : '오늘까지'}</small>` : ''}</span></div>`).join(''); },
    widgetTitle: '열린 약속',
    render(el, api) {
        const S = api.state(), day = S.clock?.day ?? 1;
        const dueTxt = (p) => (p.due == null ? '' : p.due < day ? pill(`⏰ ${day - p.due}일 지남`, 'bad') : p.due === day ? pill('오늘까지', 'bad') : pill(`${p.due - day}일 남음`));
        const open = S.open.slice().sort((a, b) => (a.due ?? 1e9) - (b.due ?? 1e9));
        const kept = S.closed.filter((p) => (p.st ?? 'kept') === 'kept').length, broken = S.closed.filter((p) => p.st === 'broken').length;
        el.innerHTML = `${open.length ? open.map((p) => card('', `<div class="mb4-quote"><b>${esc(who(p.what))}</b> ${esc(what(p.what))} ${dueTxt(p)}${p.q ? `<q>${esc(p.q)}</q>` : ''}<small class="mb4-dim">${p.day ?? 1}일째에 한 약속</small></div>
            <div class="mb4-btnrow tight"><button class="mb4-btn ghost sm" data-act="done" data-v="${esc(p.what)}|kept">✅ 지켰어요</button><button class="mb4-btn ghost sm" data-act="done" data-v="${esc(p.what)}|broken">❌ 어겼어요</button><button class="mb4-btn ghost sm" data-act="done" data-v="${esc(p.what)}|cancelled">🚫 취소</button></div>`)).join('') : empty('📌', '열린 약속이 없어요', '이야기에서 약속이 생기면 여기 쌓여요')}
        ${card('직접 넣기', `<input class="mb4-input" data-f="new" maxlength="120" placeholder="누가 누구에게 무엇을 (예: 나 > 친구 = 책 돌려주기)">
            <div class="mb4-btnrow"><select class="mb4-input" data-f="when">${WHEN.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><button class="mb4-btn" data-act="add">넣기</button></div>`)}
        ${S.closed.length ? card(`끝난 약속 <small>지킴 ${kept} · 어김 ${broken}</small>`, S.closed.slice().reverse().map((p) => `<div class="mb4-row mb4-dim"><span class="mb4-row-v">${STATUS[p.st ?? 'kept'][0]} ${esc(what(p.what))} <small>${STATUS[p.st ?? 'kept'][1]}</small></span></div>`).join('')) : ''}
        ${hint('기한은 약속에 적힌 말(내일 · 3일 뒤 · 다음 주…)로 코드가 셈해요. 이야기 속 날짜는 🧭 장면에서 받아 와요. 기한이 지나면 AI가 「기다리는 사람이 눈치챘다」고 알아요.')}`;
        api.kit.editMore(el, api, [
            { name: 'what', list: S.open, label: (p) => '약속 (누가>누구=무엇)', get: (p) => p.what, set: (p, t) => { ((api.store.edit ??= {})[p._k ?? p.what] ??= {}).w = t.slice(0, 140); }, remove: (p) => { (api.store.hide ??= {})[p._k ?? p.what] = true; } },
            { name: 'due', list: S.open, del: false, label: (p) => '기한: 며칠 뒤까지 (비우려면 -)', get: (p) => (p.due == null ? '-' : String(p.due - day)), set: (p, t) => { const e = ((api.store.edit ??= {})[p._k ?? p.what] ??= {}); e.due = /^-$/.test(t.trim()) ? null : Number.isFinite(+t) ? day + Math.round(+t) : e.due; } },
        ]);
        acts(el, {
            done: (v) => { const [w, s] = v.split('|'); api.fix('done', `${w} — ${s}`); },
            add: () => { const t = val(el, '[data-f="new"]'), w = val(el, '[data-f="when"]'); if (t) api.fix('promise', `${t}${w ? `, ${w}` : ''}`); },
        });
    },
};
