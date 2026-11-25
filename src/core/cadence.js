// NEXT-3 techniques 2 and 4 — when a key is worth asking. Code only, no model call, and every check FAILS OPEN:
// when it cannot tell (no text given, nothing known yet, «read again»), the key is asked.
//
// A turn (from prompt.askedKeys) adds to the app's env: { text, at, read, force }.

const has = (env) => typeof env?.text === 'string';
const norm = (s) => String(s ?? '').toLowerCase();

// Names Meatball already knows about (scene, people, look, bonds), plus the two chat names.
export function knownNames(env, S = null) {
    const out = new Set();
    const add = (n) => { const t = String(n ?? '').trim(); if (t && t.length <= 40) out.add(t); };
    try {
        for (const n of env?.peek?.('scene')?.with ?? []) add(n);
        for (const n of Object.keys(env?.peek?.('people')?.list ?? {})) add(n);
        for (const n of Object.keys(env?.peek?.('look')?.who ?? {})) add(n);
        for (const k of Object.keys(env?.peek?.('bonds')?.pairs ?? {})) for (const n of k.split(' & ')) add(n);
        for (const k of Object.keys(S?.pairs ?? {})) for (const n of k.split(' & ')) add(n);
        for (const n of Object.keys(S?.list ?? {})) add(n);
        for (const n of Object.keys(S?.who ?? {})) add(n);
    } catch (e) { /* fall back to the chat names */ }
    add(env?.user); add(env?.char);
    return out;
}
// Capitalised words that are not at a sentence start and not common words: likely names the story just introduced.
const COMMON = new Set('I The A An He She It They We You His Her Their Our Your My Its This That These Those There Here Then When What Why How Who Where Mr Mrs Ms Dr Sir Lady Lord Yes No Oh But And Or So If As At In On Of To For With From By Not Just Still Even'.split(' '));
export function newNames(text) {
    const out = new Set();
    for (const m of String(text ?? '').matchAll(/(?<![.!?]\s|^|["“「(]\s?)\b([A-Z][a-z]{2,15})\b/gm)) if (!COMMON.has(m[1])) out.add(m[1]);
    return out;
}
// How many distinct people take part in the text: known names found in it, «you» / a message from the person,
// and new capitalised names. -> number (an over-count is fine: it only means asking).
export function peopleIn(env, S = null) {
    const t = String(env?.text ?? ''), low = norm(t), seen = new Set();
    for (const n of knownNames(env, S)) if (low.includes(norm(n))) seen.add(norm(n));
    if (env?.user && (/\byou\b|\byour\b|너|당신/i.test(t) || /<user>/.test(t))) seen.add(norm(env.user));
    for (const n of newNames(t)) seen.add(norm(n));
    return seen.size;
}

// Relationship keys: only when at least two people deal with each other in the new text.
export const twoPeople = (S, env) => !has(env) || !!env.force || peopleIn(env, S) >= 2;

// Ask only when a cue word is in the text, or when something is already recorded that the key keeps track of.
export const cueOr = (cue, live = () => false) => (S, env) => !has(env) || !!env.force || !!live(S, env) || cue.test(String(env.text));

// Slow things (tastes, habits, title, lasting marks, how people address each other): asked on the first reading
// of a chat, then every `every` replies, when a cue is in the text, or on «read again». The item stays and is shown.
export const slow = ({ every = 6, cue = null, also = null } = {}) => (S, env) => {
    if (!has(env) || env.force) return true;
    if (!env.read) return true;                                            // the first reading of this chat
    if (cue && cue.test(String(env.text))) return true;
    if (also && also(S, env)) return true;
    const beat = Number.isInteger(env.at) ? Math.floor(env.at / 2) : 0;   // two messages ≈ one exchange
    return beat % every === 0;
};
export const both = (...fs) => (S, env) => fs.every((f) => f(S, env));
