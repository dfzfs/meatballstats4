// App registry: which apps are active and which classifier key belongs to which app.
// An app that is not in the registry does not exist for the engine: no keys, no notes, no state.
export const API = 1;       // contract version the core speaks
export const MIN_API = 1;   // oldest app contract still accepted

const ID = /^[a-z][a-z0-9-]{1,31}$/;
const KEY = /^[a-z]{2,16}$/;
const COSTS = new Set(['zero', 'low', 'tap']);

// Returns '' when the definition is usable, else a short reason code.
export function checkDef(def) {
    if (!def || typeof def !== 'object') return 'not-an-object';
    if (!ID.test(String(def.id ?? ''))) return 'bad-id';
    if (!Number.isInteger(def.api)) return 'no-api-version';
    if (def.api > API) return 'needs-newer-core';
    if (def.api < MIN_API) return 'too-old';
    if (def.cost && !COSTS.has(def.cost)) return 'bad-cost';
    for (const k of def.keys ?? []) {
        if (!KEY.test(String(k?.id ?? ''))) return 'bad-key';
        if (typeof k.line !== 'string' || !k.line.startsWith(`${k.id}:`)) return 'bad-key-line';
        if (k.when != null && typeof k.when !== 'function') return 'bad-key-when';
        if (k.rules != null && typeof k.rules !== 'function' && !(Array.isArray(k.rules) && k.rules.every((r) => typeof r === 'string'))) return 'bad-key-rules';
    }
    if ((def.keys ?? []).length && typeof def.reduce !== 'function') return 'keys-without-reduce';
    if (def.watch != null && (!Array.isArray(def.watch) || def.watch.some((k) => !KEY.test(String(k))) || typeof def.reduce !== 'function')) return 'bad-watch';
    for (const f of ['start', 'reduce', 'check', 'stateLines', 'note', 'screen', 'render', 'widget', 'hud', 'chip', 'onReply', 'onEnable', 'onDisable']) if (def[f] != null && typeof def[f] !== 'function') return `bad-${f}`;
    return '';
}

export class Registry {
    constructor() { this.apps = new Map(); this.owner = new Map(); }
    // -> '' on success, else a reason code. Nothing is half-registered.
    add(def) {
        const why = checkDef(def);
        if (why) return why;
        if (this.apps.has(def.id)) return 'id-taken';
        for (const k of def.keys ?? []) if (this.owner.has(k.id)) return `key-taken:${k.id}`;
        this.apps.set(def.id, def);
        for (const k of def.keys ?? []) this.owner.set(k.id, def.id);
        return '';
    }
    remove(id) {
        const def = this.apps.get(id);
        if (!def) return false;
        for (const k of def.keys ?? []) if (this.owner.get(k.id) === id) this.owner.delete(k.id);
        this.apps.delete(id);
        return true;
    }
    get(id) { return this.apps.get(id) ?? null; }
    has(id) { return this.apps.has(id); }
    list() { return [...this.apps.values()]; }
    get size() { return this.apps.size; }
    // Every active key with its owner, in registration order.
    keys() { return this.list().flatMap((a) => (a.keys ?? []).map((k) => ({ ...k, app: a.id }))); }
    ownerOf(key) { const id = this.owner.get(key); return id ? this.apps.get(id) : null; }
    // Apps that asked to be told about a key they do not own (read-only: they cannot add it to the reader's list).
    watchers(key) { return this.list().filter((a) => a.watch?.includes(key)); }
    // Changes whenever the set of active keys changes (kept with each record, shown in "how it was read").
    keySig() { return this.keys().map((k) => k.id).sort().join(','); }
}
