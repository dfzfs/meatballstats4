// One-time things (a die's verdict, an answered confession card, a text exchange to tell): spent by the reply they
// were for — but a reroll (swipe / regenerate) of that same reply gets them again, so a new version does not lose them.
// When spent, the value is kept beside it as `<key>_was` with the index of the reply that used it.

export const isReroll = (env) => env?.gen === 'swipe' || env?.gen === 'regenerate';
const lastOf = (env) => env?.last ?? 0;
const was = (store, key, env) => { const w = store?.[`${key}_was`]; return isReroll(env) && w && w.at === lastOf(env) ? w.v : null; };

// A value with nothing to mark when it was set: live until the next reply, then kept for rerolls of that reply.
export function plain(store, key, env) { const x = store?.[key]; return x != null && x !== '' ? x : was(store, key, env); }
export function spendPlain(store, key, env) {
    const x = store?.[key];
    if (x == null || x === '') return false;
    store[`${key}_was`] = { v: x, at: lastOf(env) };
    store[key] = null;
    return true;
}

// A value stamped with `.at` = the newest reply when it was set: it rides only with the reply written after that one.
export function stamped(store, key, env) { const x = store?.[key]; return x && x.at === lastOf(env) ? x : was(store, key, env); }
export function spendStamped(store, key, env) {
    const x = store?.[key];
    if (!x || lastOf(env) <= (x.at ?? 0)) return false;
    store[`${key}_was`] = { v: x, at: lastOf(env) };
    store[key] = null;
    return true;
}
