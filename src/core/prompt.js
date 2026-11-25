// Builds the ONE classifier prompt of a turn from the active apps. No keys -> no prompt -> no call.
import { cleanText } from './text.js';

const BASE_RULES = [
    'Only what the text states. If unsure, leave the line out.',
    'Flashbacks, dreams, plans and wishes are not facts. In <user>, requests, questions and bracketed directions are not facts; a plain statement of what happened is.',
    'Write names exactly as the text does.',
    'A key marked (quote) ends with  | "a short exact quote from the text"  as proof; without one the line is thrown away.',
    'Use only the keys listed under [KEYS]. One change per line. No comments, no other text.',
    'Report the state at the end of the text.',
    'If [CURRENT STATE] has nothing for a key and the text makes it clear (place, who is present, time of day, clothes), record it anyway: the first reading sets the scene.',
    'If nothing changed: <mb>none</mb>',
];

// parts: { reg, states, envOf(appId), reply, user }  ->  prompt string ('' when there is nothing to ask)
// jobs (optional): several replies read in one call, each numbered: [{ i, reply, user }]. Every answer line then starts with #i.
// A key with `when(state, env)` (optional) is listed only while it returns true: its app has nothing to ask about otherwise.
// turn (optional, NEXT-3 technique 2/4): { text, at, read, force } — the text about to be read, the index of the reply,
// how many replies were already read in this chat, and «read again» (every key asked). A `when` that needs the text
// and does not get it must answer true (fail open): the meter and the screens call this without a turn.
export const askedKeys = (reg, states = {}, envOf = () => ({}), turn = null) => reg.keys().filter((k) => { if (typeof k.when !== 'function') return true; try { return !!k.when(states[k.app], turn ? { ...envOf(k.app), ...turn } : envOf(k.app)); } catch (e) { return true; } });
// Rules that travel with their key (technique 3): sent only in turns where that key is asked.
export function keyRules(k, env) { try { const r = typeof k.rules === 'function' ? k.rules(env) : k.rules; return (r ?? []).map(String).filter(Boolean); } catch (e) { return []; } }
export const turnText = ({ reply = '', user = '', jobs = null }) => (Array.isArray(jobs) && jobs.length ? jobs.map((j) => [j.user, j.reply].filter(Boolean).join('\n')).join('\n') : [user, reply].filter(Boolean).join('\n'));
export function buildClassifierPrompt({ reg, states = {}, envOf = () => ({}), reply = '', user = '', jobs = null, turn = null }) {
    const keys = askedKeys(reg, states, envOf, turn);
    if (!keys.length) return '';
    const state = [], rules = [...BASE_RULES];
    const asking = new Set(keys.map((k) => k.app));
    for (const app of reg.list()) {
        if (!asking.has(app.id)) continue;
        try { for (const l of app.stateLines?.(states[app.id], envOf(app.id)) ?? []) if (l) state.push(String(l)); } catch (e) { /* an app's state line is optional */ }
        try { for (const r of (typeof app.rules === 'function' ? app.rules(envOf(app.id)) : app.rules) ?? []) rules.push(String(r)); } catch (e) { /* an app's extra rules are optional */ }
    }
    for (const k of keys) for (const r of keyRules(k, envOf(k.app))) if (!rules.includes(r)) rules.push(r);
    const one = (u, r) => [u ? `<user>\n${cleanText(u)}\n</user>` : '', cleanText(r)].filter(Boolean).join('\n\n');
    const many = Array.isArray(jobs) && jobs.length > 1;
    const text = many ? jobs.map((j) => `«#${j.i}»\n${one(j.user, j.reply)}`).join('\n\n') : one(jobs?.[0]?.user ?? user, jobs?.[0]?.reply ?? reply);
    if (many) rules.push(`[NEW TEXT] holds ${jobs.length} replies in story order, each under its number «#n». Start every line with the number of the reply it comes from: #${jobs[0].i} key: value. Report each reply separately, in order; [CURRENT STATE] is the state before the first of them.`);
    return [
        '[ROLE]\nYou are a story clerk. From [NEW TEXT], write what changed in the current state, and what the state is still missing.',
        `[CURRENT STATE]\n${state.length ? state.join('\n') : '(nothing recorded yet)'}`,
        `[NEW TEXT]\n${text}`,
        `[RULES]\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
        `[KEYS] one per line\n${keys.map((k) => `${k.line}${k.quote ? '   (quote)' : ''}`).join('\n')}`,
        many ? `[OUTPUT]\n<mb>\n#${jobs[0].i} key: value\n</mb>` : '[OUTPUT]\n<mb>\nkey: value\n</mb>',
    ].join('\n\n');
}
