// Wires the engine to the chat application: events, the reader queue, the prompt slots and app loading.
// Loaded only when the master switch is on. Listeners exist only while at least one app is on.
import { Engine } from '../core/engine.js';
import { checkDef, API } from '../core/registry.js';
import { ctx, cfg, saveCfg, store, saveChat, names, cardKey, hasChat, toast, KEY, VERSION } from './host.js';
import { fingerprint, isReply } from '../core/text.js';
import { BUILTIN } from '../apps/catalog.js';

const IN_CHAT = 1, SYSTEM = 0;
const SLOT = { state: { key: `${KEY}_state`, depth: 1 }, now: { key: `${KEY}_now`, depth: 0 } };
// Token ceilings, not targets: a model that thinks before it answers spends its thinking from the same budget, and with
// 500 a tap call came back cut off after one line two times in three (measured live). The prompts set the length.
// No length caps of our own: every call gets the same roomy ceiling (8192 — what most connections accept as their
// largest), and the prompts only suggest how long to write.
const AFTER_REPLY = 2500, GAP = 4000, TIMEOUT = 120000, ROOM = 8192;

const Q = { timer: null, lastCall: 0, generating: false, calls: [], fails: 0, notBefore: 0, cont: null, told: false };
const PER_MINUTE = 6, WAIT_LIMIT = 60000, COOL = 600000;
const limited = (msg) => /429|too many requests|rate.?limit|quota|overloaded/i.test(String(msg));
// Every model call Meatball makes goes through here: the chosen connection profile, or the main connection.
async function model(prompt, max, temperature) {
    const c = ctx(), pid = cfg().profile;
    const call = pid && c.ConnectionManagerRequestService
        ? c.ConnectionManagerRequestService.sendRequest(pid, prompt, max, { stream: false, extractData: true, includePreset: false, includeInstruct: false }, { temperature })
        : c.generateRaw({ prompt, responseLength: max });
    let timer = null;
    try {
        const r = await Promise.race([call, new Promise((_, no) => { timer = setTimeout(() => no(new Error('timeout')), TIMEOUT); })]);
        return typeof r === 'string' ? r : (r?.content ?? '');
    } finally { clearTimeout(timer); }
}
const EXT = new Map();        // apps that arrived from separately installed extensions: id -> def
const MODS = new Map();       // built-in app modules imported so far: id -> def
const STYLES = new Map();     // id -> <style> of an app that brought its own CSS
let listening = false;

const host = {
    chat: () => ctx().chat ?? [],
    store, cfg, saveChat, saveCfg, names, cardKey, toast,
    put(slot, text) { const s = SLOT[slot]; try { ctx().setExtensionPrompt(s.key, text || '', IN_CHAT, s.depth, false, SYSTEM); } catch (e) { console.warn('[meatball] could not place the note', e); } },
    changed() { try { document.dispatchEvent(new CustomEvent('mb4:update')); } catch (e) { /* no page */ } },
    gen: () => Q.gen ?? '',
    classify: (prompt) => model(prompt, ROOM, 0.2),
    ask: (prompt) => model(prompt, ROOM, 0.9),
};
export const engine = new Engine(host);

// ── reader queue: one call at a time, never while the main reply is being written ──
export function kick(delay = AFTER_REPLY) { clearTimeout(Q.timer); Q.timer = setTimeout(tick, delay); Q.timer?.unref?.(); }
async function tick() {
    if (!cfg().on || !hasChat() || Q.generating || engine.busy || !engine.reg.keys().length) return;
    const now = Date.now();
    Q.calls = Q.calls.filter((t) => now - t < 60000);
    // spaced out, never more than a few a minute, and patient after the connection said no
    const wait = Math.max(Q.lastCall + GAP - now, Q.notBefore - now, Q.calls.length >= PER_MINUTE ? Q.calls[0] + 60000 - now : 0);
    if (wait > 0) return kick(wait + 50);
    Q.lastCall = now;
    // «읽는 간격» (2 or 3): wait until that many replies have gathered, then read them together in ONE call.
    const every = Math.max(1, Math.min(3, Number(cfg().every) || 1));
    let calls = 0;
    if (every > 1) {
        const tail = engine.tail(every);
        if (tail.length < every) return;
        calls = (await engine.fill({ batch: every, only: new Set(tail.map((j) => j.fp)), src: 'gap' })).calls;
    } else calls = await engine.read({ max: 1 });
    if (!calls) return;
    Q.calls.push(Date.now());
    const st = engine.stats.status;
    if (st.startsWith('error')) {
        Q.fails++;
        Q.notBefore = Date.now() + (Q.fails >= 3 ? COOL : limited(st) ? WAIT_LIMIT : GAP * 2 * Q.fails);
        if (Q.fails >= 3 && !Q.told) { Q.told = true; toast('답을 읽는 AI에 연결이 안 돼요. 10분 쉬었다가 다시 해 볼게요. 설정에서 연결을 확인해 주세요.', 'warning'); }
    } else { Q.fails = 0; Q.told = false; }
    kick(GAP);   // maybe one more reply is waiting
}

// ── events (attached only while an app is on) ──
const quiet = (type, opts, dry) => !!dry || type === 'quiet' || type === 'impersonate' || !!opts?.quiet_prompt;
// Secrets, directions and notes set in an earlier Meatball come along by themselves the first time a chat is opened
// (reply records still wait for 「이어 가기」). Done once per chat; nothing old is changed.
const CARRY_V = 3;
// The third generation's lore sheet: this chat's own, else the one set for the character, else the lorebook entry.
async function v3Lore(md) {
    const c = ctx(), s3 = md.meatball_status3;
    if (s3?.lore) return String(s3.lore);
    const key = c.groupId ? `group:${c.groupId}` : c.characters?.[c.characterId]?.avatar || '';
    const byChar = c.extensionSettings?.meatball_status3?.loreByChar?.[key];
    if (byChar) return String(byChar);
    try {
        const book = c.characters?.[c.characterId]?.data?.extensions?.world;
        if (book && c.loadWorldInfo) {
            const data = await c.loadWorldInfo(book);
            const e = Object.values(data?.entries ?? {}).find((x) => /미트볼\s*(설계도|설정집)|meatball\s*(blueprint|lore)/i.test(`${x.comment ?? ''} ${String(x.content ?? '').slice(0, 40)}`));
            if (e) return String(e.content ?? '');
        }
    } catch (e) { /* no lorebook */ }
    return '';
}
async function carry() {
    try {
        const md = ctx().chatMetadata ?? {};
        const st0 = store(false);
        if ((st0?.carried ?? 0) >= CARRY_V) return;
        const M = await import('./migrate.js');
        const has = ['meatball_status3', 'meatball_director', 'meatlite', 'statussim'].some((k) => md[k] && typeof md[k] === 'object');
        const apps = has ? M.settingsOnly(md, ctx().chat ?? [], names().user) : {};
        const lore = M.loreSecrets(await v3Lore(md));
        if (lore.length) apps.secrets = { ...(apps.secrets ?? {}), list: [...(apps.secrets?.list ?? []), ...lore] };
        if (!has && !lore.length) return;
        // secrets are added to what is already here (never replacing it); everything else fills only empty places
        const sec = apps.secrets?.list ?? []; delete apps.secrets;
        if (Object.keys(apps).length) engine.adopt({}, apps);
        if (sec.length) {
            const st = store(true), cur = ((st.apps ??= {}).secrets ??= {});
            cur.list = Array.isArray(cur.list) ? cur.list.filter((x) => x && (x.v || x.t)) : [];
            for (const x of sec) if (!cur.list.some((y) => (y.id && y.id === x.id) || String(y.v ?? y.t ?? '').trim() === x.v.trim())) cur.list.push(x);
            cur.list = cur.list.slice(0, 20);
        }
        // records carried from v3 by an older, wrong translation (dates, money) are translated again
        if (md.meatball_status3 && typeof md.meatball_status3 === 'object') {
            const st = store(true), fresh = M.collect({ meatball_status3: md.meatball_status3 }, ctx().chat ?? [], names().user).records;
            for (const [fp, rec] of Object.entries(st.ev ?? {})) if (rec?.src === 'v3' && fresh[fp]) st.ev[fp] = fresh[fp];
        }
        store(true).carried = CARRY_V; saveChat(); engine.touch();
        if (sec.length) toast(`옛 미트볼의 비밀 ${sec.length}개를 가져왔어요.`);
    } catch (e) { console.warn('[meatball] could not carry earlier settings', e); }
}
const H = {
    chat: () => { engine.clear(); engine.onChat(); carry().finally(() => { engine.touch(); engine.refresh(); host.changed(); }); kick(); },
    reply: () => {
        // the application may say "generation ended" before or after the reply arrives (streaming: before), so the
        // kind of generation that made this reply is kept until the reply has been counted
        const live = Q.gen;
        Q.gen = live || Q.made || '';
        engine.onReply();
        Q.made = '';
        if (Q.gen !== live) { Q.gen = live; engine.touch(); engine.refresh(); }
        const c = Q.cont; Q.cont = null;
        // the reply was extended: keep what was recorded for it, read only what was added
        if (c) engine.continued(c.fp, c.len).catch(() => {}).finally(() => { host.changed(); kick(); });
        else { host.changed(); kick(); }
    },
    edit: () => { engine.onChat(); kick(); },
    genStart: (type, opts, dry) => {
        if (quiet(type, opts, dry)) return;
        Q.generating = true;
        Q.gen = Q.made = String(type || 'normal');
        const last = [...(ctx().chat ?? [])].reverse().find(isReply);
        Q.cont = type === 'continue' && last ? { fp: fingerprint(last), len: String(last.mes ?? '').length } : null;
    },
    genEnd: () => { Q.generating = false; Q.gen = ''; kick(); },
    // the person's message has just joined the chat (it is not there yet when the generation starts): lines that
    // depend on what they wrote are worked out now, before the prompt is put together
    userSent: () => { engine.touch(); engine.refresh(); },
    beforeSend: (type, opts, dry) => { if (!quiet(type, opts, dry)) { Q.gen = String(type || 'normal'); engine.touch(); engine.refresh(); } },
};
function wiring() {
    const E = ctx().event_types;
    return [
        [E.CHAT_CHANGED, H.chat], [E.MESSAGE_RECEIVED, H.reply],
        [E.MESSAGE_SWIPED, H.edit], [E.MESSAGE_DELETED, H.edit], [E.MESSAGE_EDITED, H.edit],
        [E.GENERATION_STARTED, H.genStart], [E.GENERATION_ENDED, H.genEnd], [E.GENERATION_STOPPED, H.genEnd],
        [E.GENERATION_AFTER_COMMANDS, H.beforeSend], [E.MESSAGE_SENT, H.userSent],
    ].filter(([ev]) => ev);
}
function listen(on) {
    if (on === listening) return;
    const es = ctx().eventSource;
    for (const [ev, fn] of wiring()) on ? es.on(ev, fn) : es.removeListener(ev, fn);
    listening = on;
    if (!on) { clearTimeout(Q.timer); engine.clear(); Object.assign(Q, { fails: 0, notBefore: 0, cont: null, told: false, calls: [] }); }
}
export const budgets = { read: ROOM, askMin: ROOM, askMax: ROOM };
export const listenerCount = () => (listening ? wiring().length : 0);

// ── apps ──
const appCfg = (id) => ((cfg().apps ??= {})[id] ??= {});
export const isOn = (id) => (EXT.has(id) ? appCfg(id).on !== false : appCfg(id).on === true);
export const externals = () => [...EXT.values()];
export const active = () => engine.reg.list();
export const loadedBuiltins = () => [...MODS.keys()];
export const queueState = () => ({ fails: Q.fails, waitMs: Math.max(0, Q.notBefore - Date.now()), lastMinute: Q.calls.length });

function style(def, on) {
    STYLES.get(def.id)?.remove(); STYLES.delete(def.id);
    if (!on || !def.css) return;
    const el = document.createElement('style');
    el.dataset.mb4App = def.id; el.textContent = String(def.css);
    document.head.append(el); STYLES.set(def.id, el);
}
function plug(def) {
    const why = engine.add(def);
    if (why) { console.warn(`[meatball] app "${def?.id}" was not added: ${why}`); return why; }
    style(def, true);
    try { def.onEnable?.(engine.envOf(def.id)); } catch (e) { console.warn(`[meatball] ${def.id} onEnable`, e); }
    return '';
}
function unplug(id) {
    const def = engine.reg.get(id);
    if (!def) return;
    try { def.onDisable?.(engine.envOf(id)); } catch (e) { console.warn(`[meatball] ${id} onDisable`, e); }
    style(def, false);
    engine.remove(id);
}
async function loadBuiltin(id) {
    if (!BUILTIN.some((a) => a.id === id)) return null;
    if (!MODS.has(id)) MODS.set(id, (await import(`../apps/${id}.js`)).default);   // the only place a built-in app's code is fetched
    return MODS.get(id);
}
// Switch one app on or off. Returns '' or a reason code.
export async function setApp(id, on) {
    appCfg(id).on = !!on; saveCfg();
    let why = '';
    if (on && !engine.reg.has(id)) {
        const def = EXT.get(id) ?? await loadBuiltin(id).catch((e) => { console.warn(`[meatball] could not load ${id}`, e); return null; });
        why = def ? plug(def) : 'load-failed';
    } else if (!on) unplug(id);
    settle();
    return why;
}
// The strip above the input box and the labels under replies: fetched with the first app, removed with the last.
let frame = null;
async function chrome(on) {
    try {
        if (on) { frame ??= await import('../ui/frame.js'); frame.mount(engine); }
        else frame?.unmount();
    } catch (e) { console.warn('[meatball] status strip failed', e); }
}
export const redrawFrame = () => frame?.draw();
function settle() {
    listen(cfg().on && engine.reg.size > 0);
    chrome(cfg().on && engine.reg.size > 0);
    if (engine.reg.size) { engine.touch(); engine.refresh(); kick(); } else engine.clear();
    host.changed();
}

// Separately installed apps join through a global queue, so the order extensions load in does not matter:
//   (globalThis.MeatballApps ??= []).push(def)
export const WHY_KO = {
    'needs-newer-core': '이 앱은 더 새 미트볼이 필요해요. 미트볼을 업데이트해 주세요.',
    'too-old': '이 앱은 너무 옛 방식이에요. 앱을 업데이트해 주세요.',
    'id-taken': '같은 이름의 앱이 이미 있어요.',
};
function accept(def) {
    const why = checkDef(def);
    if (why) { console.warn(`[meatball] outside app refused (${why})`, def?.id); if (WHY_KO[why]) toast(`${def?.name ?? def?.id}: ${WHY_KO[why]}`, 'warning'); return; }
    if (EXT.has(def.id) || BUILTIN.some((a) => a.id === def.id)) { console.warn('[meatball] outside app refused (id-taken)', def.id); return; }
    EXT.set(def.id, def);
    if (isOn(def.id)) { const w = plug(def); if (w.startsWith('key-taken')) toast(`${def.name ?? def.id}: 다른 앱이 이미 같은 것을 읽고 있어서 켜지 못했어요.`, 'warning'); }
    settle();
}
function openQueue() {
    const waiting = globalThis.MeatballApps;
    globalThis.MeatballApps = Object.freeze({ push: (...defs) => { defs.forEach(accept); return EXT.size; } });
    if (Array.isArray(waiting)) waiting.forEach(accept);
}

// What other code may read. Copies only; nothing here can change Meatball's data.
function publish() {
    globalThis.Meatball = Object.freeze({
        api: API, version: VERSION,
        ready: () => hasChat(),
        paused: () => engine.paused(),
        has: (id) => engine.reg.has(id),
        state: (id) => engine.state(id),
    });
}

const MOVED_IN = ['map', 'life', 'mind', 'choices', 'contacts', 'fortune', 'music', 'twist', 'news'];
export async function boot() {
    publish();
    // these were separately installed apps (on unless switched off); now built in. Whoever already used Meatball keeps them as they were, once.
    if (!cfg().merged) { if (cfg().asked) for (const id of MOVED_IN) if (appCfg(id).on === undefined) appCfg(id).on = true; cfg().merged = 1; saveCfg(); }
    for (const a of BUILTIN) if (appCfg(a.id).on === true) { const def = await loadBuiltin(a.id).catch(() => null); if (def) plug(def); }
    for (const def of EXT.values()) if (isOn(def.id) && !engine.reg.has(def.id)) plug(def);   // switched back on after a master-off
    openQueue();
    settle();
    if (hasChat()) carry().finally(() => { engine.touch(); engine.refresh(); host.changed(); });
}
// Master switch off: nothing listens, nothing is in the prompt.
export function shutdown() { for (const a of active()) unplug(a.id); listen(false); chrome(false); host.changed(); }
