// Small building blocks every app screen and widget shares, so the phone looks like one thing.
import { esc, hash } from '../core/text.js';
export { esc };

const FACES = ['🙂', '😊', '😌', '🧐', '😎', '🤔', '😶', '🥰', '😏', '🫡', '🤓', '😇'];
// The same name always gets the same face.
// A face someone picked in 👥 인물 wins; the phone hands this chat's picks over before it draws (setFaces).
const CHOSEN = new Map();
export const setFaces = (map) => { CHOSEN.clear(); for (const [n, e] of Object.entries(map && typeof map === 'object' ? map : {})) if (n && typeof e === 'string' && e.trim()) CHOSEN.set(n, e.trim().slice(0, 8)); };
export const face = (name) => CHOSEN.get(String(name ?? '')) ?? FACES[parseInt(hash(String(name ?? '')), 36) % FACES.length];
// emoji offered when picking a face (any other can be typed)
export const FACE_PICKS = ['🙂', '😊', '😎', '🤓', '😏', '🥰', '😇', '🤔', '😶', '😤', '🥺', '😴', '🤠', '👻', '🐱', '🐶', '🦊', '🐻', '🐰', '🐼', '🐯', '🦁', '🐸', '🐧', '🌸', '⭐', '🔥', '🍀'];

export const pill = (text, tone = '') => `<span class="mb4-pill ${tone}">${esc(text)}</span>`;
export const bar = (pct, tone = '') => `<span class="mb4-meter"><i class="${tone}" style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></i></span>`;
export const row = (icon, label, value) => `<div class="mb4-row"><span class="mb4-row-k">${icon} ${esc(label)}</span><span class="mb4-row-v">${value}</span></div>`;
export const card = (title, body, tone = '') => `<section class="mb4-card ${tone}">${title ? `<h5 class="mb4-card-h">${title}</h5>` : ''}${body}</section>`;
export const empty = (icon, title, sub = '') => `<div class="mb4-empty"><div class="mb4-empty-ico">${icon}</div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
export const hint = (text) => `<p class="mb4-hint">${esc(text)}</p>`;
export const person = (name, sub = '', right = '') => `<div class="mb4-person"><span class="mb4-face">${face(name)}</span><span class="mb4-person-t"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${right}</div>`;
// Steps of a ladder, filled up to `at`.
export const steps = (labels, at) => `<div class="mb4-steps">${labels.map((w, n) => `<span class="mb4-step${n <= at ? ' on' : ''}">${esc(w)}</span>`).join('')}</div>`;
// A ring showing a percentage.
export const ring = (pct, label = '') => `<div class="mb4-ring" style="--p:${Math.max(0, Math.min(100, Math.round(pct)))}"><b>${Math.round(pct)}%</b>${label ? `<small>${esc(label)}</small>` : ''}</div>`;

// Wire every [data-act] inside el to a handler table: { name(value, element) }.
export function acts(el, table) {
    el.querySelectorAll('[data-act]').forEach((b) => {
        const fn = table[b.dataset.act];
        if (!fn) return;
        b.addEventListener(b.matches('input, textarea, select') ? 'change' : 'click', (e) => { e.stopPropagation(); fn(b.dataset.v ?? b.value, b); });
    });
}
export const val = (el, sel) => String(el.querySelector(sel)?.value ?? '').trim();

// Words for the time of day, and the innermost part of a place ("town > inn > kitchen" -> "kitchen").
export const TOD = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'midnight'];
export const TOD_KO = { dawn: '새벽', morning: '아침', noon: '낮', afternoon: '오후', evening: '저녁', night: '밤', midnight: '한밤' };
export const room = (loc) => String(loc ?? '').split('>').map((x) => x.trim()).filter(Boolean).at(-1) ?? '';

// ✏️ One «직접 고치기» card for an app's own saved items. rows: [{ name, i, label, value, rows?, del? }]; extra: html
// placed under the rows (an add form, buttons). Wire with editors(el, { name: { save(i, text), del(i) } }, after).
export const editCard = (rows, extra = '', title = '') => `<details class="mb4-card mb4-edcard"><summary>✏️ 직접 고치기${title ? ` <small>${esc(title)}</small>` : ''}</summary>
    ${rows.map((r) => `<div class="mb4-edrow"><small>${esc(r.label ?? '')}</small><textarea class="mb4-input" rows="${r.rows ?? 1}" data-edv="${esc(`${r.name}|${r.i}`)}">${esc(r.value ?? '')}</textarea><div class="mb4-btnrow tight"><button class="mb4-btn sm" data-eds="${esc(`${r.name}|${r.i}`)}">저장</button>${r.del === false ? '' : `<button class="mb4-btn ghost sm" data-edd="${esc(`${r.name}|${r.i}`)}">🗑 지우기</button>`}</div></div>`).join('') || (extra ? '' : '<p class="mb4-hint">고칠 게 아직 없어요.</p>')}${extra}</details>`;
export function editors(el, table, after = () => {}) {
    el.querySelectorAll('[data-eds],[data-edd]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = b.dataset.eds ?? b.dataset.edd, cut = key.lastIndexOf('|'), name = key.slice(0, cut), i = key.slice(cut + 1), h = table[name];
        if (!h) return;
        const n = /^-?\d+$/.test(i) ? +i : i;
        if (b.dataset.eds != null) h.save?.(n, String([...el.querySelectorAll('[data-edv]')].find((x) => x.dataset.edv === key)?.value ?? '').trim());
        else h.del?.(n);
        after();
    }));
}

// ── option lists the person can change: built-ins can be renamed, re-described or hidden; new ones added ──
// Saved in the app's cfg (every chat). An item: { id, icon, name, ai } — `ai` is what the AI is told for it.
export function optList(cfg, key, defaults) {
    const c = ((cfg.opts ??= {})[key] ??= { edit: {}, hide: {}, add: [] });
    c.edit ??= {}; c.hide ??= {}; c.add ??= [];
    const out = defaults.filter((d) => !c.hide[d.id]).map((d) => ({ ...d, ...(c.edit[d.id] ?? {}) }));
    for (const a of c.add) if (a?.id && a?.name) out.push({ ...a, custom: true });
    return out;
}
// The editing card for one list. fields: which of icon / name / ai are shown; aiLabel: what the AI text is for.
export function optCard(cfg, key, defaults, { title = '고르는 것', fields = ['icon', 'name', 'ai'], aiLabel = 'AI에게 하는 설명 (영어로 쓰면 더 잘 알아들어요)' } = {}) {
    const c = ((cfg.opts ??= {})[key] ??= { edit: {}, hide: {}, add: [] });
    c.edit ??= {}; c.hide ??= {}; c.add ??= [];
    const box = (it, custom) => {
        const v = custom ? it : { ...it, ...(c.edit[it.id] ?? {}) }, hidden = !custom && c.hide[it.id], k = `${key}|${it.id}`;
        return `<div class="mb4-edrow${hidden ? ' mb4-dimrow' : ''}">
            <div class="mb4-btnrow tight">${fields.includes('icon') ? `<input class="mb4-input mb4-icoin" data-opt="${esc(k)}" data-of="icon" maxlength="4" value="${esc(v.icon ?? '')}">` : ''}${fields.includes('name') ? `<input class="mb4-input" data-opt="${esc(k)}" data-of="name" maxlength="60" value="${esc(v.name ?? '')}">` : ''}</div>
            ${fields.includes('ai') ? `<textarea class="mb4-input" rows="2" data-opt="${esc(k)}" data-of="ai" maxlength="400" placeholder="${esc(aiLabel)}">${esc(v.ai ?? '')}</textarea>` : ''}
            <div class="mb4-btnrow tight"><button class="mb4-btn sm" data-opts="${esc(k)}">저장</button>${custom ? `<button class="mb4-btn ghost sm" data-optd="${esc(k)}">🗑 지우기</button>` : `<button class="mb4-btn ghost sm" data-opth="${esc(k)}">${hidden ? '👁 다시 보이기' : '🙈 숨기기'}</button>${c.edit[it.id] ? `<button class="mb4-btn ghost sm" data-optr="${esc(k)}">↩ 원래대로</button>` : ''}`}</div></div>`;
    };
    return `<details class="mb4-card mb4-edcard"><summary>✏️ ${esc(title)} 고치기 · 더하기</summary>
        ${defaults.map((d) => box(d, false)).join('')}${c.add.map((a) => box(a, true)).join('')}
        <div class="mb4-edrow"><small>＋ 새로 더하기</small><div class="mb4-btnrow tight">${fields.includes('icon') ? `<input class="mb4-input mb4-icoin" data-optn="${esc(key)}" data-of="icon" maxlength="4" placeholder="🙂">` : ''}<input class="mb4-input" data-optn="${esc(key)}" data-of="name" maxlength="60" placeholder="이름"></div>
            ${fields.includes('ai') ? `<textarea class="mb4-input" rows="2" data-optn="${esc(key)}" data-of="ai" maxlength="400" placeholder="${esc(aiLabel)}"></textarea>` : ''}
            <div class="mb4-btnrow tight"><button class="mb4-btn sm" data-opta="${esc(key)}">＋ 더하기</button></div></div></details>`;
}
export function optWire(el, cfg, save) {
    const C = (key) => { const c = ((cfg.opts ??= {})[key] ??= { edit: {}, hide: {}, add: [] }); c.edit ??= {}; c.hide ??= {}; c.add ??= []; return c; };
    const split = (k) => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; };
    const read = (sel) => { const o = {}; el.querySelectorAll(sel).forEach((x) => { o[x.dataset.of] = x.value.trim(); }); return o; };
    const on = (attr, fn) => el.querySelectorAll(`[${attr}]`).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); fn(b.getAttribute(attr)); save(); }));
    on('data-opts', (k) => { const [key, id] = split(k), c = C(key), v = read(`[data-opt="${CSS.escape(k)}"]`), a = c.add.find((x) => x.id === id); if (a) Object.assign(a, v); else c.edit[id] = { ...(c.edit[id] ?? {}), ...v }; });
    on('data-opth', (k) => { const [key, id] = split(k), c = C(key); c.hide[id] = !c.hide[id]; });
    on('data-optr', (k) => { const [key, id] = split(k); delete C(key).edit[id]; });
    on('data-optd', (k) => { const [key, id] = split(k), c = C(key); c.add = c.add.filter((x) => x.id !== id); });
    on('data-opta', (key) => { const v = read(`[data-optn="${CSS.escape(key)}"]`); if (!v.name) return; C(key).add.push({ id: `my${Date.now().toString(36)}`, icon: v.icon || '✨', name: v.name, ai: v.ai || v.name }); });
}

// ✏️ The common «직접 고치기» card for what an app has kept, added to the end of el and wired in one call.
// groups: { name, list, label(x, i), get(x) -> text, set(x, text, i) -> new item | undefined, max, rows, del }
//       | { name, obj, keys: [[key, label, rows?]], num?: true }   (single values; emptying a field clears it)
export function editMore(el, api, groups, title = '') {
    const rows = [], table = {};
    for (const g of groups) {
        if (!g) continue;
        if (g.obj) {
            for (const [key, label, r] of g.keys) rows.push({ name: g.name, i: key, label, value: g.obj[key] ?? '', rows: r ?? 1, del: false });
            table[g.name] = { save: (key, t) => { if (t === '') delete g.obj[key]; else g.obj[key] = g.num ? (Number.isFinite(+t) ? +t : g.obj[key]) : t; } };
            continue;
        }
        const L = g.list;
        if (!Array.isArray(L) || !L.length) continue;
        const from = Math.max(0, L.length - (g.max ?? 20));
        for (let i = L.length - 1; i >= from; i--) { const x = L[i]; if (x == null) continue; rows.push({ name: g.name, i, label: g.label?.(x, i) ?? '', value: g.get ? g.get(x) : String(x), rows: g.rows ?? 1, del: g.del ?? (g.remove ? true : undefined) }); }
        table[g.name] = {
            save: (i, t) => { if (!t || L[i] == null) return; if (g.set) { const r = g.set(L[i], t, i); if (r !== undefined) L[i] = r; } else L[i] = t; },
            del: (i) => { if (L[i] == null) return; if (g.remove) g.remove(L[i], i); else L.splice(i, 1); },
        };
    }
    el.insertAdjacentHTML('beforeend', editCard(rows, '', title));
    editors(el.lastElementChild, table, () => { api.save(); api.redraw(); });
}
// "앞 | 뒤" split for items with two parts
export const two = (t) => { const i = String(t).indexOf('|'); return i < 0 ? [String(t).trim(), ''] : [t.slice(0, i).trim(), t.slice(i + 1).trim()]; };

// 💞 How close someone is to the person's own character, from what 💞 관계 · 💗 호감 already keep (0 when both are off).
// Used to put the closest people first and fold away the rest.
export function closeness(bonds, heart, me) {
    const pairs = Object.values(bonds?.pairs ?? {});
    return (n) => {
        const p = pairs.find((x) => (x.a === n && x.b === me) || (x.b === n && x.a === me));
        const h = heart?.d?.[`${n}>${me}`];
        return (Number(h?.a) || 0) + (Number(p?.lvl) || 0) * 20 + (p?.moves?.length ?? 0) * 2 + (p?.tie ? 5 : 0);
    };
}
// The first `keep` rows as they are, the rest folded under «나머지 n명».
export const foldRest = (rows, keep = 8) => (rows.length <= keep ? rows.join('') : `${rows.slice(0, keep).join('')}<details class="mb4-more"><summary>나머지 ${rows.length - keep}명</summary>${rows.slice(keep).join('')}</details>`);

// 💗 Who is worth listing: someone in the scene now, someone the caller keeps (`keep`), or someone whose 애정 toward
// the person's character has reached the bar set in 💗 호감 (default 30; scores start at 20). The rest are folded.
// Returns null when 💗 호감 is off (no score to go by).
export const SHOW_AT = 30;
export function byHeart(names, heart, me, here = [], at = SHOW_AT, keep = () => false) {
    if (!heart?.d) return null;
    if (at <= 20) return { shown: names, rest: [] };   // «모두»
    const ok = (n) => here.includes(n) || keep(n) || (Number(heart.d[`${n}>${me}`]?.a) || 0) >= at;
    return { shown: names.filter(ok), rest: names.filter((n) => !ok(n)) };
}
export const foldUnder = (shown, rest, at = SHOW_AT) => `${shown.join('')}${rest.length ? `<details class="mb4-more"><summary>애정 ${at} 아래 ${rest.length}명</summary>${rest.join('')}</details>` : ''}`;
