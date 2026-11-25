// 🔁 Echo: notices habits that keep coming back in recent replies. Pure code: no classifier key, no model call.
// Ported from the third generation's worn.js: separate detectors, each with its own line, sent only while the habit
// lasts — repeated figures ("N years", "the Nth floor"), reaching back to the past, measuring and counting everything,
// talk that argues like a transcript (quoting back, if-then ultimatums) — plus this generation's repeated wording and
// same openings. The third generation found that four of these work better sent with every reply; the person can
// switch each one to "always" here.
import { sentences } from '../core/text.js';
import { esc, card, empty, hint, acts } from '../ui/kit.js';

// ── repeated wording and openings ─────────────────────────────────────────────────────────────────────────
const N = 4;   // words per phrase
const toks = (s) => String(s).toLowerCase().replace(/["“”'‘’*_()[\]…—-]/g, ' ').split(/\s+/).filter(Boolean);
export function repeated(texts, max = 3) {
    const seen = new Map();
    texts.forEach((t, n) => {
        for (const s of sentences(t)) {
            const w = toks(s);
            for (let i = 0; i + N <= w.length; i++) {
                const p = w.slice(i, i + N).join(' ');
                if (p.length < 12) continue;
                (seen.get(p) ?? seen.set(p, new Set()).get(p)).add(n);
            }
        }
    });
    const hits = [...seen].filter(([, set]) => set.size >= 2).map(([p, set]) => ({ p, n: set.size })).sort((a, b) => b.n - a.n || b.p.length - a.p.length);
    const out = [];
    for (const h of hits) {
        const ws = h.p.split(' ');
        if (out.some((o) => ws.filter((w) => o.includes(w)).length >= N - 1)) continue;
        out.push(h.p);
        if (out.length >= max) break;
    }
    return out;
}
export function sameOpening(texts) {
    const heads = texts.map((t) => toks(sentences(t)[0] ?? '').slice(0, 3).join(' ')).filter((h) => h.length >= 6);
    return heads.length >= 2 && new Set(heads.slice(-2)).size === 1 ? heads.at(-1) : '';
}

// ── figures written again and again (no lookbehind: an old browser would fail to load the file) ─────────────
const KO_DIGIT = /(\d+)\s?(주년|년|개월|달|주일|층|살|번째|시간|명|호실)/g;
const KO_NATIVE = /(^|[^가-힣])((?:두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무)\s?(?:달|살|번째|명|시간))/g;
const KO_SINO = /(^|[^가-힣])((?:이십|삼십|수십|수백|삼|사|오|육|칠|팔|구|십|백|천)\s?(?:주년|년|개월|층))/g;
const EN_NUM = /\b((?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ])?(?:\d+|one|two|three|four|five|six|seven|eight|nine)|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|a hundred|a thousand)[ -](years?|months?|weeks?|floors?|hours?|people)\b/gi;
const EN_ORD = /\b(\d+(?:st|nd|rd|th)|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[ -](floor|year|storey)\b/gi;
const fkey = (t) => String(t).toLowerCase().replace(/[\s-]+/g, ' ').trim().replace(/s$/, '');
function figures(text) {
    const out = new Map(), add = (raw) => { const k = fkey(raw); if (k && !out.has(k)) out.set(k, String(raw).toLowerCase().replace(/\s+/g, ' ').trim()); };
    const s = String(text ?? '');
    for (const m of s.matchAll(KO_DIGIT)) add(m[0]);
    for (const m of s.matchAll(KO_NATIVE)) add(m[2]);
    for (const m of s.matchAll(KO_SINO)) add(m[2]);
    for (const m of s.matchAll(EN_NUM)) add(m[0]);
    for (const m of s.matchAll(EN_ORD)) add(m[0]);
    return out;
}
// ── reaching back to the past (flashbacks, "years ago", "remember") ───────────────────────────────────────
const RECALL = [
    /(?:년|달|개월|주|해|겨울|여름) ?전|그때|그 ?시절|당시|예전|옛날|지난번|때부터|이후로|처음 만[났난]|기억(?:하|해|났|난|나|이 |을 |속)|떠올[리랐렸]|회상/g,
    /\b(?:years?|winters?|summers?|months?|weeks?|nights?) (?:ago|earlier|before|back)\b|\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+) (?:years|winters|summers|months) of\b|\bback (?:then|when|in|aboard)\b|\bremember(?:ed|s|ing)?\b|\brecall(?:ed|s|ing)?\b|\bused to\b|\bthat (?:day|night|winter|summer)\b|\ball those (?:years|months)\b|\b(?:from|by|in) memory\b|\bmemor(?:y|ies)\b|\bthe first time\b|\bjust like (?:before|always)\b|\bold (?:bruises?|wounds?|scars?|habits?|days)\b|\bever since\b|\bonce,? (?:long|years)\b/gi,
];
const recalls = (text) => RECALL.reduce((n, re) => n + (String(text ?? '').match(re) ?? []).length, 0);
// ── counting and measuring everything ─────────────────────────────────────────────────────────────────────
const EN_ANY = /\b(?:\d+(?:[.,]\d+)?|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:-(?:one|two|three|four|five|six|seven|eight|nine|year|inch|foot|pound|second|minute|hour|day))?\b/gi;
const KO_ANY = /\d+(?:[.,]\d+)?|(?:두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|몇)\s?(?:개|명|초|분|시간|걸음|발짝|뼘|미터|센티|인치|살|층|년|달|주|잔|장|권|줄|마디|박자)/g;
function heavy(text) {
    const s = String(text ?? ''), len = s.length || 1, ko = (s.match(/[가-힣]/g) ?? []).length / len > 0.3;
    const n = (s.match(ko ? KO_ANY : EN_ANY) ?? []).length;
    return n >= 6 && (n * 1000) / len >= (ko ? 3.5 : 1.5);
}
// ── talk that argues like a transcript (counted only inside quotation marks) ──────────────────────────────
const SPEECH = /["“「『]([^"”」』\n]{2,600})["”」』]/g;
const SPAR = [
    /\byou (?:just |already )?(?:said|told me|called|promised|swore|claimed)\b|\b(?:seconds?|minutes?|hours?|days?|nights?) ago,? you\b|\byou(?:'re| were) the one\b|\bmake up your mind\b|\bbecause you\b|\byou (?:always|never)\b|\b(?:first|one minute|back (?:in|on|at) [^,.!?]{1,30}) you\b|\b(?:and )?now (?:you|you're|i'm|all you)\b|\bwhich is it\b|\bso which\b/gi,
    /(?:^|[.!?—]\s*)(?:and |but |so )?if (?:you|you're|i|i'm|we|he|she|they|that)\b[^.!?]{3,120}[,—][^.!?]{2,}/gi,
    /했잖아|었잖아|았잖아|다고 했|라고 했|다며|라며|말했잖|방금(?:은|엔|까지|도)? |아까(?:는|도|부터)? |네가 먼저|니가 먼저|그래 놓고|해 놓고|이제 와서/g,
    /만약|(?:하면|으면|다면|라면) [^.!?]{0,24}(?:거야|테니까|줄 알아|겠어|거니까|을걸|ㄹ걸)/g,
];
// -> { pat: case-building phrases, long: spoken lines that run on, lines: spoken lines }
function talkOf(text) {
    let pat = 0, long = 0, lines = 0;
    for (const m of String(text ?? '').matchAll(SPEECH)) {
        lines++;
        for (const re of SPAR) pat += (m[1].match(re) ?? []).length;
        if (m[1].trim().split(/\s+/).length > (/[가-힣]/.test(m[1]) ? 16 : 25)) long++;   // a spoken line that runs on is a speech, not talk
    }
    return { pat, long, lines };
}
// A reply argues like a transcript when case-building phrases are a real share of its talk, or when most of its talk is
// speeches. Measured live: long replies (7,000–13,000 letters, 20–46 spoken lines) carry 3–12 longer lines and 0–4
// such phrases as ordinary talk, so plain counts of 3 fired on every reply.
export function spars(text) {
    const t = talkOf(text);
    return (t.pat >= 3 && t.pat >= t.lines * 0.1) || (t.long >= 3 && t.long >= t.lines / 2);
}

// texts: the last replies, oldest first.
//   nums    figures written in 3 of the last 6 replies, or in both of the last two (4 at most, as written)
//   recall  2 of the last 3 replies reached back three times or more
//   dense   2 of the last 3 replies measured or counted nearly everything
//   spar    one of the last 5 replies cites, builds a case or bargains in a real share of its talk (see spars)
//   rep     4-word phrases in two of the last three replies · open: the last two opened the same way
export function wornOf(texts) {
    const list = (texts ?? []).slice(-6), n = list.length, count = new Map(), raw = new Map(), late = new Map();
    list.forEach((t, i) => { for (const [k, r] of figures(t)) { count.set(k, (count.get(k) ?? 0) + 1); if (!raw.has(k)) raw.set(k, r); if (i >= n - 2) late.set(k, (late.get(k) ?? 0) + 1); } });
    const nums = [...count.keys()].filter((k) => count.get(k) >= 3 || (n >= 2 && late.get(k) >= 2)).sort((a, b) => count.get(b) - count.get(a)).slice(0, 4).map((k) => raw.get(k));
    const last3 = list.slice(-3);
    return {
        nums,
        recall: last3.filter((t) => recalls(t) >= 3).length >= 2,
        dense: last3.filter(heavy).length >= 2,
        spar: list.slice(-5).some(spars),
        rep: last3.length >= 2 ? repeated(last3) : [],
        open: last3.length >= 2 ? sameOpening(last3) : '',
    };
}

export const KINDS = [
    { id: 'rep', ko: '같은 표현', icon: '🔁', always: false, hint: '네 낱말이 똑같이 되풀이될 때' },
    { id: 'open', ko: '같은 첫머리', icon: '↩️', always: false, hint: '답이 같은 말로 시작할 때' },
    { id: 'nums', ko: '같은 숫자', icon: '🔢', always: false, hint: '「몇 년」 「몇 층」 같은 숫자가 계속 나올 때' },
    { id: 'recall', ko: '자꾸 옛날 얘기', icon: '🕰', always: true, hint: '회상 · 「그때」 · 「몇 년 전」이 쌓일 때' },
    { id: 'dense', ko: '뭐든 재고 세기', icon: '📏', always: true, hint: '몇 걸음 · 몇 초 · 몇 인치처럼 다 잴 때' },
    { id: 'spar', ko: '따지는 말싸움', icon: '⚖️', always: true, hint: '「아까 네가 그랬잖아」 · 「만약 …하면」' },
    { id: 'plain', ko: '설명하는 서술', icon: '🗣', always: true, hint: '눈짓 · 침묵의 뜻을 서술이 풀어 줄 때 (따로 세지 않음 · 「늘」일 때만)' },
];
const LINE = {
    rep: (w) => `Recent replies reused this wording: ${w.rep.map((p) => `"${p}"`).join(', ')}. Do not use it or a close variant in this reply.`,
    open: (w) => `The last replies opened the same way ("${w.open} …"). Open this one differently.`,
    nums: (w) => `Already written several times: ${w.nums.join(', ')}. This reply does not state these again; if one is needed, a plain word stands in (then, that long, upstairs).`,
    recall: () => 'Past: this reply stays in its own present. One brief glance back at most; no listing of old events, no remembered places, no "how long it has been". What a character knows shows only in what they do now.',
    dense: () => 'Do not measure. No inches, steps, breaths, seconds or minutes counted out, no "three inches", "for three beats". Say it the way a person would (a little, close, a moment, a few steps). Numbers only where people really use them: a room number, a time on the clock, a price said aloud.',
    spar: () => 'Talk: people here do not argue like lawyers. Nobody quotes back what the other said or did earlier, nobody lays out reasons, conditions or consequences ("if you…, I\'ll…"). Keep the back-and-forth going; each line is short and alive — it answers sideways, trails off, teases, or lands on nothing.',
    plain: () => 'Narration shows and does not explain. No sentence spells out why someone did something or what a look or a silence meant; the act, the line or the silence is enough.',
};
// mode per kind: 'auto' (only while the habit lasts) · 'always' · 'off'. Defaults: auto for all but plain (off).
export const modeOf = (cfg, id) => cfg?.modes?.[id] ?? (id === 'plain' ? 'off' : 'auto');
const pastAsked = (t) => /remember|memor|recall|flashback|기억|회상|과거|옛날|그때/i.test(String(t ?? ''));
const active = (w, id) => (id === 'rep' ? w.rep.length > 0 : id === 'open' ? !!w.open : id === 'nums' ? w.nums.length > 0 : id === 'plain' ? false : !!w[id]);
function found(env) {
    const w = wornOf(env.recent(6));
    const on = [];
    for (const k of KINDS) {
        const m = modeOf(env.cfg, k.id);
        if (m === 'off') continue;
        if (k.id === 'recall' && pastAsked(env.lastUser?.())) continue;   // the person asked for the past: their choice
        if (active(w, k.id)) on.push({ id: k.id, auto: true });
        else if (m === 'always' && !['rep', 'open', 'nums'].includes(k.id)) on.push({ id: k.id, auto: false });
    }
    return { w, on };
}

export default {
    api: 1,
    id: 'echo',
    name: '되풀이 막기',
    icon: '🔁',
    color: '#2a9d8f',
    cost: 'zero',
    desc: '같은 표현 · 같은 첫머리가 답마다 되풀이되면, 되풀이되는 동안만 살짝 말려요.',
    note(_S, env) {
        const { w, on } = found(env);
        const now = on.map((x) => LINE[x.id](w));
        return now.length ? { now } : null;
    },
    hud(_S, env) { const n = found(env).on.filter((x) => x.auto).length; return n ? [`🔁 ${n}`] : []; },
    widget(_S, env) {
        const { w, on } = found(env), auto = on.filter((x) => x.auto);
        return auto.slice(0, 3).map((x) => { const k = KINDS.find((y) => y.id === x.id); return `<div class="mb4-row"><span class="mb4-row-k">${k.icon} ${esc(k.ko)}</span><span class="mb4-row-v">${esc(x.id === 'rep' ? `“${w.rep[0]}”` : x.id === 'nums' ? w.nums.join(', ') : x.id === 'open' ? `“${w.open} …”` : '말리는 중')}</span></div>`; }).join('');
    },
    widgetTitle: '되풀이되는 버릇',
    render(el, api) {
        const env = api.env, cfg = api.cfg, { w, on } = found(env);
        cfg.modes = cfg.modes && typeof cfg.modes === 'object' ? cfg.modes : {};
        const now = new Map(on.map((x) => [x.id, x]));
        const detail = (id) => (id === 'rep' ? w.rep.map((p) => `<div class="mb4-quote"><q>${esc(p)}</q></div>`).join('') : id === 'open' && w.open ? `<div class="mb4-quote"><q>${esc(w.open)} …</q></div>` : id === 'nums' && w.nums.length ? `<div class="mb4-chips">${w.nums.map((x) => `<span class="mb4-chip">${esc(x)}</span>`).join('')}</div>` : '');
        const rows = KINDS.map((k) => {
            const m = modeOf(cfg, k.id), x = now.get(k.id);
            const state = x ? (x.auto ? '<span class="mb4-pill bad">지금 말리는 중</span>' : '<span class="mb4-pill">늘 보냄</span>') : '<span class="mb4-pill good">조용</span>';
            const opts = (k.id === 'rep' || k.id === 'open' || k.id === 'nums' ? ['auto', 'off'] : ['auto', 'always', 'off']).map((v) => `<option value="${v}" ${m === v ? 'selected' : ''}>${{ auto: '보일 때만', always: '늘', off: '끔' }[v]}</option>`).join('');
            return `<div class="mb4-row"><span class="mb4-row-k">${k.icon} ${esc(k.ko)}</span><span class="mb4-row-v">${state}</span></div>
                <div class="mb4-btnrow tight"><small class="mb4-dim" style="flex:1">${esc(k.hint)}</small><select class="mb4-input" style="flex:0 0 112px;width:112px" data-act="mode" data-k="${k.id}">${opts}</select></div>${x ? detail(k.id) : ''}`;
        }).join('<hr class="mb4-hr">');
        el.innerHTML = card('🔁 버릇 살피기', rows)
            + hint('최근 답 6개를 코드로만 살펴요(AI 호출 0). 「보일 때만」은 버릇이 보이는 동안만 한 줄을 보내고, 멈추면 저절로 빠져요. 3세대 시험에서는 옛날 얘기 · 재고 세기 · 말싸움 · 설명하는 서술은 「늘」이 더 잘 들었어요.')
            + (on.length ? '' : empty('🔁', '지금은 되풀이되는 버릇이 없어요', 'AI에 아무것도 안 보내요'));
        acts(el, { mode: (_v, s) => { cfg.modes[s.dataset.k] = s.value; api.save(); api.redraw(); } });
    },
};
