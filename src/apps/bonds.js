// 💞 Bonds: how close two people have actually become on the page, so the story does not skip steps.
// Ported from the third generation's relationship reading (moves, feelings, refusals that hold, the lead switch,
// one warmer remark, falling for someone) and the second generation's rule book (stage thresholds, friendship only).
// Everything is counted from quoted records, folded per reply; only plain "may" lines go to the main model.
import { clip, quoteOk } from '../core/text.js';
import { twoPeople } from '../core/cadence.js';
import { esc, card, steps, bar, empty, hint, face, pill, acts } from '../ui/kit.js';

const LEVELS = ['none', 'brush', 'hand', 'hug', 'kiss', 'more'];
const LEVEL_KO = ['아직', '스침', '손', '포옹', '입맞춤', '그 이상'];
const LEVEL_EN = ['no touch yet', 'a passing brush', 'holding hands', 'an embrace', 'a kiss', 'more than a kiss'];
export const MOVES = ['closer', 'back', 'wavering', 'crack', 'clash', 'same'];
const MOVE_KO = { closer: '다가감', back: '물러섬', wavering: '흔들림', crack: '금이 감', clash: '부딪침', same: '그대로' };
export const FEELS = ['attraction', 'desire', 'lingering', 'love-hate', 'forbidden pull', 'resentment', 'bond', 'none'];
const FEEL_KO = { attraction: '끌림', desire: '욕망', lingering: '미련', 'love-hate': '애증', 'forbidden pull': '금지된 끌림', resentment: '원망', bond: '정', none: '없음' };
const ROMANCE = FEELS.slice(0, 5);
const LOVER = /lover|couple|dating|engaged|betroth|married|husband|wife|boyfriend|girlfriend|spouse|fianc|연인|애인|사귀|약혼|부부|남편|아내/i;
const WED = /married|husband|wife|spouse|부부|남편|아내/i;
const BREAK = /broke up|break.?up|divorc|ex-|enem|헤어|이혼|원수|전 연인|전 배우자/i;

// Stage ladder (second generation's rule book). Off by default; thresholds are points, see `points()`.
export const STAGES = [
    { ko: '낯선 사람', en: 'strangers', call: 'by name, politely', act: 'formal, keeps distance' },
    { ko: '아는 사이', en: 'acquaintances', call: 'by name', act: 'small talk' },
    { ko: '친구', en: 'friends', call: 'by name or a nickname', act: 'jokes, small favors' },
    { ko: '가까운 사이', en: 'close', call: 'by a nickname', act: 'a light touch, shares a little of their heart' },
    { ko: '고백 직전', en: 'about to confess', call: 'by a nickname', act: 'can barely hide the feeling, waiting for the moment' },
];
const LOVER_STAGE = { ko: '연인', en: 'lovers', call: 'by a pet name', act: 'affection, dates, promises' };
const WED_STAGE = { ko: '부부', en: 'married', call: 'by a pet name', act: 'a shared daily life' };
export const DEFAULT_AT = [0, 3, 6, 10, 15];

const pair = (lhs, sep) => { const i = lhs.indexOf(sep); if (i < 0) return null; const a = lhs.slice(0, i).trim(), b = lhs.slice(i + 1).trim(); return a && b && a !== b && a.length <= 40 && b.length <= 40 ? [a, b] : null; };
const keyOf = (a, b) => [a, b].sort().join(' & ');
const split = (v) => { const i = v.indexOf('='); return i < 0 ? null : [v.slice(0, i).trim(), v.slice(i + 1).trim()]; };
const first = (list, v) => { const t = String(v ?? '').toLowerCase().trim(); return list.find((w) => t.startsWith(w)) ?? null; };
const words = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).map((w) => w.replace(/(이라는|라는|이|가|은|는|을|를|의|에|도|만)$/, '')).filter((w) => w.length >= 3 || (/[가-힣]/.test(w) && w.length >= 2));
const touches = (a, b) => { const B = String(b ?? '').toLowerCase(); return !!B && words(a).some((w) => B.includes(w)); };
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));

// English lines for the main model (from the third generation, where they were tested in real chats).
const T = {
    // measured with a long-reply preset: "in this reply" alone let a 1,500-word reply walk on inside (3/3); this wording held 3/3
    pace: (P, lvl) => `${P.a} and ${P.b}${P.tie ? ` (${P.tie})` : ''}: the closest they have been so far is ${LEVEL_EN[lvl]}. Across this whole reply, however long it runs: at most one small step closer, and only if the scene earns it — no moving on to a more private place or the next stage.`,
    stage: (P, s) => `${P.a} and ${P.b} are ${s.en}: they speak to each other ${s.call}; what fits now: ${s.act}. Do not skip ahead to a later stage.`,
    friend: (P) => `${P.a} and ${P.b} are friends and stay friends: no romantic or sexual moves between them, whatever the scene.`,
    yields: (w, n) => `${w} has given in ${n} times lately. ${w} keeps their own will: an easy yes would be out of character now.`,
    refHold: '{a} turned down {v}. That stands: something new in the story could move it, asking again does not.',
    refAgain: '{b} is asking again for what {a} already turned down. The answer of {a} gets shorter and cooler, not kinder; {a} does not explain twice.',
    refPress: '{b} keeps pressing. {a} is done discussing it: {a} may end the topic, walk away, or say what happens if it comes up again. Warmth returns only once {b} lets it go.',
    refFallen: 'The no of {a} on {v} stands; it costs {a} more to say it now.',
    leak: '{a} → {b}: {tex} — it may show once in this reply, in one small act, tone or distance, never in narration that explains it; the feeling itself stays unspoken.',
    leadA: 'For a long while {b} has set the pace and {a} has followed. This reply {a} may take it: {a} decides, starts or changes where this goes, in {a}\'s own manner. Small is fine; {b} answers to it.',
    aside: 'Once in this reply {a} may let slip one remark a shade warmer than {tie} allows — said flatly, like a plain fact — then go straight back to the matter. Nobody dwells on it.',
    fallBg: '{a} has fallen for {b}, further than {a} would admit. {keeps} is intact.',
    fallBase: '{a} is far gone on {b}: it shows where {a} cannot manage it{how}. Everywhere else {a} is still {a}.',
    fallPull: '{b} has pulled back a little. {a}, who would not chase, finds a reason to be near; the reason is thin and {a} knows it.',
    fallCollapse: 'This reply the composure of {a} may slip badly over {b}, once — {a} notices too late and recovers poorly. No speech about feelings; the slip is the tell.',
    press: {
        lead: 'This reply {a} takes the lead with {b}: {a} decides, starts or changes where this goes.',
        refuse: '{a} may refuse or turn this away — a no that fits {a} (silence, a step back, a question back, a half-yes with a condition) is better than giving in; it does not end what is between them.',
        give: 'This reply {a} may give way to {b}; {a} finds {a}\'s own reason for it.',
        burst: '{a} → {b}: what {a} has held back presses through in this reply; the surface may crack, sharp and ugly is fine. It is not explained.',
    },
};

// The pair's points for the optional ladder: what actually happened between them, never a free-floating score.
export function points(P) {
    const mv = (m) => P.moves.filter((x) => x.mv === m).length;
    const romantic = Object.values(P.feel).some((f) => ROMANCE.includes(f.t));
    return Math.max(0, Math.round(mv('closer') + P.lvl * 1.5 + (romantic ? 1 : 0) + P.yields.length * 0.5 - mv('back') - mv('clash') - mv('crack') * 0.5));
}
export function stageOf(P, at = DEFAULT_AT) {
    if (WED.test(P.tie)) return WED_STAGE;
    if (LOVER.test(P.tie) && !BREAK.test(P.tie)) return LOVER_STAGE;
    const p = points(P);
    let s = 0;
    at.forEach((x, n) => { if (p >= x) s = n; });
    return { ...STAGES[s], n: s };
}
// What kinds of story the pair has had (for "falling for someone": enough story first, then the person decides).
export function kinds(P) {
    const k = new Set();
    if (P.lvl >= 2) k.add('touch');
    if (P.moves.filter((x) => x.mv === 'closer').length >= 2) k.add('closer');
    const clash = P.moves.findIndex((x) => x.mv === 'clash');
    if (clash >= 0 && P.moves.slice(clash + 1).some((x) => x.mv === 'closer')) k.add('clashBack');
    if (P.yields.length) k.add('yield');
    if (P.refuse.length) k.add('refuse');
    if (Object.keys(P.feel).length) k.add('feel');
    if (P.leads) k.add('lead');
    return k;
}
export const FALL_KINDS = 4, FALL_SPAN = 60;   // four kinds of story, over about thirty replies
const romanticPair = (P) => P.lvl >= 2 || LOVER.test(P.tie) || Object.values(P.feel).some((f) => ROMANCE.includes(f.t));
const isLover = (P) => LOVER.test(P.tie) && !BREAK.test(P.tie);

export default {
    api: 1,
    id: 'bonds',
    name: '관계',
    icon: '💞',
    color: '#e0567f',
    cost: 'low',
    desc: '두 사람이 어디까지 가까워졌는지 적어 두고, AI가 단계를 건너뛰지 않게 속도를 지켜요.',
    // NEXT-3: the third generation's whole relationship sheet (prompts/deep.en.txt + the rel1 keys of keys.js), restored
    // as keys. Asked only when at least two people deal with each other in the new text (code pre-check, fails open);
    // each rule travels with its key, in the original wording. Quote length, "same needs no quote", the plain-label tie
    // and the two-readings texture rule are enforced in code (check / reduce), not by asking.
    keys: [
        { id: 'touch', line: 'touch: A>B=none|brush|hand|hug|kiss|more', when: twoPeople,
            rules: ['"touch" counts affection or desire only. Care, treatment, help or a fight is not touch.'] },
        { id: 'move', line: 'move: A>B=closer|back|wavering|crack|clash|same / inner line (under 12 words, or -)', when: twoPeople, rules: [
            'Relationship — inner reading, in your head only (do not output this list): for each pair and direction, silently check what they did · what they would usually do but did not · gap between words and actions · who moved first and the balance of power · forms of address · tone · distance · misunderstanding · scratches and blow-ups · what was revealed. Last: is this a mood, or did the relationship move? Write only the single sharpest one as the inner line.',
            'Relationship: read [NEW TEXT] as the stretch to judge. <director> is reference only; judge what was actually written (a plain statement in it that something already happened counts as evidence).',
            'Only pairs who actually dealt with each other, present together, in the stretch. One "move" line per direction. People in flashbacks, memories or talk are not "dealing with each other" now.',
            'One move only: closer · back · wavering · crack · clash · same. clash only when they openly collided.',
            'Ask first: is this a mood, or did the relationship move? If close, same.',
            'Evidence is a quote copied from the text, at least 12 characters. Narration that directly states a character\'s thoughts counts. Atmosphere and "as if / seemed" guesses do not.',
            'Do not: read kindness as love · read conflict as romantic tension · point every feeling at one person (the user) · open a layer without evidence · judge absent pairs.',
            'Inner line: under 12 words. The single sharpest point picked above (e.g. says it\'s fine but won\'t let go of the hand). Only what the text shows, no adjectives for effect. If none: -',
        ] },
        { id: 'feel', line: 'feel: A>B=attraction|desire|lingering|love-hate|forbidden pull|resentment|bond|none', quote: true, when: twoPeople, rules: [
            'Texture ("feel") only when it changed: attraction · desire · lingering · love-hate · resentment · forbidden pull · bond · none. bond = family or friendship care, not romance.',
            'Texture is only what A feels toward B themself. Longing for someone dead or absent is not this pair\'s texture.',
        ] },
        { id: 'tie', line: 'tie: A-B=the official relationship (strangers, colleagues, friends, lovers, engaged, family, enemies)', quote: true, when: twoPeople, rules: [
            'tie = the official relationship. It changes only by an explicit event in the text: a confession that is accepted, a proposal, a breakup, a declared break. Closeness, a night together or time spent does not change it. Write a tie line only then, with the quote.',
        ] },
        { id: 'refuse', line: 'refuse: A>B=what A refused or turned away from B', quote: true, when: twoPeople },
        { id: 'yield', line: 'yield: A>B=what A gave in on   (A had refused it, or would not by A\'s own stance, and went along anyway)', quote: true, when: twoPeople, rules: [
            'yield, press, lead and aside are judged only from what was written outside <director>. A move that <director> ordered is not that character\'s lead. Ordinary agreement is not yield: write it only when the character had refused, or it goes against how the text has shown them.',
        ] },
        { id: 'press', line: 'press: A>B=what A asked for again   (A repeats or pushes an ask that B already turned away)', quote: true, when: twoPeople },
        { id: 'aside', line: 'aside: A>B=the remark   (A said something warmer than their relationship allows, then dropped it)', quote: true, when: twoPeople },
        { id: 'lead', line: 'lead: Name=the move   (who decided, proposed, started or turned the scene on their own, not in answer to someone; one line at most)', quote: true, when: twoPeople },
    ],
    start: () => ({ pairs: {}, leads: [] }),
    check({ k, v, q }, env = {}) {
        if (k === 'lead') { const w = v.split('=')[0].trim(); return w.length > 0 && w.length <= 40; }
        const s = split(v);
        if (!s || !pair(s[0], k === 'tie' ? '-' : '>')) return false;
        if (k === 'move') {
            const m = first(MOVES, s[1]);
            if (!m) return false;
            // third generation: every move but "same" needs a quote of at least 12 characters that is really in the text
            if (m !== 'same' && typeof env.text === 'string' && env.text !== '' && !(String(q ?? '').length >= 12 && quoteOk(q, env.text ?? ''))) return false;
            return true;
        }
        if (k === 'feel') return !!first(FEELS, s[1]);
        if (k === 'tie') {
            // a "colleagues / friends / family" line on a pair that was not lovers is a label, not an event (v3 v0.5)
            const prev = env.peek?.('bonds')?.pairs?.[keyOf(...pair(s[0], '-'))]?.tie ?? '';
            if (!LOVER.test(s[1]) && !BREAK.test(s[1]) && !LOVER.test(prev)) return !(typeof env.text === 'string' && env.text !== '');   // hand corrections still allowed
        }
        return true;
    },
    reduce(S, { k, v, q, i }, env) {
        if (k === 'lead') {
            const who = clip(v.replace(/[|"].*$/, '').split('=')[0].trim(), 40);
            S.leads.push({ who, i, user: !!env?.user && who.toLowerCase() === String(env.user).toLowerCase() });
            if (S.leads.length > 60) S.leads.shift();
            for (const P of Object.values(S.pairs)) if (P.a === who || P.b === who) P.leads = (P.leads ?? 0) + 1;
            return;
        }
        const [lhs, rhs] = split(v), [a, b] = pair(lhs, k === 'tie' ? '-' : '>');
        const P = (S.pairs[keyOf(a, b)] ??= { a, b, lvl: 0, tie: '', refuse: [], yields: [], moves: [], feel: {}, ups: [], ties: [], i, first: i });
        P.i = i;
        if (k === 'touch') { const n = LEVELS.indexOf(first(LEVELS, rhs) ?? 'none'); if (n > P.lvl) { P.lvl = n; P.ups.push({ n, i }); } }
        else if (k === 'tie') { P.tie = clip(rhs, 60); P.ties.push({ v: P.tie, i, q: clip(q, 120) }); if (P.ties.length > 8) P.ties.shift(); if (P.inner) delete P.inner[`${a}>${b}`], delete P.inner[`${b}>${a}`]; }
        else if (k === 'refuse') { P.refuse.push({ who: a, to: b, what: clip(rhs, 80), q: clip(q, 120), i }); if (P.refuse.length > 8) P.refuse.shift(); }
        else if (k === 'yield') { P.yields.push({ who: a, what: clip(rhs, 80), q: clip(q, 120), i }); if (P.yields.length > 8) P.yields.shift(); }
        else if (k === 'move') {
            const mv = first(MOVES, rhs), inner = clip(String(rhs).split('/').slice(1).join('/').trim().replace(/^-$/, ''), 80);
            P.inner ??= {};
            if (mv === 'clash') delete P.inner[`${a}>${b}`];                 // it came out: no longer held back
            else if (inner && mv !== 'same') P.inner[`${a}>${b}`] = { v: inner, q: clip(q, 120), i };
            if (mv === 'same' && !inner) return;
            P.moves.push({ who: a, to: b, mv, inner, q: clip(q, 120), i }); if (P.moves.length > 40) P.moves.shift();
        }
        else if (k === 'feel') {
            // third generation: a new texture counts after two readings in a row, or at once after an open clash
            const t = first(FEELS, rhs), d = `${a}>${b}`, cur = P.feel[d];
            if (cur?.t === t) return;
            const clash = P.moves.some((m) => m.i === i && m.mv === 'clash');
            P.cand ??= {};
            if (!cur || clash || (P.cand[d]?.t === t && P.cand[d].i < i)) { if (t === 'none') delete P.feel[d]; else P.feel[d] = { t, q: clip(q, 120), i }; delete P.cand[d]; }
            else P.cand[d] = { t, i };
        }
        else if (k === 'press') { (P.presses ??= []).push({ who: a, to: b, what: clip(rhs, 80), q: clip(q, 120), i }); if (P.presses.length > 8) P.presses.shift(); }
        else if (k === 'aside') { (P.asides ??= []).push({ who: a, to: b, what: clip(rhs, 80), q: clip(q, 120), i }); if (P.asides.length > 8) P.asides.shift(); }
    },
    // [CURRENT STATE] per pair (v3 [BASELINE]): texture · inner line · recent trend — only what judging change needs
    stateLines: (S) => Object.values(S.pairs).sort((x, y) => y.i - x.i).slice(0, 6).flatMap((P) => {
        const f = Object.entries(P.feel).map(([d, x]) => `${d} ${x.t}`).join(', ');
        const head = `bond: ${P.a} & ${P.b} — touch so far: ${LEVELS[P.lvl]}${P.tie ? `; tie: ${P.tie}` : ''}${f ? `; feelings: ${f}` : ''}`;
        const dirs = [[P.a, P.b], [P.b, P.a]].map(([a, b]) => {
            const tr = trend(P, a), inner = P.inner?.[`${a}>${b}`]?.v;
            return inner || tr ? `  ${a}>${b}: ${[inner && `inner: ${inner}`, tr && `recent trend: ${tr}`].filter(Boolean).join(' · ')}` : '';
        }).filter(Boolean);
        return [head, ...dirs];
    }),
    note(S, env) {
        const st = env.store ?? {}, cfg = st.stages?.on ? st.stages : null, friend = st.friend ?? {}, falls = st.falls ?? {};
        const last = env.last ?? 0, beat = Math.floor(last / 2), user = env.lastUser?.() ?? '', here = env.peek?.('scene')?.with ?? null;
        const isFriend = (P) => !!(friend[P.a] || friend[P.b]);
        const present = (P) => (here ? here.includes(P.a) && here.includes(P.b) : last - P.i <= 12);
        const recent = Object.values(S.pairs).filter((P) => last - P.i <= 12 || (here && present(P))).sort((x, y) => y.i - x.i).slice(0, 3);
        const state = [], now = [], top = [], special = [];
        // the person's own button for this reply (one-shot)
        const pr = st.press && st.press.at === last ? st.press : null;
        if (pr && T.press[pr.kind]) top.push(fill(T.press[pr.kind], { a: pr.a, b: pr.b }));
        for (const P of recent) {
            const fr = isFriend(P), lvl = fr ? Math.min(P.lvl, 2) : P.lvl;
            now.push(T.pace(P, lvl));
            if (fr) state.push(T.friend(P));
            else if (cfg) now.push(T.stage(P, stageOf(P, cfg.at ?? DEFAULT_AT)));
            const y = P.yields.filter((x) => last - x.i <= 6);
            if (y.length >= 2) now.push(T.yields(y[0].who, y.length));
            // refusals that hold until the story moves them; asking again meets a shorter no
            const shut = st.shut ?? {}, r = P.refuse.filter((x) => !shut[`${x.who}>${x.to}|${x.what}`]).at(-1);
            if (r && !isLover(P)) {
                const fallenA = !!falls[`${r.who}>${r.to}`]?.on, same = P.refuse.filter((x) => x.who === r.who && touches(x.what, r.what)).length;
                const asked = touches(r.what, user);
                const o = { a: r.who, b: r.to, v: r.what };
                if (asked) top.push(fill(fallenA ? T.refFallen : same >= 2 ? T.refPress : T.refAgain, o));
                else if (last - r.i <= 4) now.push(fill(fallenA ? T.refFallen : T.refHold, o));
            }
            // a romantic feeling shows once a scene in one small act, never in explaining narration
            for (const [d, f] of Object.entries(P.feel)) {
                const [a, b] = d.split('>');
                if (!fr && ROMANCE.includes(f.t) && !isLover(P) && beat % 3 === 0 && present(P)) { now.push(fill(T.leak, { a, b, tex: f.t })); break; }
            }
            // falling for someone: only when the person switched it on
            for (const [a, b] of [[P.a, P.b], [P.b, P.a]]) {
                const F = falls[`${a}>${b}`];
                if (!F?.on || fr) continue;
                state.push(fill(T.fallBg, { a, b, keeps: F.keeps || `the way ${a} talks` }));
                const lastMove = P.moves.at(-1);
                if (lastMove && lastMove.i === last && lastMove.who === b && lastMove.mv === 'back') special.push(fill(T.fallPull, { a, b }));
                else if (lastMove && lastMove.i === last && lastMove.who === b && lastMove.mv === 'closer' && beat % 6 === 0) special.push(fill(T.fallCollapse, { a, b }));
                else if (beat % 3 === 0) now.push(fill(T.fallBase, { a, b, how: F.how ? ` — ${F.how}` : '' }));
            }
            // one remark a shade warmer than the tie allows: rare, only for a warm pair that is not together yet
            if (!fr && romanticPair(P) && !isLover(P) && beat % 10 === 5 && present(P)) {
                const a = P.a === env.user ? P.b : P.a;
                special.push(fill(T.aside, { a, tie: P.tie || 'their relationship' }));
            }
        }
        // the lead switch: someone with a stake in a pair has followed for a long stretch
        const leads = S.leads ?? [];
        for (const P of recent) {
            const a = P.a === env.user ? P.b : P.b === env.user ? P.a : null;
            if (!a || isFriend(P) || !(romanticPair(P) || Object.keys(P.feel).some((d) => d.startsWith(`${a}>`)))) continue;
            const mine = leads.filter((l) => l.who === a).at(-1), since = last - (mine?.i ?? P.first);
            const theirs = leads.filter((l) => l.user && l.i > (mine?.i ?? -1)).length;
            if (since >= 16 && theirs >= 2 && beat % 4 === 0) { special.push(fill(T.leadA, { a, b: env.user })); break; }
        }
        // order: the person's order and pressed refusals first, then the pace; at most one "special"
        const out = { state: [...new Set(state)].slice(0, 3), now: [...new Set([...top, ...now, ...special.slice(0, top.length ? 0 : 1)])].slice(0, 5) };
        return out.state.length || out.now.length ? out : null;
    },
    onReply(env) { if (env.store?.press && (env.last ?? 0) > env.store.press.at) { delete env.store.press; return true; } return false; },
    chip({ k, v }) {
        if (k === 'lead') return `🧭 ${clip(v, 16)} 주도`;
        const [lhs, rhs] = split(v) ?? ['', v], p = pair(lhs, k === 'tie' ? '-' : '>');
        if (k === 'touch') { const n = LEVELS.indexOf(first(LEVELS, rhs) ?? 'none'); return n > 0 ? `💞 ${p?.join(' · ') ?? ''} ${LEVEL_KO[n]}` : ''; }
        if (k === 'tie') return `🔗 ${rhs}`;
        if (k === 'move') { const m = first(MOVES, rhs); return m === 'closer' ? `↘ ${p?.[0] ?? ''} 다가감` : m ? `${m === 'clash' ? '⚡' : '↗'} ${p?.[0] ?? ''} ${MOVE_KO[m]}` : ''; }
        if (k === 'feel') { const f = first(FEELS, rhs); return f ? `💭 ${p?.[0] ?? ''} ${FEEL_KO[f]}` : ''; }
        if (k === 'press') return `🔁 ${p?.[0] ?? ''} 또 조름`;
        if (k === 'aside') return `🌡 ${p?.[0] ?? ''} 다정한 말`;
        return k === 'refuse' ? `🙅 ${p?.[0] ?? ''} 거절` : `🫳 ${p?.[0] ?? ''} 넘어감`;
    },
    widget(S) {
        const L = Object.values(S.pairs).sort((x, y) => y.i - x.i).slice(0, 3);
        return L.map((P) => `<div class="mb4-bond"><span class="mb4-face">${face(P.b)}</span><span class="mb4-bond-n"><b>${esc(P.a)} · ${esc(P.b)}</b><small>${esc(P.tie || LEVEL_KO[P.lvl])}</small></span>${bar(100 - distance(P).d, 'love')}</div>`).join('');
    },
    css: `
.mb4-bd-dist { display: block; width: 100%; height: 56px; margin: 6px 0 2px; }
.mb4-bd-dist polyline { fill: none; stroke: var(--love); stroke-width: 2; stroke-linejoin: round; }
.mb4-bd-dist circle { fill: var(--love); }
.mb4-bd-dist line { stroke: rgba(70, 45, 35, .12); stroke-dasharray: 3 3; }
.mb4-bd-tl { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; font-size: 12.5px; }
.mb4-bd-tl div { display: flex; gap: 6px; align-items: baseline; }
.mb4-bd-tl div.big b { color: var(--love); }
.mb4-bd-tl q { color: var(--sub); font-style: italic; overflow-wrap: anywhere; }
.mb4-bd-tl small { margin-left: auto; color: var(--sub); flex: none; }
.mb4-bd-at { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.mb4-bd-at label { display: flex; flex-direction: column; font-size: 11.5px; color: var(--sub); }
.mb4-bd-at input { width: 58px; }
`,
    // 🗑 a pair the person removed by hand stays away until a newer reply touches it again
    adjust(S, env) {
        const hidePeople = env.peekStore?.('people')?.hide ?? {};
        for (const [key, P] of Object.entries(S.pairs ?? {})) {
            const at = env.store?.hide?.[key];
            if ((at != null && P.i <= at) || [P.a, P.b].some((n) => hidePeople[n] != null && P.i <= hidePeople[n])) delete S.pairs[key];
        }
    },
    render(el, api) {
        const S = api.state() ?? { pairs: {}, leads: [] }, st = api.store, env = api.env;
        st.friend = st.friend && typeof st.friend === 'object' ? st.friend : {};
        st.falls = st.falls && typeof st.falls === 'object' ? st.falls : {};
        const L = Object.values(S.pairs).sort((x, y) => y.i - x.i), at = st.stages?.at ?? DEFAULT_AT;
        const names = [...new Set(L.flatMap((P) => [P.a, P.b]))];
        const pairCard = (P) => {
            const D = distance(P), k = kinds(P), span = (env.last ?? 0) - P.first;
            const fr = !!(st.friend[P.a] || st.friend[P.b]);
            const stg = st.stages?.on ? stageOf(P, at) : null;
            const fallRow = [[P.a, P.b], [P.b, P.a]].map(([a, b]) => {
                const F = st.falls[`${a}>${b}`], ready = k.size >= FALL_KINDS && span >= FALL_SPAN && !fr;
                if (F?.on) return `<div class="mb4-quote"><b>💘 ${esc(a)} → ${esc(b)} 빠짐</b>
                    <input class="mb4-input" data-act="fallset" data-k="${esc(`${a}>${b}`)}" data-f="how" placeholder="어디서 티가 나나요? (예: 말이 짧아짐)" value="${esc(F.how ?? '')}">
                    <input class="mb4-input" data-act="fallset" data-k="${esc(`${a}>${b}`)}" data-f="keeps" placeholder="그래도 그대로인 것 (예: 무뚝뚝한 말투)" value="${esc(F.keeps ?? '')}">
                    <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="fall" data-v="${esc(`${a}>${b}`)}">끄기</button></div></div>`;
                return ready ? `<div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="fall" data-v="${esc(`${a}>${b}`)}">💘 ${esc(a)}이(가) ${esc(b)}에게 빠질 때가 됐어요 · 켜기</button></div>` : '';
            }).join('');
            const ev = timeline(P).slice(-8).reverse().map((e) => `<div class="${e.big ? 'big' : ''}">${e.icon} <b>${esc(e.text)}</b>${e.q ? ` <q>${esc(e.q)}</q>` : ''}<small>#${e.i}</small></div>`).join('');
            const btn = (kind, label) => `<button class="mb4-btn ghost sm" data-act="press" data-v="${esc(`${kind}|${P.a === env.user ? P.b : P.a}|${P.a === env.user ? P.a : P.b}`)}">${label}</button>`;
            return card('', `
                <div class="mb4-bond-head"><span class="mb4-face lg">${face(P.a)}</span><span class="mb4-heart">${fr ? '🤝' : '💞'}</span><span class="mb4-face lg">${face(P.b)}</span></div>
                <div class="mb4-big mb4-center">${esc(P.a)} · ${esc(P.b)}</div>
                <div class="mb4-center">${P.tie ? pill(P.tie) : ''} ${stg ? pill(stg.ko, 'good') : ''} ${fr ? pill('친구로만', '') : ''}</div>
                ${steps(LEVEL_KO.slice(0, fr ? 3 : 6), Math.min(P.lvl, fr ? 2 : 5))}
                <svg class="mb4-bd-dist" viewBox="0 0 300 56" preserveAspectRatio="none" aria-label="거리">${spark(D.pts)}</svg>
                <div class="mb4-row"><span class="mb4-row-k">${D.d <= 30 ? '🫶 가까움' : D.d >= 70 ? '🧊 멀어짐' : '🙂 그럭저럭'}</span><span class="mb4-row-v mb4-dim">이야기에서 일어난 일로만 그린 그림이에요</span></div>
                ${Object.entries(P.feel).map(([d, f]) => `<div class="mb4-row"><span class="mb4-row-k">💭 ${esc(d.replace('>', ' → '))}</span><span class="mb4-row-v">${esc(FEEL_KO[f.t] ?? f.t)}</span></div>`).join('')}
                ${[[P.a, P.b], [P.b, P.a]].map(([a, b]) => { const n = P.inner?.[`${a}>${b}`], t = trend(P, a); return n || t ? `<div class="mb4-row"><span class="mb4-row-k">🫀 ${esc(a)} → ${esc(b)}</span><span class="mb4-row-v">${[t && ({ closer: '다가가는 중', back: '물러나는 중', waver: '흔들리는 중' }[t]), n && `「${esc(n.v)}」`].filter(Boolean).join(' · ')}</span></div>` : ''; }).join('')}
                ${P.ties?.at(-1)?.q ? `<p class="mb4-hint">🔗 ${esc(P.tie)} — 📜 ${esc(P.ties.at(-1).q)}</p>` : ''}
                ${P.refuse.filter((x) => !st.shut?.[`${x.who}>${x.to}|${x.what}`]).map((x) => `<div class="mb4-row"><span class="mb4-row-k">🙅 ${esc(x.who)} → ${esc(x.to)}</span><span class="mb4-row-v">${esc(x.what)} <button class="mb4-btn ghost sm" data-act="shut" data-v="${esc(`${x.who}>${x.to}|${x.what}`)}">끝내기</button></span></div>`).join('')}
                ${ev ? `<div class="mb4-bd-tl">${ev}</div>` : ''}
                ${fallRow}
                <details class="mb4-card mb4-edcard" style="margin-top:10px"><summary>✏️ 직접 고치기</summary>
                    <div class="mb4-btnrow"><input class="mb4-input" data-bf="tie" data-n="${esc(`${P.a}-${P.b}`)}" maxlength="40" placeholder="공식 관계 (예: 연인, 친구, 약혼)" value="${esc(P.tie ?? '')}"><button class="mb4-btn ghost sm" data-act="btie" data-v="${esc(`${P.a}-${P.b}`)}">바꾸기</button></div>
                    ${[[P.a, P.b], [P.b, P.a]].map(([a, b]) => `<div class="mb4-quote"><b>${esc(a)} → ${esc(b)}</b>
                        <div class="mb4-btnrow tight">${[['closer', '🫶 다가감'], ['back', '↩ 물러남'], ['clash', '⚡ 부딪힘'], ['same', '그대로']].map(([m, n]) => `<button class="mb4-btn ghost sm" data-act="bfix" data-v="${esc(`move|${a}>${b}=${m} / -`)}">${n}</button>`).join('')}</div>
                        <div class="mb4-btnrow tight"><select class="mb4-input" data-act="bsel" data-k="feel" data-n="${esc(`${a}>${b}`)}"><option value="">💭 마음의 결…</option>${FEELS.map((x) => `<option value="${x}">${esc(FEEL_KO[x] ?? x)}</option>`).join('')}</select>
                        <select class="mb4-input" data-act="bsel" data-k="touch" data-n="${esc(`${a}>${b}`)}"><option value="">🤝 스킨십…</option>${[['brush', '스침'], ['hand', '손'], ['hug', '포옹'], ['kiss', '입맞춤'], ['more', '그 이상']].map(([x, n]) => `<option value="${x}">${n}</option>`).join('')}</select></div></div>`).join('')}
                    <p class="mb4-hint">고친 값은 마지막 답에 붙어요. 📒 기록에서 되돌릴 수 있어요.</p>
                    <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="bdel" data-v="${esc(keyOf(P.a, P.b))}|${P.i}">🗑 이 사이 지우기</button></div>
                </details>
                <details class="mb4-card" style="margin-top:10px"><summary>🎬 다음 답 한 번만</summary>
                    <div class="mb4-btnrow">${btn('lead', '먼저 나서게')}${btn('refuse', '거절하게')}${btn('give', '넘어가 주게')}${btn('burst', '참던 게 터지게')}</div>
                    ${st.press && st.press.at === env.last ? `<p class="mb4-hint">지금 걸린 것: ${esc(PRESS_KO[st.press.kind])} · ${esc(st.press.a)}</p>` : ''}
                </details>`);
        };
        const settings = card('⚙️ 관계 규칙', `
            <label class="mb4-sw"><span><b>단계 나누기</b><small>낯선 사람 → 아는 사이 → 친구 → 가까운 사이 → 고백 직전. 다가감 · 스킨십 · 넘어가 줌으로 점수를 세요.</small></span><input type="checkbox" data-act="stages" ${st.stages?.on ? 'checked' : ''}><i></i></label>
            ${st.stages?.on ? `<div class="mb4-bd-at">${STAGES.map((s, n) => `<label>${esc(s.ko)}<input class="mb4-input" type="number" min="0" max="99" data-act="at" data-n="${n}" value="${at[n] ?? DEFAULT_AT[n]}" ${n === 0 ? 'disabled' : ''}></label>`).join('')}</div>` : ''}
            ${names.length ? `<p class="mb4-hint" style="margin-top:10px">친구로만 둘 사람 (연애 쪽으로 안 가요)</p><div class="mb4-chips">${names.map((n) => `<button class="mb4-btn ${st.friend[n] ? '' : 'ghost '}sm" data-act="friend" data-v="${esc(n)}">${st.friend[n] ? '🤝 ' : ''}${esc(n)}</button>`).join('')}</div>` : ''}`);
        el.innerHTML = (L.length ? L.map(pairCard).join('') : empty('💞', '아직 기록된 사이가 없어요', '이야기가 진행되면 여기 쌓여요'))
            + settings + hint('단계는 글에 실제로 나온 만큼만 올라가요. AI에는 「한 번에 한 걸음」만 알려 줘요.');
        const save = () => { api.save(); api.redraw(); };
        el.querySelectorAll('[data-act="bdel"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const [key, i] = b.dataset.v.split('|'); (st.hide ??= {})[key] = Math.max(env.last ?? 0, +i || 0); api.toast('지웠어요. 이야기에서 다시 얽히면 돌아와요.'); save(); }));
        acts(el, {
            bfix: (v) => { const i = v.indexOf('|'); if (api.fix(v.slice(0, i), v.slice(i + 1))) api.toast('고쳤어요.'); },
            btie: (k) => { const t = String(el.querySelector(`[data-bf="tie"][data-n="${CSS.escape(k)}"]`)?.value ?? '').trim(); if (t && api.fix('tie', `${k}=${t}`)) api.toast('고쳤어요.'); },
            bsel: (val, s) => { if (!val) return; if (api.fix(s.dataset.k, `${s.dataset.n}=${val}`)) api.toast('고쳤어요.'); },
            shut: (k) => { (st.shut ??= {})[k] = true; save(); },
            friend: (n) => { if (st.friend[n]) delete st.friend[n]; else st.friend[n] = true; save(); },
            stages: (_v, b) => { st.stages = { ...(st.stages ?? {}), on: b.checked, at: st.stages?.at ?? [...DEFAULT_AT] }; save(); },
            at: (_v, b) => { const A = [...(st.stages?.at ?? DEFAULT_AT)]; A[+b.dataset.n] = Math.max(0, Math.min(99, Math.round(+b.value || 0))); for (let n = 1; n < A.length; n++) if (A[n] <= A[n - 1]) A[n] = A[n - 1] + 1; st.stages = { ...(st.stages ?? {}), at: A }; save(); },
            fall: (k) => { const F = st.falls[k]; if (F?.on) delete st.falls[k]; else st.falls[k] = { on: true, how: '', keeps: '' }; save(); },
            fallset: (_v, b) => { const F = st.falls[b.dataset.k]; if (F) { F[b.dataset.f] = b.value.trim().slice(0, 100); api.save(); } },
            press: (v) => { const [kind, a, b] = v.split('|'); st.press = { kind, a, b, at: env.last ?? 0 }; api.save(); api.toast(`다음 답에 한 번: ${PRESS_KO[kind]} · ${a}`); api.redraw(); },
        });
    },
};
const PRESS_KO = { lead: '먼저 나서게', refuse: '거절하게', give: '넘어가 주게', burst: '참던 게 터지게' };

// How far apart the two feel, 5 (close) … 95 (far): a picture for the person, never a rule (third generation's formula).
const CAP = [null, 70, 50, 40, 25, 15];
export function distance(P) {
    const ev = [...P.moves.map((m) => ({ i: m.i, mv: m.mv })), ...P.ups.map((u) => ({ i: u.i, up: u.n })), ...P.ties.map((t) => ({ i: t.i, tie: t.v })), ...Object.values(P.feel).map((f) => ({ i: f.i, feel: f.t }))].sort((a, b) => a.i - b.i);
    let d = 60, romantic = false;
    const pts = [{ i: P.first - 1, d }];
    for (const e of ev) {
        if (e.mv) d += { closer: -7, back: 7, wavering: 0, crack: 10, clash: romantic ? -4 : 6, same: 0 }[e.mv] ?? 0;
        if (e.feel) { if (ROMANCE.includes(e.feel)) { romantic = true; d -= 3; } else d += e.feel === 'resentment' ? 5 : -2; }
        if (e.up != null && CAP[e.up] != null) d = Math.min(d, CAP[e.up]);
        if (e.tie) { if (BREAK.test(e.tie)) d = Math.max(d, 75); else if (LOVER.test(e.tie)) d = Math.min(d, 25); }
        d = Math.max(5, Math.min(95, d));
        pts.push({ i: e.i, d });
    }
    return { d, pts };
}
function spark(pts) {
    if (pts.length < 2) return '<line x1="0" y1="28" x2="300" y2="28"/>';
    const n = pts.length - 1, xy = pts.map((p, k) => [Math.round((k / n) * 296) + 2, Math.round((p.d / 100) * 52) + 2]);
    return `<line x1="0" y1="28" x2="300" y2="28"/><polyline points="${xy.map((p) => p.join(',')).join(' ')}"/><circle cx="${xy.at(-1)[0]}" cy="${xy.at(-1)[1]}" r="3.5"/>`;
}
export function timeline(P) {
    const out = [];
    out.push({ i: P.first, icon: '👋', text: '처음 함께 나옴', big: true });
    for (const u of P.ups) out.push({ i: u.i, icon: '💞', text: `스킨십 ${LEVEL_KO[u.n]}`, big: u.n >= 3 });
    for (const t of P.ties) out.push({ i: t.i, icon: '🔗', text: t.v, big: true });
    for (const m of P.moves) out.push({ i: m.i, icon: m.mv === 'closer' ? '↘' : m.mv === 'clash' ? '⚡' : '↗', text: `${m.who} ${MOVE_KO[m.mv] ?? m.mv}`, q: m.q, big: m.mv === 'clash' || m.mv === 'crack' });
    for (const [d, f] of Object.entries(P.feel)) out.push({ i: f.i, icon: '💭', text: `${d.split('>')[0]}: ${FEEL_KO[f.t] ?? f.t}`, q: f.q, big: ROMANCE.includes(f.t) });
    for (const r of P.refuse) out.push({ i: r.i, icon: '🙅', text: `${r.who} 거절 · ${r.what}`, q: r.q });
    for (const y of P.yields) out.push({ i: y.i, icon: '🫳', text: `${y.who} 넘어감 · ${y.what}`, q: y.q });
    for (const x of P.presses ?? []) out.push({ i: x.i, icon: '🔁', text: `${x.who} 또 조름 · ${x.what}`, q: x.q });
    for (const x of P.asides ?? []) out.push({ i: x.i, icon: '🌡', text: `${x.who} 다정한 말 · ${x.what}`, q: x.q, big: true });
    return out.sort((a, b) => a.i - b.i);
}

// third generation's trend: two "closer" of the last three = closer, two "back" = back, else two moves = waver
export function trend(P, who) {
    const m = P.moves.filter((x) => x.who === who && x.mv !== 'same').slice(-3).map((x) => x.mv);
    const c = m.filter((x) => x === 'closer').length, b = m.filter((x) => x === 'back').length;
    return !m.length ? '' : c >= 2 ? 'closer' : b >= 2 ? 'back' : m.length >= 2 ? 'waver' : '';
}
