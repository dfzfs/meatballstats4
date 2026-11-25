// 💰 Wallet: money and belongings of the user's character. The classifier reports what happened; the code does the sums.
// Ported from the second generation's rule book (cash · buy · sell · work, "not enough money" refused, items with
// counts, the bag grouped by kind) and the first generation's money tab (a usual meal price, wages, regular income
// and costs, debts with a due day, a rough real-money equivalent).
import { clip } from '../core/text.js';
import { applyTime } from '../core/clock.js';
import { esc, card, hint, acts, val, empty, pill } from '../ui/kit.js';

const num = (v) => { const m = String(v).replace(/,/g, '').match(/^\s*([=+-])?\s*(\d+(?:\.\d+)?)/); return m ? { sign: m[1] ?? '+', n: +m[2] } : null; };
const why = (v) => { const i = String(v).indexOf('|'); return i < 0 ? '' : clip(String(v).slice(i + 1), 40); };
const fmt = (n) => Number(n).toLocaleString('en-US');
const signed = (n) => `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`;
// "brass key ×2 | from Mara" -> { name, n, from }
export function itemOf(v) {
    const [head, rest] = String(v).split('|').map((x) => x.trim());
    const m = head.match(/^(.*?)\s*(?:[x×]\s*(\d+)|\((\d+)\))\s*$/i);
    const from = (rest ?? '').match(/^(?:from|by|gift from)\s+(.+)$/i)?.[1] ?? '';
    return { name: clip(m ? m[1] : head, 60), n: Math.max(1, Math.min(999, +(m?.[2] ?? m?.[3] ?? 1))), from: clip(from, 40), counted: !!m };
}
// The bag's groups (second generation): what is worn · gifts and keepsakes · food · clothes · the rest. Words only.
const FOOD = /bread|cake|apple|meat|fish|soup|tea|coffee|wine|ale|beer|milk|cheese|egg|rice|candy|snack|lunch|meal|food|빵|떡|사과|고기|생선|국|차|커피|술|맥주|우유|치즈|달걀|계란|밥|사탕|과자|도시락|음식/i;
const WEAR = /coat|cloak|dress|shirt|scarf|hat|boots|shoes|ring|necklace|earring|gloves|jacket|belt|ribbon|코트|망토|드레스|셔츠|목도리|모자|부츠|신발|반지|목걸이|귀걸이|장갑|재킷|허리띠|리본|옷/i;
export const kindOf = (it) => (it.from ? 'gift' : FOOD.test(it.name) ? 'food' : WEAR.test(it.name) ? 'wear' : 'etc');
const GROUPS = [['gift', '🎁 받은 것 · 추억'], ['food', '🍞 먹을 것'], ['wear', '👗 옷 · 꾸밈'], ['etc', '📦 잡동사니']];
// Which thing is meant: the same name first; else a name that holds it as whole words ("ring" is not in "earring"),
// the closest in length. Names without spaces between words (Korean) match as a part.
export function findItem(items, name) {
    const t = String(name).toLowerCase().trim(), low = items.map((x) => x.toLowerCase());
    const exact = low.indexOf(t);
    if (exact >= 0 || !t) return exact;
    const latin = (s) => /^[\x00-\x7f]+$/.test(s);
    const inside = (a, b) => (latin(a) && latin(b) ? new RegExp(`(^|[^a-z0-9])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(a) : a.includes(b));
    let best = -1;
    low.forEach((x, i) => { if ((inside(x, t) || inside(t, x)) && (best < 0 || Math.abs(x.length - t.length) < Math.abs(low[best].length - t.length))) best = i; });
    return best;
}
const EVERY = { day: 1, week: 7, month: 30 }, EVERY_KO = { day: '매일', week: '매주', month: '매달' };

// Regular income and costs, counted from the scene's day (no reader line, no call): [{ name, amount, every, from }]
export function regularTotal(st, day) {
    if (day == null) return 0;
    return (Array.isArray(st.regular) ? st.regular : []).reduce((sum, r) => sum + (Number(r.amount) || 0) * Math.max(0, Math.floor((day - (r.from ?? day)) / (EVERY[r.every] ?? 30))), 0);
}
const dayOf = (env) => env.peek?.('scene')?.day ?? null;
export const cashOf = (S, env) => S.cash + regularTotal(env.store, dayOf(env));
const openLoans = (st) => (Array.isArray(st.loans) ? st.loans : []).filter((l) => l && !l.paid);
const label = (S, x) => `${x}${(S.qty?.[x.toLowerCase()] ?? 1) > 1 ? ` ×${S.qty[x.toLowerCase()]}` : ''}`;
const unitOf = (env) => (env.store.unit ? ` ${env.store.unit}` : '');

export default {
    api: 1,
    id: 'wallet',
    name: '지갑',
    icon: '💰',
    color: '#f4a261',
    cost: 'low',
    desc: '돈과 물건을 코드가 세어서, 없는 돈을 쓰거나 잃은 물건이 다시 나오지 않게 해요.',
    keys: [
        { id: 'cash', line: 'cash: +50 | why / -20 | why / =300 (total stated)' },
        { id: 'got', line: 'got: thing kept (×2 for several; | from Name if given)' },
        { id: 'lost', line: 'lost: thing used up, given, sold, broken or taken' },
    ],
    watch: ['time'],   // the story's day, so regular income counts when a spend is judged (only while the scene app is on)
    rules: (env) => [`cash, got and lost are only about ${env.user || 'the user character'}'s own money and belongings. Numbers only when the text gives them.`],
    // items stay a list of names (older saves and other apps read it so); counts and givers sit beside it
    start: (env) => ({ cash: Number(env.store.startCash) || 0, items: [...(env.store.startItems ?? [])], qty: {}, gift: {}, log: [], short: [], clock: { day: 1, hrs: 0, tod: '', date: '', vague: false, fz: null } }),
    check: ({ k, v }) => (k === 'cash' ? !!num(v) : v.length <= 80),
    reduce(S, { k, v, i, watched }, env) {
        if (watched) { if (k === 'time') applyTime(S.clock, v); return; }
        if (k === 'cash') {
            const x = num(v);
            if (!x) return;
            // spending more than there is is flagged; with the strict rule on it is refused (second generation)
            const had = S.cash + regularTotal(env?.store ?? {}, S.clock.day);   // what is really there: counted cash plus regular money so far
            if (x.sign === '-' && x.n > had) {
                S.short.push({ need: x.n, had, why: why(v), i, refused: !!env?.store?.strict });
                if (S.short.length > 10) S.short.shift();
                if (env?.store?.strict) return;
            }
            const before = S.cash;
            S.cash = x.sign === '=' ? x.n : x.sign === '-' ? S.cash - x.n : S.cash + x.n;
            S.log.push({ d: S.cash - before, why: why(v), i });
            if (S.log.length > 40) S.log.shift();
        } else if (k === 'got') {
            const it = itemOf(v), key = it.name.toLowerCase(), have = S.items.find((x) => x.toLowerCase() === key);
            // the same thing named again is the same thing (a reader often repeats it); only an explicit count adds more
            if (have) { if (it.counted) S.qty[have.toLowerCase()] = (S.qty[have.toLowerCase()] ?? 1) + it.n; }
            else { S.items.push(it.name); if (it.n > 1) S.qty[key] = it.n; }
            if (it.from) S.gift[key] = it.from;
            if (S.items.length > 60) S.items.shift();
        } else if (k === 'lost') {
            const it = itemOf(v), t = it.name.toLowerCase();
            const at = findItem(S.items, t);
            if (at < 0) return;
            const key = S.items[at].toLowerCase(), left = (S.qty[key] ?? 1) - it.n;
            if (left > 0) S.qty[key] = left; else { S.items.splice(at, 1); delete S.qty[key]; delete S.gift[key]; }
        }
    },
    stateLines: (S, env) => [`cash: ${cashOf(S, env)}${unitOf(env)}`, `belongings: ${S.items.length ? S.items.map((x) => label(S, x)).join(', ') : '(none recorded)'}`],
    note(S, env) {
        const st = env.store, who = env.user || 'The user character', cash = cashOf(S, env), u = unitOf(env), day = dayOf(env), state = [], now = [];
        state.push(`${who} has ${fmt(cash)}${u}${S.items.length ? ` and carries: ${S.items.slice(-15).map((x) => label(S, x)).join(', ')}` : ''}. Nothing else is owned.`);
        if (cash > 0 && S.short.length) state.push(`Anything costing more than ${fmt(cash)}${u} cannot be bought outright.`);   // only once a reply has overspent
        if (Number(st.meal) > 0) state.push(`Prices: a plain meal costs about ${fmt(st.meal)}${u}; keep other prices in proportion.`);
        for (const l of openLoans(st).slice(0, 3)) {
            const left = l.due != null && day != null ? l.due - day : null;
            state.push(`${who} owes ${l.lender} ${fmt(l.owed)}${u}${l.item ? ` (left ${l.item} as security)` : ''}${left == null ? '' : left >= 0 ? `, due in ${left} days` : `, ${-left} days overdue`}.`);
        }
        // the story tried to spend money that is not there: say so once, for the next reply
        const s = S.short.at(-1);
        if (s && s.i === env.last) now.push(s.refused ? `${who} cannot afford ${s.why || 'that'} (${fmt(s.need)}${u}; has ${fmt(s.had)}${u}). It did not happen: find another way, haggle, or go without.` : `${who} could not really afford ${s.why || 'that'} (${fmt(s.need)}${u}; had ${fmt(s.had)}${u}). Do not gloss over it: it is owed, unpaid, or comes back to bite.`);
        else if (cash <= 0 && S.log.length) now.push(`${who} has no money left. Anything that costs money needs another way.`);
        return { state, now };
    },
    hud: (S, env) => { const c = cashOf(S, env), late = openLoans(env.store).some((l) => l.due != null && dayOf(env) != null && l.due < dayOf(env)); return [`💰 ${fmt(c)}`, ...(late ? ['⚠ 빚 연체'] : [])]; },
    chip: ({ k, v }) => (k === 'cash' ? `💰 ${v.trim().startsWith('=') ? `= ${fmt(num(v).n)}` : signed(num(v).sign === '-' ? -num(v).n : num(v).n)}` : k === 'got' ? `🎒 +${itemOf(v).name}` : `🎒 −${itemOf(v).name}`),
    widget: (S, env) => { const c = cashOf(S, env); return `<div class="mb4-money"><b>${fmt(c)}</b> <small>${esc(env.store.unit ?? '')}</small>${S.log.length ? `<span class="mb4-pill ${S.log.at(-1).d < 0 ? 'bad' : 'good'}">${signed(S.log.at(-1).d)}</span>` : ''}</div>${S.items.length ? `<div class="mb4-chips">${S.items.slice(-5).map((x) => `<span class="mb4-chip">${esc(label(S, x))}</span>`).join('')}${S.items.length > 5 ? `<span class="mb4-chip">+${S.items.length - 5}</span>` : ''}</div>` : ''}`; },
    render(el, api) {
        const S = api.state(), st = api.store, env = api.env, day = dayOf(env), cash = cashOf(S, env);
        st.jobs = Array.isArray(st.jobs) ? st.jobs : [];
        st.regular = Array.isArray(st.regular) ? st.regular : [];
        st.loans = Array.isArray(st.loans) ? st.loans : [];
        const fx = Number(st.fxRate) > 0 ? `≈ ${fmt(Math.round(cash * st.fxRate))} ${esc(st.fxUnit || '원')}` : '';
        const groups = new Map();
        for (const name of S.items) { const it = { name, from: S.gift?.[name.toLowerCase()] ?? '' }; (groups.get(kindOf(it)) ?? groups.set(kindOf(it), []).get(kindOf(it))).push(it); }
        const bag = GROUPS.filter(([g]) => groups.has(g)).map(([g, t]) => `${groups.size > 1 ? `<div class="mb4-hint">${t} ${groups.get(g).length}</div>` : ''}<div class="mb4-chips">${groups.get(g).map((x) => `<span class="mb4-chip">${esc(label(S, x.name))}${x.from ? ` <small>· ${esc(x.from)}</small>` : ''}<button class="mb4-x" data-act="drop" data-v="${esc(x.name)}" aria-label="하나 빼기">✕</button></span>`).join('')}</div>`).join('');
        const loans = st.loans.filter((l) => !l.paid);
        el.innerHTML = `<div class="mb4-hero"><small>가진 돈</small><div class="mb4-hero-n">${fmt(cash)} <small>${esc(st.unit ?? '')}</small></div>${fx ? `<small>${fx}</small>` : ''}
            <div class="mb4-btnrow"><input class="mb4-input mb4-short" data-f="amt" type="number" min="0" placeholder="금액"><button class="mb4-btn" data-act="plus">＋ 받음</button><button class="mb4-btn ghost" data-act="minus">− 씀</button></div></div>
        ${S.short.length ? card('', `⚠ 가진 돈보다 큰 지출이 ${S.short.length}번 있었어요.${st.strict ? ' 「엄격하게」라서 그 지출은 빼고 셌어요.' : ''}${S.short.slice(-2).reverse().map((s) => `<div class="mb4-quote"><b>${esc(s.why || '지출')} ${fmt(s.need)}</b> · 그때 가진 돈 ${fmt(s.had)} <small>#${s.i}</small></div>`).join('')}`, 'warn') : ''}
        ${card('👜 가방', `${S.items.length ? bag : hint('가진 물건이 아직 없어요.')}
            <div class="mb4-btnrow"><input class="mb4-input" data-f="item" maxlength="60" placeholder="물건 이름 (×2처럼 개수도)"><button class="mb4-btn ghost" data-act="add">넣기</button></div>`)}
        ${st.jobs.length ? card('⛏ 일거리', st.jobs.map((j, n) => `<div class="mb4-row"><span class="mb4-row-k">${esc(j.name)}</span><span class="mb4-row-v">일당 ${fmt(j.pay)}</span><button class="mb4-btn sm" data-act="work" data-v="${n}">일하기</button><button class="mb4-x" data-act="jdel" data-v="${n}" aria-label="지우기">✕</button></div>`).join('')) : ''}
        ${st.regular.length ? card('🔁 정기 수입 · 지출', st.regular.map((r, n) => `<div class="mb4-row"><span class="mb4-row-k">${esc(r.name)}</span><span class="mb4-row-v">${EVERY_KO[r.every] ?? ''} <b class="${r.amount < 0 ? 'mb4-bad' : 'mb4-good'}">${signed(r.amount)}</b></span><button class="mb4-x" data-act="rdel" data-v="${n}" aria-label="지우기">✕</button></div>`).join('') + hint(day == null ? '🧭 장면 앱을 켜면 날이 지날 때마다 저절로 들어오고 나가요.' : '날이 지날 때마다 저절로 들어오고 나가요.')) : ''}
        ${card('💸 빚', `${loans.length ? loans.map((l) => { const left = l.due != null && day != null ? l.due - day : null; return `<div class="mb4-row"><span class="mb4-row-k">${esc(l.lender)}</span><span class="mb4-row-v">${fmt(l.owed)} ${left == null ? '' : pill(left >= 0 ? `D-${left}` : `${-left}일 연체`, left < 0 ? 'bad' : '')}${l.item ? ` <small>맡긴 것: ${esc(l.item)}</small>` : ''}</span><button class="mb4-btn sm" data-act="repay" data-v="${st.loans.indexOf(l)}" ${cash >= l.owed ? '' : 'disabled'}>갚기</button></div>`; }).join('') : hint('빚이 없어요.')}
            <div class="mb4-btnrow"><input class="mb4-input" data-f="lender" maxlength="30" placeholder="누구에게"><input class="mb4-input mb4-short" data-f="owed" type="number" min="1" placeholder="얼마"><input class="mb4-input mb4-short" data-f="days" type="number" min="0" placeholder="며칠 안"><button class="mb4-btn ghost" data-act="borrow">빌림</button></div>`)}
        ${card('들어오고 나간 돈', S.log.length ? S.log.slice(-12).reverse().map((l) => `<div class="mb4-row"><span class="mb4-row-v">${esc(l.why || (l.d < 0 ? '씀' : '받음'))}</span><b class="${l.d < 0 ? 'mb4-bad' : 'mb4-good'}">${signed(l.d)}</b></div>`).join('') : empty('🧾', '아직 기록이 없어요', '이야기에서 돈을 쓰거나 받으면 쌓여요'))}
        <details class="mb4-card"><summary>⚙️ 돈 규칙</summary>
            <label class="mb4-label">처음 가진 돈<input class="mb4-input" data-act="set" data-k="startCash" type="number" value="${esc(st.startCash ?? 0)}"></label>
            <label class="mb4-label">돈 단위<input class="mb4-input" data-act="set" data-k="unit" maxlength="12" placeholder="원 · 골드 · 냥" value="${esc(st.unit ?? '')}"></label>
            <label class="mb4-label">보통 한 끼 값 (AI가 물가를 맞춰요)<input class="mb4-input" data-act="set" data-k="meal" type="number" min="0" value="${esc(st.meal ?? '')}"></label>
            <label class="mb4-sw"><span><b>엄격하게</b><small>가진 돈보다 큰 지출은 「못 샀음」으로 빼고 세요. 끄면 빚처럼 마이너스로 세고 경고만 해요</small></span><input type="checkbox" data-act="strict" ${st.strict ? 'checked' : ''}><i></i></label>
            <div class="mb4-btnrow"><input class="mb4-input" data-f="jname" maxlength="30" placeholder="일거리 이름"><input class="mb4-input mb4-short" data-f="jpay" type="number" min="1" placeholder="일당"><button class="mb4-btn ghost" data-act="jadd">일거리 추가</button></div>
            <div class="mb4-btnrow"><input class="mb4-input" data-f="rname" maxlength="30" placeholder="월급 · 집세…"><input class="mb4-input mb4-short" data-f="ramt" type="number" placeholder="+/−"><select class="mb4-input mb4-short" data-f="revery"><option value="day">매일</option><option value="week">매주</option><option value="month" selected>매달</option></select><button class="mb4-btn ghost" data-act="radd">정기 추가</button></div>
            <label class="mb4-label">현실 돈으로 보기 (1단위 = ?)<input class="mb4-input mb4-short" data-act="set" data-k="fxRate" type="number" min="0" step="any" value="${esc(st.fxRate ?? '')}"><input class="mb4-input mb4-short" data-act="set" data-k="fxUnit" maxlength="6" placeholder="원" value="${esc(st.fxUnit ?? '')}"></label>
        </details>`;
        const amt = () => Math.abs(Number(val(el, '[data-f="amt"]')) || 0);
        const save = () => { api.save(); api.redraw(); };
        acts(el, {
            plus: () => { if (amt()) api.fix('cash', `+${amt()} | 직접 넣음`); },
            minus: () => { if (amt()) api.fix('cash', `-${amt()} | 직접 뺌`); },
            add: () => { const t = val(el, '[data-f="item"]'); if (t) api.fix('got', t); },
            drop: (x) => { api.fix('lost', x); },
            set: (_v, inp) => { st[inp.dataset.k] = inp.type === 'number' ? Number(inp.value) || 0 : inp.value.trim(); save(); },
            strict: (_v, b) => { st.strict = b.checked; save(); },
            work: (n) => { const j = st.jobs[+n]; if (j && api.fix('cash', `+${j.pay} | ${j.name}`)) api.toast(`${j.name} · +${fmt(j.pay)}`); },
            jadd: () => { const name = val(el, '[data-f="jname"]'), pay = Math.abs(Number(val(el, '[data-f="jpay"]')) || 0); if (name && pay) { st.jobs.push({ name, pay }); save(); } },
            jdel: (n) => { st.jobs.splice(+n, 1); save(); },
            radd: () => { const name = val(el, '[data-f="rname"]'), amount = Number(val(el, '[data-f="ramt"]')) || 0, every = val(el, '[data-f="revery"]'); if (name && amount) { st.regular.push({ name, amount, every, from: day ?? 1 }); save(); } },
            rdel: (n) => { st.regular.splice(+n, 1); save(); },
            borrow: () => { const lender = val(el, '[data-f="lender"]'), owed = Math.abs(Number(val(el, '[data-f="owed"]')) || 0), days = val(el, '[data-f="days"]'); if (!lender || !owed) return; st.loans.push({ lender, owed, due: days !== '' && day != null ? day + Math.abs(+days) : null }); api.save(); api.fix('cash', `+${owed} | ${lender}에게 빌림`); },
            repay: (n) => { const l = st.loans[+n]; if (!l) return; if (api.fix('cash', `-${l.owed} | ${l.lender}에게 갚음`)) { l.paid = true; save(); } },
        });
    },
};
