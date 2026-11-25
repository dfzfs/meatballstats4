// Everything that touches the chat application lives in src/st/. This file: saved settings and per-chat data.
export const KEY = 'meatball4';          // settings key, chat-metadata key, prompt-slot prefix: all our own
export const VERSION = '4.1.0';

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
export const saveChat = () => { try { const c = ctx(); (c.saveMetadataDebounced ?? c.saveMetadata)?.(); } catch (e) { /* saved with the next message */ } };

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
