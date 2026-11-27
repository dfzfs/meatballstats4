// Everything that touches the chat application lives in src/st/. This file: saved settings and per-chat data.
export const KEY = 'meatball4';          // settings key, chat-metadata key, prompt-slot prefix: all our own
export const VERSION = '4.4.0';

export const ctx = () => globalThis.SillyTavern.getContext();

const DEFAULTS = { v: 1, on: true, asked: false, paused: false, profile: '', hud: true, chips: true, side: 'right', apps: {}, cards: {} };
export function cfg() {
    const es = ctx().extensionSettings;
    const s = (es[KEY] ??= structuredClone(DEFAULTS));
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = structuredClone(v);
    return s;
}
export const saveCfg = () => { try { ctx().saveSettingsDebounced(); } catch (e) { /* saved on the next change */ } };

export const hasChat = () => { try { return !!ctx().getCurrentChatId?.(); } catch (e) { return false; } };
// This chat's data. Created only when something is about to be written.
export function store(create = false) {
    const md = ctx().chatMetadata;
    if (!md || !hasChat()) return null;
    if (!md[KEY] && create) md[KEY] = { v: 1, ev: {}, apps: {} };
    return md[KEY] ?? null;
}
// Saving this chat's data rewrites the whole chat file. Many small saves close together (and one right on top of the
// application's own save after a reply) can collide on Windows (EPERM on rename). So saves are gathered: one save a
// moment after the last change, and none while a reply is being written or just after it was saved by the application.
// The data lives in the chat's metadata, so the application's own save carries it too; nothing waits forever.
const SAVE_WAIT = 1200;
let saveTimer = null, saveFor = '', hold = () => false;
export const holdSaves = (fn) => { hold = typeof fn === 'function' ? fn : () => false; };
function flushChat(tries = 0) {
    saveTimer = null;
    try {
        const c = ctx();
        if (!c.getCurrentChatId?.() || c.getCurrentChatId() !== saveFor) return;   // the chat was switched: it was saved on the way out
        if (tries < 20 && hold()) { saveTimer = setTimeout(() => flushChat(tries + 1), SAVE_WAIT); return; }
        (c.saveMetadataDebounced ?? c.saveMetadata)?.();
    } catch (e) { /* saved with the next message */ }
}
export const saveChat = () => {
    try { saveFor = ctx().getCurrentChatId?.() ?? ''; } catch (e) { saveFor = ''; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flushChat(0), SAVE_WAIT);
};

// One key per character card or group, for data that should follow them from chat to chat.
export const cardKey = () => { try { const c = ctx(); return c.groupId ? `g:${c.groupId}` : c.characters?.[c.characterId]?.avatar ? `c:${c.characters[c.characterId].avatar}` : ''; } catch (e) { return ''; } };
export const names = () => { const c = ctx(); return { user: c.name1 ?? '', char: c.name2 ?? '' }; };
export const profiles = () => (ctx().extensionSettings?.connectionManager?.profiles ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id }));
export const toast = (msg, kind = 'info') => { try { globalThis.toastr?.[kind]?.(msg, '미트볼'); } catch (e) { /* notices are optional */ } };

// Traces of earlier generations in this chat (read-only; never changed or removed).
const OLD = { v1: 'statussim', v2: 'meatlite', v3: 'meatball_status3' };
export function oldData() {
    const md = ctx().chatMetadata ?? {};
    return Object.entries(OLD).filter(([, k]) => md[k] && typeof md[k] === 'object').map(([gen]) => gen);
}
