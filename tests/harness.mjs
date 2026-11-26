// Offline test harness: the engine and the apps run in plain node, against a fake chat application.
// No SillyTavern, no model calls. The "reader" answers come from fixtures (answers recorded as text).
// Every name and line in the fixtures is made up for testing.
import { JSDOM } from 'jsdom';

const ROOT = new URL('../src/', import.meta.url).href;
export const src = (p) => `${ROOT}${p}`;

// A tiny page, so app screens can be drawn and clicked (jsdom).
export function page() {
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="chat"></div><textarea id="send_textarea"></textarea></body></html>', { pretendToBeVisual: true });
    const g = globalThis;
    for (const k of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'CSS']) {
        try { Object.defineProperty(g, k, { value: dom.window[k] ?? (k === 'CSS' ? { escape: (s) => String(s).replace(/["\\]/g, '\\$&') } : undefined), configurable: true, writable: true }); } catch (e) { /* read-only in this node */ }
    }
    // jsdom has no layout: scrolling is a no-op here
    dom.window.Element.prototype.scrollIntoView ??= function () {};
    if (!g.CSS?.escape) g.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
    return dom;
}

// A chat: [{ user: '...' } | { reply: '...' }] -> SillyTavern-shaped messages
export const chatOf = (list, char = '도윤') => list.map((m) => (m.user != null ? { is_user: true, name: '하루', mes: m.user } : { is_user: false, name: char, mes: m.reply }));

// Builds an engine with the named apps switched on. Returns helpers to read replies and look at the result.
export async function setup({ apps = [], chat = [], user = '하루', char = '도윤', answers = [] } = {}) {
    const { Engine } = await import(src('core/engine.js'));
    const { fingerprint } = await import(src('core/text.js'));
    const md = { ev: {}, apps: {} }, cfg = { apps: {} }, put = { state: '', now: '' };
    let gen = '';
    const queue = [...answers];
    const host = {
        chat: () => chat, store: () => md, cfg: () => cfg, saveChat() {}, saveCfg() {}, cardKey: () => 'c:test',
        names: () => ({ user, char }), gen: () => gen, toast() {}, changed() {},
        put(slot, text) { put[slot] = text; },
        // the reader: the next recorded answer (or «none»)
        classify: async () => queue.shift() ?? '<mb>none</mb>',
        ask: async () => queue.shift() ?? '',
    };
    const E = new Engine(host);
    for (const id of apps) { const why = E.add((await import(src(`apps/${id}.js`))).default); if (why) throw new Error(`${id}: ${why}`); }
    return {
        E, md, cfg, put, chat, fingerprint,
        setGen: (g) => { gen = g; },
        // record lines for one reply by hand: [[key, value, quote?], ...]
        record: (i, L) => { md.ev[fingerprint(chat[i])] = { t: 0, L }; E.touch(); },
        // a new reply arrives: what the runtime does (one-time things spent, the reader asked)
        async arrive(text) { chat.push({ is_user: false, name: char, mes: text }); E.onReply(); return E.read({ max: 1 }); },
        say(text) { chat.push({ is_user: true, name: user, mes: text }); E.touch(); E.refresh(); },
        state: (id) => E.state(id),
        note: () => E.note(),
    };
}

// The api an app screen gets from the phone (enough of it for drawing and clicking).
export async function apiFor(E, id, { draw = () => {} } = {}) {
    const env = E.envOf(id), kit = await import(src('ui/kit.js'));
    return {
        env, store: env.store, cfg: env.cfg, kit,
        state: () => E.state(id), save: () => { E.touch(); E.refresh(); }, redraw: draw,
        fix: (k, v) => E.fix(k, v), toast() {}, close() {}, menu() {}, onBack() {}, title() {}, go() {}, here: () => `app:${id}`,
        isOn: (other) => E.reg.has(other), ask: async () => '', facts: () => '', regen: () => false, say: () => true,
        core: { log: () => E.log(), chips: (e) => E.chips(e), reread: async () => 0, unfix: (i) => E.unfix(i), chat: () => E.host.chat(), status: () => ({ apps: [], keys: [], calls: 0, kept: 0, dropped: 0, unread: 0 }), ownerOf: (k) => E.reg.ownerOf(k)?.id ?? '' },
        helper: { appsOn: () => [], keys: () => [], chip: () => '', fix: (k, v) => E.fix(k, v), storeOf: () => null, cardOf: () => null },
    };
}
