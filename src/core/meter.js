// Token meter: what each active app adds to the reader's prompt and to the note, in characters (≈ 4 per token for
// English). Pure: works on the registry and the current states, so the same numbers show in the app and in node.
import { buildClassifierPrompt, askedKeys } from './prompt.js';
import { compose } from './note.js';

const len = (x) => String(x ?? '').length;
// -> { reader: { base, total }, note: { total }, apps: [{ id, keys, reader: { keys, rules, state }, note }] }
export function meter({ reg, states = {}, envOf = () => ({}) }) {
    // the fixed part of the reader's prompt with no app: role, rules, output (measured with a stand-in key)
    const one = { api: 1, id: 'x', keys: [{ id: 'x', line: 'x: y' }], reduce() {} }, solo = { list: () => [one], keys: () => [{ id: 'x', line: 'x: y', app: 'x' }] };
    const base = len(buildClassifierPrompt({ reg: solo, reply: '', user: '' })) - len('x: y');
    const apps = [], asked = askedKeys(reg, states, envOf), asking = new Set(asked.map((k) => k.app));
    for (const a of reg.list()) {
        const env = envOf(a.id), mine = asked.filter((k) => k.app === a.id);
        let rules = [], state = [];
        try { rules = (typeof a.rules === 'function' ? a.rules(env) : a.rules) ?? []; } catch (e) { rules = []; }
        try { state = asking.has(a.id) ? a.stateLines?.(states[a.id], env) ?? [] : []; } catch (e) { state = []; }
        const keys = mine.reduce((n, k) => n + len(k.line) + (k.quote ? 10 : 0) + 1, 0);
        apps.push({ id: a.id, keys: mine.length, reader: { keys, rules: asking.has(a.id) ? rules.reduce((n, r) => n + len(r) + 4, 0) : 0, state: state.filter(Boolean).reduce((n, l) => n + len(l) + 1, 0) }, note: 0 });
    }
    const n = reg.size ? compose({ reg, states, envOf }) : { state: '', now: '', by: {} };
    for (const [id, x] of Object.entries(n.by)) { const row = apps.find((a) => a.id === id); if (row) row.note = [...x.state, ...x.now].reduce((s, l) => s + len(l) + 3, 0); }
    const anyKeys = asked.length > 0;
    const readerTotal = anyKeys ? base + apps.reduce((s, a) => s + a.reader.keys + a.reader.rules + a.reader.state, 0) : 0;
    return { reader: { base: anyKeys ? base : 0, fixed: anyKeys ? base + apps.reduce((s, a) => s + a.reader.keys + a.reader.rules, 0) : 0, total: readerTotal }, note: { total: len(n.state) + len(n.now) + (n.state && n.now ? 2 : 0) }, apps };
}
