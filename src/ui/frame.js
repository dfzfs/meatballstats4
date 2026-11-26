// What is visible in the chat itself: a slim status strip above the input box, and small labels under each
// reply showing what was written down for it. Fetched with the first app that is switched on, removed with the last.
// Message text is never touched: labels are our own element next to it.
import { cfg } from '../st/host.js';
import { esc } from '../core/text.js';

let E = null, watcher = null, timer = null;
const later = () => { clearTimeout(timer); timer = setTimeout(draw, 120); };
const open = (view) => document.dispatchEvent(new CustomEvent('mb4:open', { detail: { view } }));

function strip() {
    let el = document.getElementById('mb4-hud');
    const on = cfg().hud !== false && !E.paused();
    if (!on) { el?.remove(); return; }
    const pills = [];
    const S = E.states();
    for (const app of E.reg.list()) {
        if (!app.hud) continue;
        try { for (const t of app.hud(S[app.id], E.envOf(app.id)) ?? []) if (t) pills.push(`<button class="mb4-h" data-view="app:${app.id}">${esc(t)}</button>`); } catch (e) { /* optional */ }
    }
    const html = `<button class="mb4-h mb4-h-home" data-view="home" aria-label="미트볼 열기">😼</button>${pills.join('')}${E.busy ? '<span class="mb4-h mb4-h-busy">읽는 중…</span>' : ''}`;
    if (!el) {
        const anchor = document.getElementById('form_sheld') ?? document.getElementById('send_form');
        if (!anchor?.parentElement) return;
        el = document.createElement('div');
        el.id = 'mb4-hud';
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) open(b.dataset.view); });
        anchor.parentElement.insertBefore(el, anchor);
    }
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}

function labels() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    const on = cfg().chips !== false;
    const byIndex = on ? new Map(E.log().map((e) => [e.i, e])) : new Map();
    for (const mes of chat.querySelectorAll('.mes[mesid]')) {
        const entry = byIndex.get(Number(mes.getAttribute('mesid')));
        let box = mes.querySelector(':scope .mb4-msg');
        const chips = entry ? E.chips(entry) : [];
        const html = chips.map((c, n) => `<span class="mb4-mc${chips.length > 5 && n >= 4 ? ' mb4-mc-x' : ''}">${esc(c.text)}</span>`).join('') + (chips.length > 5 ? `<span class="mb4-mc mb4-mc-more" role="button">+${chips.length - 4}</span>` : '') + (entry?.fail ? '<span class="mb4-mc mb4-mc-warn">⚠ 못 읽음</span>' : '');
        if (!html) { box?.remove(); continue; }
        if (!box) {
            const host = mes.querySelector('.mes_block') ?? mes;
            box = document.createElement('div');
            box.className = 'mb4-msg';
            box.addEventListener('click', (e) => { if (e.target.closest('.mb4-mc-more')) { box.classList.toggle('mb4-msg-open'); return; } open('app:record'); });
            host.append(box);
        }
        if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    }
}

export function draw() {
    if (!E) return;
    try { strip(); labels(); } catch (e) { console.warn('[meatball] strip', e); }
    // 🌐 screen translation of the strip and the labels (never the reply text itself); fetched only when picked
    const m = cfg().tr?.mode;
    if (m === 'free' || m === 'ai') import('../st/tr.js').then((T) => { const h = document.getElementById('mb4-hud'); if (h) T.apply(h, E); document.querySelectorAll('.mb4-msg').forEach((b) => T.apply(b, E)); }).catch(() => {});
}

export function mount(engine) {
    E = engine;
    if (!watcher) {
        document.addEventListener('mb4:update', later);
        const chat = document.getElementById('chat');
        if (chat && typeof MutationObserver !== 'undefined') {
            // other tools and the application itself add, remove and re-render messages: redraw our labels after them
            watcher = new MutationObserver((list) => { if (list.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && !n.classList?.contains('mb4-msg')))) later(); });
            watcher.observe(chat, { childList: true });
        } else watcher = { disconnect() {} };
    }
    draw();
}
export function unmount() {
    document.removeEventListener('mb4:update', later);
    watcher?.disconnect(); watcher = null;
    clearTimeout(timer);
    document.getElementById('mb4-hud')?.remove();
    document.querySelectorAll('.mb4-msg').forEach((el) => el.remove());
    E = null;
}
