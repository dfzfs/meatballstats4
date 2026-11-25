// Small building blocks every app screen and widget shares, so the phone looks like one thing.
import { esc, hash } from '../core/text.js';
export { esc };

const FACES = ['🙂', '😊', '😌', '🧐', '😎', '🤔', '😶', '🥰', '😏', '🫡', '🤓', '😇'];
// The same name always gets the same face.
export const face = (name) => FACES[parseInt(hash(String(name ?? '')), 36) % FACES.length];

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
