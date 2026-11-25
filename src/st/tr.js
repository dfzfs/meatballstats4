// 🌐 Screen translation — the host side. Imported only after the person picks an engine (free / ai); with
// «끔» this file is never fetched, nothing listens and nothing is sent (see tests/tr.test.mjs).
// What it changes: text nodes inside Meatball's own screens (the phone, the status strip, the labels under
// replies). Never stored state, never the main prompt, never the chat text (.mes_text is outside every root).
import { ctx, cfg, saveCfg, store, saveChat, toast } from './host.js';
import { trCfg, modeOf, Dict, Translator, lookup, category, glossList, pack, unpack, aiSystem, needs, CATS } from '../core/tr.js';

const ROOTS = '#mb4-phone .mb4-body, #mb4-phone .mb4-title, #mb4-hud, .mb4-msg';
const SKIP = 'input, textarea, select, script, style, pre, code, .mb4-notr, .mes_text';
const src = new WeakMap();          // text node -> { from: original text, to: what we wrote }
let T = null, chatId = '', engine = null;

export const settings = () => trCfg(cfg());
const chatGloss = () => (store(false)?.gloss ?? []);
export const gloss = () => glossList(chatGloss(), settings().glossary);
function dictObj() { const st = store(false); return st?.tr && typeof st.tr === 'object' ? st.tr : null; }

// one translator per chat; its dictionary lives in this chat's Meatball data (created with the first answer)
function tr() {
    let id = '';
    try { id = ctx().getCurrentChatId?.() ?? ''; } catch (e) { id = ''; }
    if (T && id === chatId) return T;
    T?.stop();
    chatId = id;
    const holder = dictObj() ?? {};
    T = new Translator({
        dict: new Dict(holder),
        settings: () => { const s = settings(); return { mode: modeOf(cfg()), lang: s.lang, cats: s.cats, gloss: gloss() }; },
        io: {
            send, now: () => Date.now(),
            setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t),
            notice: (m) => toast(m, 'warning'),
            saved: () => { const st = store(true); if (st && st.tr !== T.dict.D) st.tr = T.dict.D; saveChat(); repaint(); },
            changed: () => document.dispatchEvent(new CustomEvent('mb4:tr')),
        },
    });
    return T;
}
export const current = () => tr();

// ── engines ──
async function send(texts, { terms, lang, mode }) {
    return mode === 'ai' ? viaAI(texts, terms, lang) : viaFree(texts, lang);
}
// free: the application's own translation (Google by default). No model call, no tokens.
async function viaFree(texts, lang) {
    const C = ctx(), cmds = C.SlashCommandParser?.commands, cmd = cmds instanceof Map ? cmds.get('translate') : cmds?.translate;
    if (typeof cmd?.callback === 'function') {
        const es = C.extensionSettings?.translate ?? {};
        const out = await cmd.callback({ target: lang, ...(es.provider ? { provider: es.provider } : {}) }, pack(texts));
        if (typeof out !== 'string' || !out.trim()) throw new Error('번역 결과가 비었어요');
        return unpack(out, texts.length);
    }
    // the application's translate route (used by the third generation): one line per text; a different line count = nothing paired
    const r = await fetch('/api/translate/google', { method: 'POST', headers: C.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texts.map((t) => t.replace(/\s*\n\s*/g, ' ')).join('\n'), lang }) });
    if (!r.ok) throw new Error(`translate ${r.status}`);
    const lines = (await r.text()).split('\n');
    return lines.length === texts.length ? lines : new Array(texts.length).fill('');
}
// ai: the connection chosen for translation, else Meatball's reader connection, else the main one. One call per batch.
async function viaAI(texts, terms, lang) {
    const C = ctx(), pid = settings().profile || cfg().profile, sys = aiSystem(lang, terms);
    let text;
    if (pid && C.ConnectionManagerRequestService) {
        const r = await C.ConnectionManagerRequestService.sendRequest(pid, [{ role: 'system', content: sys }, { role: 'user', content: pack(texts) }], 3000, { stream: false, extractData: true, includePreset: false, includeInstruct: false });
        text = String(r?.content ?? r ?? '');
    } else text = String(await C.generateRaw({ prompt: `${sys}\n\n${pack(texts)}`, responseLength: 3000 }) ?? '');
    if (!text.trim()) throw new Error('AI 답이 비었어요');
    return unpack(text, texts.length);
}

// ── names and places Meatball knows (for the category switches) ──
function known() {
    const names = new Set(), places = new Set();
    try {
        const S = engine?.states?.() ?? {};
        for (const n of S.scene?.with ?? []) names.add(n);
        for (const p of String(S.scene?.loc ?? '').split('>')) if (p.trim()) places.add(p.trim());
        for (const t of S.scene?.trail ?? []) for (const p of String(t.loc ?? '').split('>')) if (p.trim()) places.add(p.trim());
        for (const n of Object.keys(S.people?.list ?? {})) names.add(n);
        for (const n of Object.keys(S.look?.who ?? {})) names.add(n);
        for (const k of Object.keys(S.bonds?.pairs ?? {})) for (const n of k.split(' & ')) names.add(n);
        const nm = ctx(); if (nm.name1) names.add(nm.name1); if (nm.name2) names.add(nm.name2);
    } catch (e) { /* categories fall back to the shape of the text */ }
    return { names, places };
}

// ── apply to the page: from the dictionary only; what is missing is queued and painted when it arrives ──
function textNodes(root) {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    while (w.nextNode()) out.push(w.currentNode);
    return out;
}
export function apply(root, eng = null) {
    if (eng) engine = eng;
    if (modeOf(cfg()) === 'off' || !root) return;
    const t = tr(), s = settings(), L = gloss(), K = known(), seen = [];
    for (const n of textNodes(root)) {
        const rec = src.get(n), from = rec && rec.to === n.nodeValue ? rec.from : n.nodeValue;
        const mark = n.parentElement?.closest('[data-trc]')?.dataset.trc ?? '';
        const c = category(from, { mark, names: K.names, places: K.places });
        seen.push({ s: from.trim(), c });
        if (!s.cats[c]) { if (rec && n.nodeValue !== from) n.nodeValue = from; continue; }   // category switched off: show the original
        const to = lookup(from, t.dict, L, s.lang);
        if (to !== n.nodeValue) { n.nodeValue = to; if (to !== from) { src.set(n, { from, to }); n.parentElement?.title || n.parentElement?.setAttribute('title', from.trim()); } }
    }
    t.scan(seen);
}
export function repaint() { if (modeOf(cfg()) === 'off') return; for (const el of document.querySelectorAll(ROOTS)) apply(el); }
export function onScreen() { const all = new Set(); for (const el of document.querySelectorAll(ROOTS)) for (const n of textNodes(el)) all.add((src.get(n)?.from ?? n.nodeValue).trim()); return all; }

// ── actions from the settings screen ──
export const redo = (opts) => tr().redo(opts);
export function setOne(from, to) { tr().dict.put(from, to || from, tr().dict.get(from)?.c ?? 'phrase', true); persist(); }
export function dropOne(from) { tr().dict.drop(from); persist(); }
export function clearAll() { const n = tr().dict.clear(); persist(); return n; }
export function tidy() { const n = tr().dict.prune(onScreen()); persist(); return n; }
function persist() { const st = store(true); if (st) st.tr = tr().dict.D; saveChat(); repaint(); }
export function addGloss(from, to, where = 'chat') {
    from = String(from ?? '').trim().slice(0, 60); to = String(to ?? '').trim().slice(0, 60);
    if (!from || !to) return false;
    if (where === 'all') { (settings().glossary ??= []).push({ from, to }); saveCfg(); }
    else { const st = store(true); (st.gloss ??= []).push({ from, to }); saveChat(); }
    repaint(); return true;
}
export function delGloss(where, i) {
    const list = where === 'all' ? settings().glossary : store(false)?.gloss;
    if (!Array.isArray(list) || !list[i]) return;
    list.splice(i, 1); where === 'all' ? saveCfg() : saveChat(); repaint();
}
export const glossLists = () => ({ chat: [...chatGloss()], all: [...(settings().glossary ?? [])] });
export { CATS, needs };
