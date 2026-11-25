// 🔒 Secrets: what the person wants kept closed in the story. Ported from the third generation's vault.
//
// Five layers keep a secret (none of them sends the secret itself to the main model):
//   1. the main model gets only what may show (a habit, a mood) and the keeper's cover — never the cause
//   2. screen: any outgoing line, from any app, that holds a give-away word or a piece of the secret is held back
//      (code, not a request; the person's own memo / director lines are never held back)
//   3. guard: the reader reports, with a quote, when a reply reveals it, drops a clue, has someone reasoning toward
//      it, has the keeper lie to cover it, reaches the moment it may open, or lets someone learn it; and each new reply
//      is scanned for give-away words in code (no call)
//   4. rhythm: between rare "may show" beats the secret is simply not on the page (the quiet line), so a model that
//      sees "hidden" every reply does not keep pointing at it
//   5. sore spots: only the person's own message can touch them; then a small reaction may show, nothing is explained
//
// Everything is folded from what was recorded per reply, so swipes, deletions and branches stay right.
import { clip, shortId, nameInText, quoteOk } from '../core/text.js';
import { esc, card, hint, acts, empty, pill } from '../ui/kit.js';

// ── words ──────────────────────────────────────────────────────────────────────────────────────────────────
const norm = (x) => String(x ?? '').toLowerCase().replace(/[“”"'‘’「」『』]/g, '').replace(/\s+/g, ' ').trim();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A sign word is in a text: Korean (any non-latin) as a substring, latin words on a word start ("key" in "keys", not in "monkey").
export function hasSign(text, sign) {
    const t = norm(text), s = norm(sign);
    if (s.length < 2) return false;
    if (!/^[a-z0-9 '\-]+$/.test(s)) return t.includes(s);
    return new RegExp(`(^|[^a-z0-9])${reEsc(s)}`, 'i').test(t);
}
const STOP = new Set(('the a an and or but of to in on at by for from with without into onto over under about after before than then that this these those there here ' +
    'is are was were be been being am do does did done have has had having will would can could should may might must not no yes ' +
    'he she it they them him her his hers its their we us our you your me my mine i what which who whom whose when where why how ' +
    'all any some each every one more most much many very just only also even still too so as if up down out off again back new own same other such ' +
    'let get got make made take took give gave go went come came say said tell told ask asked').split(' '));
// Content words of a phrase (Korean particles trimmed, English function words left out).
export const words = (t) => String(t ?? '').toLowerCase().replace(/[「」『』"“”'‘’.,!?…()[\]:;—–-]/g, ' ').split(/\s+/)
    .map((w) => w.replace(/(이라는|라는|이란|이|가|은|는|을|를|의|에|도|만)$/, ''))
    .filter((w) => w.length >= 2 && !(/^[a-z0-9']+$/.test(w) && (w.length < 3 || STOP.has(w))));
const hit = (c, w) => (/^[a-z0-9']+$/.test(w) ? new RegExp(`(^|[^a-z0-9])${reEsc(w)}`).test(c) : c.includes(w));
// Does `cue` touch any content word of `phrase`?
export function touches(phrase, cue) { const c = String(cue ?? '').toLowerCase(); return !!c && words(phrase).some((w) => hit(c, w)); }
// 14-letter windows of the secret: a line that copies a piece of it carries it out even without a sign word.
const pieces = (v, n = 14) => { const c = norm(v), out = []; for (let i = 0; i + n <= c.length; i += 4) out.push(c.slice(i, i + n)); return c && c.length < n ? [c] : out; };
// Does a line carry this secret out? (a give-away word, or a piece of the secret itself)
export function carries(line, e) { const l = norm(line); return e.signs.some((s) => hasSign(l, s)) || pieces(e.v).some((p) => l.includes(p)); }
// Does a line copy a piece of the secret text itself?
export const copies = (line, e) => { const l = norm(line); return pieces(e.v).some((p) => l.includes(p)); };
// A line with one give-away word taken out ("…" in its place; a latin word goes to its end, as hasSign matches it).
export function strip(line, sign) {
    const s = String(sign ?? '').trim().replace(/[“”"'‘’「」『』]/g, '');
    if (s.length < 2) return line;
    const body = reEsc(s).replace(/\s+/g, '\\s+');
    const re = /^[a-z0-9 '\-]+$/i.test(s) ? new RegExp(`(^|[^a-z0-9])${body}[a-z0-9]*`, 'gi') : new RegExp(body, 'gi');
    return String(line).replace(re, (m, a) => `${typeof a === 'string' ? a : ''}…`);
}

// Words that mean "dig into it" / "let it out" in the person's message (Korean and English; never sent anywhere).
const ASK = ['why', 'who are you', 'remember', 'recognize', 'truth', 'secret', 'hiding', 'what happened', 'tell me', '왜', '정체', '기억', '설마', '눈치', '숨기', '숨긴', '진짜', '사실은', '말해', '무슨 일'];
const LET = ['reveal', 'confess', 'come clean', 'tell the truth', 'admit', 'own up', '털어놔', '털어놓', '고백', '사실대로', '밝혀', '실토'];

// ── the person's list ──────────────────────────────────────────────────────────────────────────────────────
const splitList = (x) => (Array.isArray(x) ? x : String(x ?? '').split(/[,，、\n]/)).map((w) => String(w).trim().replace(/^["'“”]|["'“”]$/g, '')).filter((w) => w.length >= 2).slice(0, 12);
export const idOf = (v) => shortId('s', v);
// One secret, tidied. Older saves ({ t, words }) read the same.
export function tidy(x) {
    const v = clip(x?.v ?? x?.t ?? '', 400);
    return {
        id: String(x?.id || (v ? idOf(v) : '')), v, who: clip(x?.who ?? '', 60),
        signs: splitList(x?.signs ?? x?.words), shows: clip(x?.shows ?? '', 200), cover: clip(x?.cover ?? '', 200),
        opens: clip(x?.opens ?? '', 120), sore: clip(x?.sore ?? '', 120), vOrig: clip(x?.vOrig ?? '', 400), auto: !!x?.auto,
    };
}
export const entries = (store) => (Array.isArray(store?.list) ? store.list : []).map(tidy).filter((e) => e.v && e.id);
const whoOf = (w) => String(w ?? '').split(/\s*[-&,]\s*/).map((x) => x.trim()).filter(Boolean);

// ── reader lines ───────────────────────────────────────────────────────────────────────────────────────────
// "s1a2b revealed" · "s1a2b clue" · "s1a2b near" · "s1a2b lie" · "s1a2b opens" · "s1a2b known by Name"
// and, only by hand: "s1a2b open" · "s1a2b lock"
const READ = ['revealed', 'settled', 'rushed', 'clue', 'near', 'lie', 'opens', 'known'], HAND = ['open', 'lock'];
export function parseLine(v) {
    const m = String(v ?? '').trim().match(/^\[?\s*(s[a-z0-9]{1,8})\s*\]?\s*[:,-]?\s*(revealed|settled|rushed|clue|near|lie|opens|open|lock|known)\b(?:\s*(?:by|to)?\s*[:=]?\s*(.+))?$/i);
    if (!m) return null;
    return { id: m[1].toLowerCase(), kind: m[2].toLowerCase(), name: m[2].toLowerCase() === 'known' ? clip(String(m[3] ?? '').replace(/["“”|].*$/, '').trim(), 40) : '' };
}
// An older line ("leak: the ledger page") points at the secret whose words it carries, or at the only one there is.
function guess(text, list) {
    const t = String(text ?? '');
    const by = list.filter((e) => carries(t, e) || touches(e.v, t));
    return by.length === 1 ? by[0].id : list.length === 1 ? list[0].id : '';
}

// ── what the chat adds up to ───────────────────────────────────────────────────────────────────────────────
export const OPEN_AFTER = 4;     // a reveal stays in the chat this many messages on: the story has moved on with it out
export const LET_SPAN = 12;      // "may come out in this scene" lasts this many messages (about six replies)
export function view(S, env) {
    const list = entries(env.store), last = env.last ?? -1, ev = Array.isArray(S?.ev) ? S.ev : [];
    const lastText = (env.recent?.(1) ?? [])[0] ?? '';
    return list.map((e) => {
        const mine = ev.filter((x) => x.id === e.id);
        let open = false, why = '';
        for (const x of mine) {
            if (x.kind === 'open') { open = true; why = 'hand'; }
            else if (x.kind === 'opens') { open = true; why = 'gate'; }
            else if (x.kind === 'lock') { open = false; why = ''; }
            else if (x.kind === 'revealed' && last - x.i >= OPEN_AFTER) { open = true; why = 'story'; }
        }
        // the small sign the person allowed ("may show") is what the note asked for: it stays on the timeline but puts no
        // pressure on the keeper (seen live: the reader wrote it down as a clue, pressure rose and the beat stopped)
        const allowed = (x) => x.kind === 'clue' && !!e.shows && !!x.q && touches(e.shows, x.q) && !carries(x.q, e);
        const clues = mine.filter((x) => (x.kind === 'clue' || x.kind === 'near') && !allowed(x));
        const qs = new Set(clues.map((x) => norm(x.q))), at = new Set(clues.map((x) => x.i));
        const pressure = clues.some((x) => x.kind === 'near') || qs.size >= 4 ? 2 : qs.size >= 2 && at.size >= 2 ? 1 : 0;
        const slipNow = !open && (mine.some((x) => (x.kind === 'revealed' || x.kind === 'settled' || x.kind === 'rushed') && x.i === last) || (!!lastText && e.signs.some((s) => hasSign(lastText, s))));
        const close = !open && (slipNow || mine.some((x) => x.kind === 'revealed' && last - x.i < OPEN_AFTER));
        const letAt = env.store?.let?.[e.id];
        const letOn = !open && Number.isInteger(letAt) && last - letAt < LET_SPAN;
        const knows = [...new Set(mine.filter((x) => x.kind === 'known' && x.name).map((x) => x.name))];
        const stage = open ? 'open' : close ? 'close' : pressure >= 2 ? 'suspect' : pressure === 1 ? 'hint' : 'locked';
        return { e, open, why, stage, pressure, slipNow, letOn, knows, clues: clues.length, lies: mine.filter((x) => x.kind === 'lie').length, events: mine };
    });
}
const closed = (S, env) => view(S, env).filter((x) => !x.open);

// ── note pieces (English; nothing here holds the secret or a give-away word) ───────────────────────────────
const T = {
    quiet: (w) => `${w}: what ${w} keeps closed is not on this page — no hint, near-miss, object or pause pointing at it; ${w} is busy with what is in front of them.`,
    cover: (w, c) => `${w} seems to others ${c}; keep it quiet background, never hinted to be untrue.`,
    shows: (w, s) => `${w}: ${s} — this may show once, small; nobody explains why, the narration does not linger on it, and it stays closed.`,
    pov: (w, o) => `On this, the telling stays outside ${w}: what ${w} does and how it looks from where ${o} stands.`,
    suspect: (o) => `${o} has noticed more than ${o} lets on. ${o} asks nothing yet: watching, a small test, a question swallowed.`,
    step: (w) => `The previous reply came too close to something ${w} keeps closed. In this one, step back: no hints, no near-confessions, no meaningful silence about it.`,
    press: (w) => `If pressed in this reply, ${w} deflects — a half-answer, a change of subject — and settles nothing.`,
    sore: (w) => `The user's words brushed something sore for ${w}. A small reaction may show (a pause, a flinch, a change of subject); ${w} explains nothing.`,
    let: (w) => `${w} may let it come out in this scene if it comes naturally — when, how and how much is up to the scene; do not force it.`,
    general: 'Some things in this story are still kept closed. No character reveals, confirms or hints at them unless the user\'s own message forces it.',
};
const here = (env) => { const w = env.peek?.('scene')?.with; return Array.isArray(w) ? w : null; };
const same = (a, b) => norm(a) === norm(b) || nameInText(a, b) || nameInText(b, a);
function present(e, env) {
    const keepers = whoOf(e.who);
    if (!keepers.length) return true;
    const H = here(env);
    if (H) return keepers.every((k) => H.some((h) => same(h, k)));
    const t = `${(env.recent?.(1) ?? [])[0] ?? ''}\n${env.lastUser?.() ?? ''}`;
    return keepers.some((k) => nameInText(k, t));
}

export default {
    api: 1,
    id: 'secrets',
    name: '비밀',
    icon: '🔒',
    color: '#6c5ce7',
    cost: 'low',
    desc: 'AI가 숨겨야 할 비밀을 먼저 말해 버리지 않게 지켜요. 비밀 내용은 본편 AI에 보내지 않아요.',
    // asked only while a secret is still closed (no secret written = nothing added to the reader's prompt)
    keys: [{ id: 'leak', line: 'leak: [id] revealed | settled | rushed | clue | near | lie | opens | known by Name', quote: true, when: (S, env) => closed(S, env).length > 0 }],
    rules: (env) => (entries(env?.store).length ? [
        '"leak" only for Guarded items the NEW reply touched, by [id]: revealed = the text states or plainly shows what is kept; settled = the text decides an open question the entry keeps open; rushed = the text jumps to where the entry says the story should only end up; clue = the text adds a sign pointing to what is kept, where someone who does not know could see it; near = someone in the text is reasoning their way toward what is kept; lie = the keeper lies to cover it; opens = its "may open when" came; known by Name = Name now knows.',
        'The quote is copied from the text, 4-12 words. Plain hints with no new sign: no line. A mood is no clue. Quote the reply, never <user>.',
    ] : ['Nothing is Guarded: never write "leak".']),
    start: () => ({ ev: [] }),
    check({ v, q }, env) {
        const p = parseLine(v), list = entries(env.store);
        // a quote from the person's own message is their move, not a leak — except "opens": the moment a secret may
        // open is often something the person does (asks, finds, arrives), so its proof may be their words
        if (env.reply && q && p?.kind !== 'opens' && !quoteOk(q, env.reply)) return false;
        if (!p) return !env.text || !!guess(v, list);                  // an older free-text line: only when it points somewhere
        if (HAND.includes(p.kind)) return !env.text;                    // open / lock: only by hand, never from the reader
        if (!list.some((e) => e.id === p.id)) return false;
        return p.kind !== 'known' || (p.name.length > 0 && p.name.length <= 40);
    },
    reduce(S, { v, q, i }, env) {
        const p = parseLine(v);
        const x = p ? { id: p.id, kind: p.kind, ...(p.name ? { name: p.name } : {}) } : { id: guess(`${v} ${q}`, entries(env?.store)), kind: 'revealed', old: true };
        if (!x.id) return;
        S.ev.push({ ...x, q: clip(q, 140), i });
        if (S.ev.length > 300) S.ev.shift();
    },
    // What the reader sees: closed secrets only (an open one is no longer guarded).
    stateLines: (S, env) => closed(S, env).map(({ e, knows }) => [`Guarded [${e.id}] ${e.who || 'someone'} keeps: ${clip(e.v, 300)}`,
        e.signs.length ? `signs that give it away: ${e.signs.join(', ')}` : '', e.opens ? `may open when: ${e.opens}` : '', knows.length ? `already known by: ${knows.join(', ')}` : ''].filter(Boolean).join(' | ')),
    note(S, env) {
        const live = closed(S, env);
        if (!live.length) return null;
        const state = [], now = [], user = env.lastUser?.() ?? '', H = here(env), turn = Math.floor(Math.max(0, env.last ?? 0) / 2);
        const asked = ASK.some((w) => hasSign(user, w)), letting = LET.some((w) => hasSign(user, w));
        const onStage = live.filter((x) => present(x.e, env));
        for (const x of onStage) {
            const { e } = x, w = e.who || 'A character', keepers = whoOf(e.who);
            const other = (H ?? []).find((n) => !keepers.some((k) => same(k, n)) && !same(n, env.user ?? '')) ?? (H ?? []).find((n) => !keepers.some((k) => same(k, n))) ?? '';
            const named = keepers.some((k) => nameInText(k, user)) || touches(e.v, user);
            if (x.letOn || (letting && (named || onStage.length === 1))) { now.push(T.let(w)); continue; }
            const beat = !!e.shows && x.pressure === 0 && turn % 4 === 0 && !x.slipNow;
            if (beat) now.push(T.shows(w, e.shows)); else state.push(T.quiet(w));
            // the cover goes now and then (and whenever the person's message comes near it), not every reply
            if (e.cover && (turn % 4 === 2 || asked || touches(e.cover, user) || touches(e.shows, user))) state.push(T.cover(w, e.cover));
            if (x.slipNow) now.push(T.step(w));
            if (x.pressure >= 2 && other) now.push(T.suspect(other));
            if (e.sore && touches(e.sore, user)) now.push(T.sore(w));
            else if (asked && (named || onStage.length === 1)) now.push(T.press(w));
            if (other && keepers.length === 1 && (x.pressure >= 1 || turn % 6 === 0)) now.push(T.pov(w, other));
        }
        if (!state.length && !now.length) state.push(T.general);
        // the firewall works on this app's own lines too: a cover or "may show" written with a give-away word stays home
        const safe = (l) => !live.some((x) => carries(l, x.e));
        const out = { state: [...new Set(state)].filter(safe).slice(0, 4), now: [...new Set(now)].filter(safe).slice(0, 3) };
        return out.state.length || out.now.length ? out : null;
    },
    // Lines from other apps that would carry a closed secret out are held back (the person's own words excepted).
    // A line that copies a piece of the secret is held back whole. A line that only holds a give-away word (a place
    // or a thing named with it) goes out with that word taken out, so the rest of the fact still arrives.
    screen(line, from, S, env) {
        if (from === 'memo' || from === 'director') return true;
        const live = closed(S, env);
        if (!live.some((x) => carries(line, x.e))) return true;
        if (live.some((x) => copies(line, x.e))) return false;
        let out = String(line);
        for (const x of live) for (const s of x.e.signs) out = strip(out, s);
        return live.some((x) => carries(out, x.e)) ? false : out;
    },
    hud: (S, env) => { const v = closed(S, env); return v.some((x) => x.stage === 'close') ? ['⚠ 비밀'] : v.some((x) => x.stage === 'suspect') ? ['🤨 비밀'] : []; },
    chip: ({ v }) => {
        const p = parseLine(v);
        if (!p) return '⚠ 비밀이 드러남';
        return { settled: '⚠ 비밀의 답이 정해짐', rushed: '⚠ 비밀 쪽으로 너무 앞서감', revealed: '⚠ 비밀이 드러남', clue: '🔎 비밀 단서', near: '🤨 눈치챔', lie: '🤥 덮는 거짓말', opens: '🔓 비밀이 열릴 때', known: `👁 ${p.name}도 알게 됨`, open: '🔓 열림 (손)', lock: '🔒 다시 잠금' }[p.kind] ?? '';
    },
    widgetTitle: '비밀',
    widget(S, env) {
        const v = view(S, env);
        if (!v.length) return '';
        const shut = v.filter((x) => !x.open);
        return v.slice(0, 3).map((x) => `<div class="mb4-row"><span class="mb4-row-k">${ICON[x.stage]} ${esc(x.e.who || '비밀')}</span><span class="mb4-row-v">${pill(STAGE_KO[x.stage], TONE[x.stage])}</span></div>`).join('')
            + (v.length > 3 ? `<div class="mb4-row"><span class="mb4-row-v mb4-dim">외 ${v.length - 3}개 · 잠김 ${shut.length}</span></div>` : '');
    },
    onReply(env) {
        const L = env.store?.let;
        if (!L) return false;
        let ch = false;
        for (const [id, at] of Object.entries(L)) if (!Number.isInteger(at) || (env.last ?? 0) - at >= LET_SPAN) { delete L[id]; ch = true; }
        return ch;
    },
    css: `
.mb4-sec-f { display: block; margin-top: 8px; }
.mb4-sec-f small { color: var(--sub); font-size: 12px; }
.mb4-sec-top { display: flex; align-items: center; gap: 10px; }
.mb4-sec-lock { font-size: 26px; line-height: 1; }
.mb4-sec-top b { display: block; }
.mb4-sec-top small { color: var(--sub); }
.mb4-sec-v { position: relative; margin: 10px 0 4px; padding: 8px 10px; border-radius: 12px; background: rgba(70, 45, 35, .06); font-size: 13.5px; cursor: pointer; user-select: none; }
.mb4-sec-v span { filter: blur(6px); transition: filter .12s; }
.mb4-sec-v i { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 12px; color: var(--sub); }
.mb4-sec-v:active span, .mb4-sec-v:focus span { filter: none; }
.mb4-sec-v:active i, .mb4-sec-v:focus i { display: none; }
.mb4-sec-tl { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.mb4-sec-tl div { display: flex; gap: 6px; align-items: baseline; }
.mb4-sec-tl q { color: var(--sub); font-style: italic; overflow-wrap: anywhere; }
.mb4-sec-tl small { margin-left: auto; color: var(--sub); flex: none; }
.mb4-sec-card.st-close { box-shadow: inset 3px 0 0 var(--bad); }
.mb4-sec-card.st-suspect { box-shadow: inset 3px 0 0 var(--mid); }
.mb4-sec-card.st-open { opacity: .75; }
@media (prefers-reduced-motion: reduce) { .mb4-sec-v span { transition: none; } }
`,
    render(el, api) {
        const st = api.store, S = api.state() ?? { ev: [] }, env = api.env;
        st.list = (Array.isArray(st.list) ? st.list : []).map((x) => ({ ...x, ...tidy(x) }));   // older saves get ids and lists once
        st.let = st.let && typeof st.let === 'object' ? st.let : {};
        const V = new Map(view(S, env).map((x) => [x.e.id, x]));
        const names = peopleOf(env);
        const field = (n, k, label, ph, long = false) => `<label class="mb4-sec-f"><small>${label}</small>${long
            ? `<textarea class="mb4-input" rows="2" data-act="edit" data-n="${n}" data-k="${k}" placeholder="${esc(ph)}">${esc(k === 'signs' ? st.list[n].signs.join(', ') : st.list[n][k] ?? '')}</textarea>`
            : `<input class="mb4-input" data-act="edit" data-n="${n}" data-k="${k}" placeholder="${esc(ph)}" value="${esc(k === 'signs' ? st.list[n].signs.join(', ') : st.list[n][k] ?? '')}">`}</label>`;
        const cardOf = (s, n) => {
            const x = V.get(s.id);
            if (!s.v) return card(`🔒 새 비밀`, `${field(n, 'v', '숨길 내용', '예: 등대지기는 열쇠를 팔아 버렸다', true)}${field(n, 'who', '누가 지키나', '이름 (둘이면 A-B)')}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="del" data-v="${n}">지우기</button></div>`);
            const evs = (x?.events ?? []).slice(-6).reverse().map((e) => `<div>${EV[e.kind] ?? '·'} <b>${esc(EV_KO[e.kind] ?? e.kind)}${e.name ? ` · ${esc(e.name)}` : ''}</b>${e.q ? ` <q>${esc(e.q)}</q>` : ''}<small>#${e.i}</small></div>`).join('');
            const knows = [...whoOf(s.who).map((w) => pill(`🗝 ${w}`)), ...(x?.knows ?? []).map((w) => pill(`✓ ${w}`, 'good')),
                ...names.filter((w) => !whoOf(s.who).some((k) => same(k, w)) && !(x?.knows ?? []).some((k) => same(k, w))).slice(0, 6).map((w) => pill(`· ${w}`, 'mb4-dim'))].join(' ');
            const gauge = x?.open ? 100 : Math.min(100, Math.round(((x?.clues ?? 0) / 4) * 100));
            return `<section class="mb4-card mb4-sec-card st-${x?.stage ?? 'locked'}">
                <div class="mb4-sec-top"><span class="mb4-sec-lock">${ICON[x?.stage ?? 'locked']}</span><span><b>${esc(s.who || '누구의 비밀인지 아직 몰라요')}</b><small>${esc(STAGE_KO[x?.stage ?? 'locked'])}${x?.letOn ? ' · 이번 장면에 털어놔도 돼' : ''}${x?.open && x.why ? ` · ${WHY_KO[x.why]}` : ''}</small></span></div>
                <div class="mb4-sec-v" tabindex="0"><span>${esc(s.v)}</span><i>누르고 있으면 보여요</i></div>
                <div class="mb4-steps">${STAGES.map((k, j) => `<span class="mb4-step${j <= STAGES.indexOf(x?.stage ?? 'locked') ? ' on' : ''}">${ICON[k]}</span>`).join('')}</div>
                <div class="mb4-row"><span class="mb4-row-k">🔎 단서 ${x?.clues ?? 0} / 4</span><span class="mb4-row-v"><span class="mb4-meter"><i class="${gauge >= 75 ? 'bad' : gauge >= 25 ? 'mid' : ''}" style="width:${gauge}%"></i></span></span></div>
                ${x?.lies ? `<div class="mb4-row"><span class="mb4-row-k">🤥 덮는 거짓말</span><span class="mb4-row-v">${x.lies}번</span></div>` : ''}
                <div class="mb4-chips" style="margin-top:8px">${knows}</div>
                ${evs ? `<div class="mb4-sec-tl">${evs}</div>` : '<p class="mb4-hint">아직 아무 일도 없었어요. 단서나 들킬 뻔한 순간이 생기면 여기 쌓여요.</p>'}
                <div class="mb4-btnrow">
                    ${x?.open ? `<button class="mb4-btn ghost sm" data-act="lock" data-v="${esc(s.id)}">🔒 다시 잠그기</button>` : `<button class="mb4-btn ghost sm" data-act="open" data-v="${esc(s.id)}">🔓 열림으로 표시</button>
                    <button class="mb4-btn ${x?.letOn ? '' : 'ghost '}sm" data-act="let" data-v="${esc(s.id)}">${x?.letOn ? '✓ 털어놔도 돼 (이 장면)' : '이번 장면에 털어놔도 돼'}</button>`}
                </div>
                <details class="mb4-card" style="margin-top:10px"><summary>✏️ 고치기</summary>
                    ${field(n, 'v', '숨길 내용', '', true)}${s.vOrig ? `<p class="mb4-hint">처음 적은 말: ${esc(s.vOrig)}</p>` : ''}
                    ${field(n, 'who', '누가 지키나', '이름 (둘이면 A-B)')}
                    ${field(n, 'signs', '들키면 안 되는 낱말 (쉼표로)', '이 낱말이 답에 나오면 경고해요', true)}
                    ${field(n, 'shows', '살짝 보여도 되는 것', '버릇 · 기분 같은 겉모습')}
                    ${field(n, 'cover', '남들 눈에 보이는 모습', '예: 무뚝뚝한 이웃')}
                    ${field(n, 'opens', '언제 열려도 되나', '예: 누군가 장부를 직접 펼쳐 볼 때')}
                    ${field(n, 'sore', '아픈 곳 (내 말이 건드릴 때만)', '예: 바다, 아버지')}
                    <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="del" data-v="${n}">이 비밀 지우기</button></div>
                </details>
            </section>`;
        };
        const blanks = st.list.filter((s) => s.v && (!s.who || !s.signs.length || !s.shows || !s.cover || !s.opens)).length;
        el.innerHTML = `${hint('비밀 내용은 「답을 읽는 AI」만 봐요. 본편 AI에는 「지금은 페이지에 없음」 같은 줄과, 내가 허락한 겉모습만 가요.')}
            ${st.list.length ? st.list.map(cardOf).join('') : empty('🔒', '아직 비밀이 없어요', '아래에서 하나 적어 보세요')}
            <div class="mb4-btnrow"><button class="mb4-btn wide" data-act="add">＋ 비밀 추가</button></div>
            ${blanks ? `<div class="mb4-btnrow"><button class="mb4-btn ghost wide" data-act="fill">✨ 빈 칸 채우기 (${blanks}개 · AI 1번)</button></div>${hint('들키는 낱말 · 보여도 되는 것 · 겉모습 · 열릴 때를 채워요. 이미 적은 칸은 그대로 둬요.')}` : ''}`;
        const save = () => { api.save(); api.redraw(); };
        acts(el, {
            add: () => { st.list.push({ v: '', who: '', signs: [] }); save(); },
            del: (n) => { const s = st.list[+n]; if (s?.id) delete st.let[s.id]; st.list.splice(+n, 1); save(); },
            edit: (_v, inp) => {
                const s = st.list[+inp.dataset.n], k = inp.dataset.k;
                if (!s) return;
                if (k === 'signs') s.signs = splitList(inp.value);
                else s[k] = inp.value.trim();
                if (k === 'v' && s.v && !s.id) s.id = idOf(s.v);   // the id is set once and kept, so edits keep its history
                api.save();
                if (k === 'v' || k === 'who') api.redraw();
            },
            open: (id) => { if (api.fix('leak', `${id} open`)) api.toast('열림으로 표시했어요. 이 답을 지우거나 넘기면 되돌아가요.'); },
            lock: (id) => { if (api.fix('leak', `${id} lock`)) api.toast('다시 잠갔어요.'); },
            let: (id) => { if (Number.isInteger(st.let[id]) && (env.last ?? 0) - st.let[id] < LET_SPAN) delete st.let[id]; else st.let[id] = env.last ?? 0; save(); },
            fill: async (_v, b) => {
                b.disabled = true; b.textContent = '채우는 중…';
                const r = await fillSecrets(st.list, { ask: api.ask, names, sample: (env.recent?.(2) ?? []).join('\n') });
                save();
                api.toast(r.failed && !r.filled ? '채우지 못했어요. 연결을 확인해 주세요.' : `${r.filled}개 채웠어요.`);
            },
        });
    },
};

const STAGES = ['locked', 'hint', 'suspect', 'close', 'open'];
const ICON = { locked: '🔒', hint: '👀', suspect: '🤨', close: '⚠️', open: '🔓' };
const STAGE_KO = { locked: '잠김', hint: '단서가 보임', suspect: '눈치채는 중', close: '들킬 뻔', open: '열림' };
const TONE = { locked: 'good', hint: '', suspect: '', close: 'bad', open: '' };
const WHY_KO = { hand: '내가 열었어요', gate: '열릴 때가 왔어요', story: '이야기에서 밝혀졌어요' };
const EV = { settled: '⚠️', rushed: '⏩', revealed: '⚠️', clue: '🔎', near: '🤨', lie: '🤥', opens: '🔓', known: '👁', open: '🔓', lock: '🔒' };
const EV_KO = { settled: '답이 정해짐', rushed: '너무 앞서감', revealed: '드러남', clue: '단서', near: '눈치', lie: '거짓말로 덮음', opens: '열릴 때가 옴', known: '알게 됨', open: '열림으로 표시', lock: '다시 잠금' };

// Names the story knows (for "who knows" and for the fill prompt): people app, scene, the two names on screen.
function peopleOf(env) {
    const out = [];
    const add = (n) => { const t = clip(n, 40); if (t && !out.some((x) => same(x, t))) out.push(t); };
    for (const n of Object.keys(env.peek?.('people')?.list ?? {})) add(n);
    for (const n of env.peek?.('scene')?.with ?? []) add(n);
    add(env.char); add(env.user);
    return out.slice(0, 30);
}

// ── fill blanks with one tap call (up to 6 secrets per call) ───────────────────────────────────────────────
export function fillPrompt(list, names, sample) {
    const items = list.map((x, k) => `#${k + 1}\nwho: ${x.who || '?'}\nsecret: ${clip(x.v, 400)}`).join('\n\n');
    return `You help set up secrets for a role-play story. A secret is kept from the story's writer: the writer only gets the cover and, now and then, a small outward sign. Later every reply is checked for the give-away words.

People in the story: ${names.length ? names.join(', ') : '(unknown)'}
How the story is written (a recent bit, for its language and tone):
"""
${clip(sample, 900) || '(no story yet)'}
"""

For each secret below, fill in:
- secret: the secret rewritten as one clear English sentence (translate it if written in another language). Same facts; invent nothing.
- who: the person who keeps it (one of the people above when it fits; two keepers as "A-B"). Keep a given name as written.
- signs: 4 to 8 give-away words or short phrases that would only show up in the story text when the secret is out or nearly out. Write them in the language the story is written in; if that is not English, add the English words too. Plain words of ordinary scenes are not signs.
- shows: one small outward sign the keeper may show without giving it away (a habit, a mood). No sign word.
- cover: how the keeper looks to the people around (a few words). No sign word.
- opens: when the secret may come out (one short phrase).
Write secret, shows, cover and opens in English.

${items}

Answer only in this form, one block per secret, then </secrets>:
<secrets>
#1
secret: ...
who: ...
signs: word, word, word
shows: ...
cover: ...
opens: ...
</secrets>`;
}
export function parseFill(text, n) {
    const body = (String(text ?? '').match(/<secrets>([\s\S]*?)(<\/secrets>|$)/i) ?? [, String(text ?? '')])[1];
    const out = Array.from({ length: n }, () => null);
    for (const blk of body.split(/^\s*#(?=\d+\s*$)/m)) {
        const m = blk.match(/^(\d+)\s*\n([\s\S]*)$/);
        if (!m) continue;
        const k = +m[1] - 1;
        if (k < 0 || k >= n) continue;
        const o = {};
        for (const line of m[2].split('\n')) { const mm = line.match(/^\s*(secret|who|signs|shows|cover|opens)\s*:\s*(.*)$/i); if (mm) o[mm[1].toLowerCase()] = mm[2].trim(); }
        out[k] = o;
    }
    return out;
}
// Fills only empty fields; what the person wrote stays. Mutates the list. -> { filled, failed }
export async function fillSecrets(list, { ask, names = [], sample = '' }) {
    const todo = list.filter((x) => x.v && (!x.who || !x.signs?.length || !x.shows || !x.cover || !x.opens));
    let filled = 0, failed = 0;
    for (let i = 0; i < todo.length; i += 6) {
        const part = todo.slice(i, i + 6);
        const got = parseFill(await ask(fillPrompt(part, names, sample), 1500), part.length);
        part.forEach((x, k) => {
            const o = got[k];
            if (!o) { failed++; return; }
            const signs = splitList(o.signs ?? '');
            const clean = (s) => (signs.concat(x.signs ?? []).some((g) => hasSign(s, g)) ? '' : clip(s, 200));   // a sign in what may show would undo the secret
            x.who ||= clip(o.who === '?' ? '' : o.who, 60);
            const nv = clip(o.secret, 400);
            if (nv && nv !== x.v.trim()) { x.vOrig ||= x.v; x.v = nv; }   // the id stays: history follows the secret
            if (!(x.signs ?? []).length) x.signs = signs;
            x.shows ||= clean(o.shows);
            x.cover ||= clean(o.cover);
            x.opens ||= clip(o.opens, 120);
            x.auto = true;
            filled++;
        });
    }
    return { filled, failed };
}
