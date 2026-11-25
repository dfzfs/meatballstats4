// The note sent with the next reply: every active app adds its lines, the core wraps them. No lines = empty string.
export const STATE_HEAD = '[Story notes — background facts kept by a clerk. Use them silently. Never quote, list or mention them.]';
export const NOW_HEAD = '[For this reply only]';

// -> { state: string, now: string, by: { appId: { state: [...], now: [...] } }, screened?: [{ app, by, line, to? }] }  (screened only while a screening app is on)
// An app may screen every OTHER app's lines (optional `screen(line, fromId, state, env)`): false = the line is held back,
// a string = the line goes out as that string instead (a word taken out), anything else = untouched.
// With no screening app on, nothing is looked at twice.
export function compose({ reg, states = {}, envOf = () => ({}) }) {
    const state = [], now = [], by = {}, screened = [];
    const screens = reg.list().filter((a) => typeof a.screen === 'function');
    // -> the line to send ('' = held back)
    const pass = (line, from) => {
        let cur = line;
        for (const s of screens) {
            if (s.id === from) continue;
            let r = true;
            try { r = s.screen(cur, from, states[s.id], envOf(s.id)); } catch (e) { r = true; }
            if (r === false) { screened.push({ app: from, by: s.id, line }); return ''; }
            if (typeof r === 'string' && r.trim() && r !== cur) { screened.push({ app: from, by: s.id, line: cur, to: r.trim() }); cur = r.trim(); }
        }
        return cur;
    };
    const lines = (list, from) => (list ?? []).map((x) => String(x ?? '').trim()).filter(Boolean).map((x) => (screens.length ? pass(x, from) : x)).filter(Boolean);
    for (const app of reg.list()) {
        if (!app.note) continue;
        let n = null;
        try { n = app.note(states[app.id], envOf(app.id)); } catch (e) { n = null; }
        if (!n) continue;
        const s = lines(n.state, app.id), w = lines(n.now, app.id);
        if (s.length || w.length) by[app.id] = { state: s, now: w };
        state.push(...s); now.push(...w);
    }
    return {
        state: state.length ? `${STATE_HEAD}\n${state.map((l) => `- ${l}`).join('\n')}` : '',
        now: now.length ? `${NOW_HEAD}\n${now.map((l) => `- ${l}`).join('\n')}` : '',
        by, ...(screens.length ? { screened } : {}),
    };
}
