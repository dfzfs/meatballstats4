// The shared ledger: every app's state, rebuilt from the chat in order. Nothing is stored as a running total,
// so swipes, deletions, edits and branches are always right — the state is whatever the chat on screen adds up to.
import { fingerprint, isReply } from './text.js';

// chat: messages · records: { fingerprint: { L: [[key, value, quote?], ...] } } · fixes: { fingerprint: [[key, value], ...] } · reg: active apps
// -> { appId: state }
export function fold({ chat = [], records = {}, fixes = {}, reg, envOf = () => ({}), upto = Infinity }) {
    const S = {};
    for (const app of reg.list()) { try { S[app.id] = app.start ? app.start(envOf(app.id)) : {}; } catch (e) { S[app.id] = {}; } }
    const n = Math.min(chat.length, upto);
    for (let i = 0; i < n; i++) {
        const m = chat[i];
        if (!isReply(m)) continue;
        const fp = fingerprint(m);
        // what the reader recorded for this reply, then what the person corrected by hand on it
        const lines = [...(records[fp]?.L ?? []), ...(fixes[fp] ?? [])];
        for (const [k, v, q] of lines) {
            const app = reg.ownerOf(k);
            if (!app?.reduce) continue;   // the app that owned this key is off: its lines are simply not counted
            try { app.reduce(S[app.id], { k, v, q: q ?? '', i }, envOf(app.id)); } catch (e) { /* one bad line never breaks the ledger */ }
            for (const w of reg.watchers(k)) { try { w.reduce(S[w.id], { k, v, q: q ?? '', i, watched: true }, envOf(w.id)); } catch (e) { /* same */ } }
        }
    }
    // ✏️ what the person set by hand on the screen (kept in the app's own data, no model call): laid over the sum
    // (also when the reader gets the state before a reply, so it judges from the corrected values)
    for (const app of reg.list()) { if (app.adjust) { try { app.adjust(S[app.id], envOf(app.id)); } catch (e) { /* optional */ } } }
    return S;
}

// Replies that still have no record, newest first. `max` keeps an old, never-read chat from causing a burst of calls.
export function pending({ chat = [], records = {}, max = 2 }) {
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < max; i--) {
        const m = chat[i];
        if (!isReply(m)) continue;
        const fp = fingerprint(m);
        if (records[fp]) break;   // everything older than the newest read reply is left alone (read on request only)
        let user = '';
        for (let j = i - 1; j >= 0; j--) { if (chat[j].is_user && !chat[j].is_system) { user = chat[j].mes ?? ''; break; } if (isReply(chat[j])) break; }
        out.push({ i, fp, reply: m.mes, user });
    }
    return out;
}

// Records of replies that no longer exist anywhere in the chat (not even as a swipe) are dropped.
export function prune(records, chat, keep = 400, st = null) {
    const live = new Set();
    for (const m of chat) {
        if (!m || m.is_user) continue;
        live.add(fingerprint(m));
        for (const s of m.swipes ?? []) live.add(fingerprint({ name: m.name, mes: s }));
    }
    const dead = Object.keys(records).filter((fp) => !live.has(fp));
    dead.sort((a, b) => (records[a].t ?? 0) - (records[b].t ?? 0));
    const cut = dead.slice(0, Math.max(0, dead.length - keep));   // a few dead ones are kept: an undo or a re-import brings them back
    for (const fp of cut) delete records[fp];
    // corrections and retry counters of replies that are gone go with them
    if (st) for (const side of [st.fix, st.tries]) if (side) for (const fp of Object.keys(side)) if (!live.has(fp) && !records[fp]) delete side[fp];
    return cut.length;
}

// Every reply without a record, oldest first (for reading a whole chat on request).
export function unread({ chat = [], records = {} }) {
    const out = [];
    chat.forEach((m, i) => {
        if (!isReply(m)) return;
        const fp = fingerprint(m);
        if (records[fp]) return;
        let user = '';
        for (let j = i - 1; j >= 0; j--) { if (chat[j].is_user && !chat[j].is_system) { user = chat[j].mes ?? ''; break; } if (isReply(chat[j])) break; }
        out.push({ i, fp, reply: m.mes, user });
    });
    return out;
}
