// 🎨 The phone's look, laid on the page too: the status strip above the input box and the labels under replies
// take the same theme colour, font and light / night as the phone. Screen only; nothing is sent anywhere.
// Small on purpose (it runs at start): a font file is fetched only when that font is picked.
import { cfg } from './host.js';

export const ACCENTS = [['', '코랄', '#e2725b'], ['pink', '분홍', '#e0567f'], ['violet', '보라', '#7c5cff'], ['blue', '파랑', '#3a8ee6'], ['green', '초록', '#2f9e7a'], ['ink', '먹색', '#3d3a4b']];
export const BUILTIN_FONTS = [
    { id: '', name: '기본', family: '' },
    { id: 'dahyeon', name: '온글잎 박다현체', family: "'OngleipParkDahyeon'", url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2411-3@1.0/Ownglyph_ParkDaHyun.woff2' },
];
const safeUrl = (u) => (/^https:\/\/[^\s"'()\\<>]+$/i.test(String(u ?? '').trim()) ? String(u).trim() : '');
const safeName = (n) => String(n ?? '').replace(/["'\\<>;{}]/g, '').trim().slice(0, 40);
// every font the person can pick: the built-in ones, then the ones they added (a file address, or a font already on the computer)
export function fonts() {
    const mine = (Array.isArray(cfg().look?.fonts) ? cfg().look.fonts : []).filter((f) => f?.id && safeName(f.name)).map((f) => {
        const url = safeUrl(f.url);
        return { id: f.id, name: safeName(f.name), url, family: url ? `'mb4f-${f.id}'` : `'${safeName(f.name)}'`, mine: true };
    });
    return [...BUILTIN_FONTS, ...mine];
}
// the stored value is a font id; older settings kept a CSS family — anything unknown falls back to 기본
export const fontOf = (id) => fonts().find((f) => f.id === (id ?? '')) ?? fonts().find((f) => f.family && String(id ?? '').includes(f.family)) ?? BUILTIN_FONTS[0];
const fmt = (u) => (/\.woff2(\?|$)/i.test(u) ? 'woff2' : /\.woff(\?|$)/i.test(u) ? 'woff' : /\.otf(\?|$)/i.test(u) ? 'opentype' : 'truetype');
export const faceCss = (f) => (f?.url ? `@font-face{font-family:${f.family};src:url("${f.url}") format('${fmt(f.url)}');font-display:swap}` : '');
// load these fonts' files (only those asked for)
export function loadFonts(list) {
    let el = document.getElementById('mb4-fonts');
    const css = list.map(faceCss).filter(Boolean).join('\n');
    if (!css) { el?.remove(); return; }
    if (!el) { el = document.createElement('style'); el.id = 'mb4-fonts'; document.head.append(el); }
    if (el.textContent !== css) el.textContent = css;
}
export const isDark = (L = cfg().look ?? {}) => L.mode === 'dark' || (L.mode !== 'light' && L.wall === 'night');
export function paint() {
    const L = cfg().look ?? {}, acc = ACCENTS.find((a) => a[0] === (L.accent ?? '')) ?? (/^#[0-9a-f]{6}$/i.test(L.accent ?? '') ? [L.accent, '내 색', L.accent] : ACCENTS[0]), f = fontOf(L.font), r = document.documentElement;
    r.style.setProperty('--mb4-a', acc[2]);
    if (f.family) r.style.setProperty('--mb4-font', `${f.family}, sans-serif`); else r.style.removeProperty('--mb4-font');
    r.classList.toggle('mb4-night', isDark(L));
    loadFonts(f.url ? [f] : []);
    return { acc, font: f };
}
