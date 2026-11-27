// The phone: home (a feed of what every app has to show), market, first question, settings, and the frame
// each app draws into. Imported, with its stylesheet, the first time the person opens it.
import { ctx, cfg, saveCfg, store, saveChat, hasChat, profiles, names, toast, VERSION } from '../st/host.js';
import { BUILTIN, PRESETS, COST, SHELVES, entryOf, homeOf } from '../apps/catalog.js';
import { esc } from '../core/text.js';
import * as kit from './kit.js';
import { ACCENTS, fonts, fontOf, loadFonts, paint, isDark } from '../st/look.js';
import { trCfg, CATS as TR_CATS, ENGINES as TR_ENGINES, LANGS as TR_LANGS } from '../core/tr.js';
import { dayKo, startMs, dayOn, dayDate, utc } from '../core/clock.js';
const { TOD_KO, room } = kit;

let R = null;                 // the runtime (engine + app switches)
let fixDraw = 0;              // several corrections in one tap: one redraw
let undo = null;              // 💾 what a restore replaced (this session only)
let root = null, view = 'home', timer = null, cssReady = null;
const $ = (sel) => root.querySelector(sel);
const meta = (id) => BUILTIN.find((a) => a.id === id) ?? R.externals().find((a) => a.id === id) ?? R.engine.reg.get(id);
const badge = (cost) => `<span class="mb4-badge ${cost ?? 'low'}">${COST[cost] ?? COST.low}</span>`;
const icon = (a, cls = '') => `<span class="mb4-app-ico ${cls}" style="--c:${esc(a?.color ?? '#8d99ae')}">${a?.icon ?? '📦'}</span>`;

function css() {
    return (cssReady ??= new Promise((ok) => {
        const l = Object.assign(document.createElement('link'), { id: 'mb4-phone-css', rel: 'stylesheet', href: new URL(`../../phone.css?v=${VERSION}`, import.meta.url).href });
        l.onload = l.onerror = () => ok();
        document.head.append(l);
    }));
}
export async function open(runtime, to = '') {
    R = runtime;
    await css();
    if (!root) build();
    root.classList.toggle('mb4-left', cfg().side === 'left');
    root.classList.add('mb4-open');
    applyLook();
    dock();
    go(!cfg().asked ? 'ask' : to || 'home');
}
export function close() { root?.classList.remove('mb4-open'); undock(); }


// ── 🎨 looks: wallpaper, accent colour, light / night, font. Screen only: nothing is sent anywhere. ──
// A photo wallpaper is kept in the browser's own storage (not in the settings file), shrunk to at most 900px.
export const WALLS = [
    ['', '기본', '', ''],
    ['cream', '크림', 'linear-gradient(165deg,#fff6ea 0%,#fde4dc 55%,#eef0e4 100%)', '#fdeee4'],
    ['peach', '복숭아', 'linear-gradient(170deg,#ffe0cc 0%,#ffbfa8 45%,#f2a6a6 100%)', '#ffd2bd'],
    ['lilac', '라벤더 노을', 'linear-gradient(180deg,#d8c4e6 0%,#f6c6d9 55%,#c9dcf5 100%)', '#e6c8e0'],
    ['sky', '하늘', 'linear-gradient(180deg,#b9dcff 0%,#d9eef7 50%,#fff8ec 100%)', '#cfe6fb'],
    ['mint', '민트', 'linear-gradient(160deg,#e3f5e6 0%,#c4e8cf 50%,#fbf8e8 100%)', '#d6efdc'],
    ['night', '밤', 'linear-gradient(180deg,#25253f 0%,#4b4e6d 55%,#9a8c98 100%)', '#34344f'],
];
const WALL_KEY = 'meatball4-wall';
let wallUrl = null, wallLoading = null;
const lf = () => globalThis.SillyTavern?.libs?.localforage ?? null;
const looks = () => (cfg().look ??= {});
function wallLoad() {
    return (wallLoading ??= (async () => { try { wallUrl = (await lf()?.getItem(WALL_KEY)) ?? ''; } catch (e) { wallUrl = ''; } return wallUrl; })());
}
async function wallSave(data) {
    const db = lf();
    if (db) { try { await db.setItem(WALL_KEY, data); wallUrl = data; looks().wall = 'img'; saveCfg(); return true; } catch (e) { /* fall through */ } }
    toast('이 브라우저는 사진을 저장할 곳이 없어요. 그라데이션 배경을 써 주세요.', 'warning'); return false;
}
function tintOf(url) {
    return new Promise((ok) => {
        const img = new Image();
        img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4, h = (x) => Math.round(x / n).toString(16).padStart(2, '0'); ok(`#${h(r)}${h(gg)}${h(b)}`); } catch (e) { ok(''); } };
        img.onerror = () => ok('');
        img.src = url;
    });
}
function shrink(file, max = 900) {
    return new Promise((ok, no) => {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85)); };
        img.onerror = () => { URL.revokeObjectURL(url); no(new Error('not an image')); };
        img.src = url;
    });
}
export function applyLook() {
    if (!root) return;
    const L = looks(), { acc, font } = paint();   // the strip above the input box and the labels follow too
    root.classList.toggle('mb4-dark', isDark(L));
    root.style.setProperty('--a', acc[2]);
    root.style.setProperty('--a-soft', `${acc[2]}24`);
    root.style.fontFamily = font.family ? `${font.family}, sans-serif` : '';
    const wall = WALLS.find((w) => w[0] === L.wall);
    let bg = wall?.[2] ?? '';
    const tint = L.wall === 'img' ? L.tint : wall?.[3];
    if (tint && /^#[0-9a-f]{6}$/i.test(tint)) root.style.setProperty('--wall', tint); else root.style.removeProperty('--wall');
    if (L.wall === 'img') { if (wallUrl == null) { wallLoad().then(() => applyLook()); bg = ''; } else bg = wallUrl ? `url("${wallUrl}") center/cover no-repeat` : ''; }
    root.style.background = bg;
    root.classList.toggle('mb4-photo', L.wall === 'img' && !!wallUrl);
}
function drawLook(body) {
    const L = looks(), F = fonts(), cur = fontOf(L.font);
    loadFonts(F.filter((f) => f.url));   // show every font in its own face while choosing
    const thumb = (bg) => (bg ? `style="background:${bg}"` : '');
    body.innerHTML = `${kit.card('🖼 배경화면', `<div class="mb4-walls">${WALLS.map(([id, n, bg]) => `<button class="mb4-wall${(L.wall ?? '') === id ? ' on' : ''}" data-wall="${id}" ${thumb(bg || 'linear-gradient(160deg,#fff8f1,#ffe9e1)')}><span>${n}</span></button>`).join('')}
            <label class="mb4-wall up${L.wall === 'img' ? ' on' : ''}" ${wallUrl ? `style="background:url('${wallUrl}') center/cover"` : ''}><span>🖼 내 사진</span><input type="file" accept="image/*" data-photo hidden></label></div>
            ${kit.hint('사진은 이 브라우저 안에만 저장돼요(설정 파일에 안 들어가요). 크면 저절로 줄여요.')}`)}
        ${kit.card('🎨 테마 색', `<div class="mb4-chips">${ACCENTS.map(([id, n, c]) => `<button class="mb4-opt${(L.accent ?? '') === id ? ' on' : ''}" data-accent="${id}"><i class="mb4-dot" style="background:${c}"></i> ${n}</button>`).join('')}<label class="mb4-opt${/^#/.test(L.accent ?? '') ? ' on' : ''}"><i class="mb4-dot" style="background:${/^#[0-9a-f]{6}$/i.test(L.accent ?? '') ? L.accent : '#888888'}"></i> 내 색<input type="color" data-accentpick value="${/^#[0-9a-f]{6}$/i.test(L.accent ?? '') ? L.accent : '#e2725b'}" style="width:0;height:0;opacity:0;border:0;padding:0"></label></div>`)}
        ${kit.card('🌗 밝기', `<div class="mb4-seg">${[['', '배경 따라'], ['light', '밝게'], ['dark', '어둡게']].map(([id, n]) => `<button class="${(L.mode ?? '') === id ? 'on' : ''}" data-mode="${id}">${n}</button>`).join('')}</div>`)}
        ${kit.card('🔤 글꼴', `<div class="mb4-chips">${F.map((f) => `<button class="mb4-opt${cur.id === f.id ? ' on' : ''}" data-font="${esc(f.id)}" style="font-family:${f.family ? esc(f.family) : 'inherit'}">${esc(f.name)}${f.mine ? ` <i class="mb4-x" data-fontdel="${esc(f.id)}" role="button" aria-label="빼기">✕</i>` : ''}</button>`).join('')}</div>
            <details class="mb4-fontadd"><summary class="mb4-hint">＋ 글꼴 더하기</summary>
                <input class="mb4-input" data-fn maxlength="40" placeholder="이름 (컴퓨터에 깔린 글꼴이면 그 이름 그대로)">
                <input class="mb4-input" data-fu maxlength="300" placeholder="글꼴 파일 주소 https://….woff2 (깔린 글꼴이면 비워요)">
                <div class="mb4-btnrow"><button class="mb4-btn sm" data-fontadd>더하기</button></div>
                ${kit.hint('눈누 같은 곳의 @font-face 안 url(…) 주소를 넣으면 돼요. 고른 글꼴은 입력창 위 상태 줄 · 답 밑 딱지에도 써요.')}</details>`)}
        <button class="mb4-btn ghost wide" data-lookreset>처음대로 되돌리기</button>
        ${kit.hint('폰 모양만 바뀌어요. AI에 보내는 건 없어요.')}`;
    const set = (k, v) => { looks()[k] = v; saveCfg(); applyLook(); draw(true); };
    body.querySelectorAll('[data-wall]').forEach((b) => b.addEventListener('click', () => set('wall', b.dataset.wall)));
    body.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => set('accent', b.dataset.accent)));
    body.querySelector('[data-accentpick]')?.addEventListener('change', (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) set('accent', e.target.value.toLowerCase()); });
    body.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => set('mode', b.dataset.mode)));
    body.querySelectorAll('[data-font]').forEach((b) => b.addEventListener('click', (e) => { if (e.target.closest('[data-fontdel]')) return; set('font', b.dataset.font); }));
    body.querySelectorAll('[data-fontdel]').forEach((x) => x.addEventListener('click', (e) => { e.stopPropagation(); const L2 = looks(); L2.fonts = (L2.fonts ?? []).filter((f) => f.id !== x.dataset.fontdel); if (L2.font === x.dataset.fontdel) L2.font = ''; saveCfg(); applyLook(); draw(true); }));
    body.querySelector('[data-fontadd]')?.addEventListener('click', () => {
        const name = String(body.querySelector('[data-fn]').value).trim(), url = String(body.querySelector('[data-fu]').value).trim();
        if (!name) { toast('이름을 적어 주세요.', 'warning'); return; }
        if (url && !/^https:\/\/[^\s"'()\\<>]+$/i.test(url)) { toast('https:// 로 시작하는 글꼴 파일 주소를 넣어 주세요.', 'warning'); return; }
        const L2 = looks(), id = `my${Date.now().toString(36)}`;
        (L2.fonts ??= []).push({ id, name: name.slice(0, 40), url }); L2.font = id; saveCfg(); applyLook(); draw(true); toast('글꼴을 더했어요.');
    });
    body.querySelector('[data-lookreset]').addEventListener('click', () => { cfg().look = { fonts: looks().fonts ?? [] }; saveCfg(); applyLook(); draw(true); });
    body.querySelector('[data-photo]').addEventListener('change', async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        try { const data = await shrink(f); if (await wallSave(data)) { looks().tint = await tintOf(data); saveCfg(); applyLook(); draw(true); toast('배경화면을 바꿨어요.'); } } catch (x) { toast('그림을 읽지 못했어요.', 'warning'); }
    });
    if (L.wall === 'img' && wallUrl == null) wallLoad().then(() => { if (view === 'look') draw(true); });
}

// ── docking: on a wide screen the phone sits BESIDE the chat instead of over it ──
// The chat column (#sheld) keeps its width when the free space beside it is enough for the phone; otherwise it moves
// over (and narrows only if it must) so the two sit side by side. Narrow screens (phones) keep the phone on top.
// Only our own inline styles are touched, and they are put back exactly when the phone closes.
const PHONE_MIN = 340, NARROW = 760, GAP = 8;
const PHONE_W = { s: 380, m: 440, l: 540 };
const phoneMax = () => PHONE_W[cfg().phoneW] ?? PHONE_W.m;
let saved = null, onResize = null;
function undock() {
    const sh = document.getElementById('sheld');
    if (sh && saved) { sh.style.marginLeft = saved.ml; sh.style.marginRight = saved.mr; sh.style.width = saved.w; sh.style.maxWidth = saved.mw; }
    saved = null;
    if (root) { root.style.width = ''; root.classList.remove('mb4-docked'); }
    if (onResize) { removeEventListener('resize', onResize); onResize = null; }
}
function dock() {
    if (!onResize) { let t = 0; onResize = () => { clearTimeout(t); t = setTimeout(() => { if (root?.classList.contains('mb4-open')) dock(); }, 120); }; addEventListener('resize', onResize); }
    const sh = document.getElementById('sheld');
    if (sh && saved) { sh.style.marginLeft = saved.ml; sh.style.marginRight = saved.mr; sh.style.width = saved.w; sh.style.maxWidth = saved.mw; }
    root.style.width = ''; root.classList.remove('mb4-docked');
    if (!sh || cfg().dock === false || innerWidth < NARROW) return;
    saved ??= { ml: sh.style.marginLeft, mr: sh.style.marginRight, w: sh.style.width, mw: sh.style.maxWidth };
    const left = cfg().side === 'left', r = sh.getBoundingClientRect(), W = innerWidth;
    const free = left ? r.left : W - r.right;
    if (free >= PHONE_MIN + GAP) {   // room already: the phone fills the free strip, the chat does not move
        root.style.width = `${Math.min(phoneMax(), free - GAP)}px`; root.classList.add('mb4-docked'); return;
    }
    const phone = Math.max(PHONE_MIN, Math.min(phoneMax(), Math.round(W * 0.34))), room = W - phone - GAP;
    const w = Math.min(r.width, room);
    if (w < 360) return;            // too tight to sit side by side: stay on top of the chat
    root.style.width = `${phone}px`; root.classList.add('mb4-docked');
    sh.style.width = `${w}px`; sh.style.maxWidth = `${w}px`;
    const m = `${Math.max(0, Math.round((room - w) / 2))}px`;
    if (left) { sh.style.marginLeft = `${phone + GAP + Math.max(0, Math.round((room - w) / 2))}px`; sh.style.marginRight = 'auto'; }
    else { sh.style.marginLeft = m; sh.style.marginRight = 'auto'; }
}

function build() {
    root = document.createElement('div');
    root.id = 'mb4-phone';
    root.className = 'mb4-phone';
    root.innerHTML = '<div class="mb4-top"><button class="mb4-ico" data-back aria-label="뒤로">‹</button><span class="mb4-title"></span><span class="mb4-status" aria-hidden="true"><i class="mb4-sig"></i><i class="mb4-batt"></i></span><button class="mb4-ico" data-more aria-label="더 보기" hidden>⋯</button><button class="mb4-ico" data-close aria-label="닫기">✕</button></div><div class="mb4-body"></div><div class="mb4-menu"><div class="mb4-menu-box"></div></div>';
    document.body.append(root);
    // the phone itself never scrolls (only .mb4-body does): if anything pushes it, put it straight back
    root.addEventListener('scroll', () => { if (root.scrollTop || root.scrollLeft) root.scrollTo(0, 0); });
    $('[data-close]').addEventListener('click', close);
    $('[data-back]').addEventListener('click', back);
    $('[data-more]').addEventListener('click', () => openMenu());
    $('.mb4-menu').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeMenu(); });
    $('.mb4-body').addEventListener('click', (e) => {
        const c = e.target.closest('[data-catch]');
        if (c && root.contains(c)) { e.stopPropagation(); onCatch(c.dataset.catch); return; }
        const b = e.target.closest('[data-go]'); if (b && root.contains(b)) go(b.dataset.go);
    });
    // The ledger changed: redraw, unless the person is typing in this view.
    document.addEventListener('mb4:update', () => {
        if (!root.classList.contains('mb4-open')) return;
        clearTimeout(timer);
        timer = setTimeout(() => { if (!root.contains(document.activeElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) draw(true); }, 150);
    });
}
// An app that lives inside a shelf entry is always shown on that entry's page (alone, or as one of its inner tabs).
const route = (v) => { if (!String(v).startsWith('app:')) return v; const id = v.slice(4), h = homeOf(id); return h ? `page:${h.entry.id}${h.entry.apps.length > 1 ? `:${id}` : ''}` : v; };
function go(v) { const to = route(v), same = to === view; view = to; draw(same); if (!same) $('.mb4-body').scrollTop = 0; }
// ‹ : the app's own step back first (a chat room back to the list), then the page's main app, then home
let backHook = null;
function back() {
    if (backHook) { try { if (backHook() === true) return; } catch (e) { /* fall through */ } }
    if (view === 'tr' || view === 'look') { go('set'); return; }
    if (view.startsWith('page:')) { const [, eid, tab] = view.split(':'), e = entryOf(eid); if (e && !e.front && e.apps.length > 1 && tab && tab !== e.apps[0]) { go(`page:${eid}`); return; } }
    go('home');
}
// ⋯ : what the open app hides (its own extra buttons), then the other parts of the same page
let menuItems = [], pageParts = [];
function closeMenu() { $('.mb4-menu').classList.remove('on'); }
function openMenu() {
    const it = (x, i) => (x.sec != null ? `<div class="mb4-menu-sec">${esc(x.sec)}</div>` : `<button class="mb4-menu-it${x.cur ? ' cur' : ''}" data-mi="${i}" ${x.disabled ? 'disabled' : ''}><i>${x.icon ?? ''}</i><span>${esc(x.label)}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${x.off ? '<b class="mb4-dotoff">꺼짐</b>' : x.cur ? '<b class="mb4-dotoff">✓</b>' : ''}</button>`);
    const all = [...menuItems, ...(pageParts.length ? [{ sec: '같은 곳의 다른 기능' }, ...pageParts] : [])];
    const box = $('.mb4-menu-box');
    box.innerHTML = all.map(it).join('');
    box.querySelectorAll('[data-mi]').forEach((b) => b.addEventListener('click', () => { const x = all[+b.dataset.mi]; closeMenu(); try { x.act?.(); } catch (e) { console.warn('[meatball] menu', e); } }));
    $('.mb4-menu').classList.add('on');
}

const VIEWS = { ask: ['', drawAsk], home: ['', drawHome], market: ['🛍 마켓', drawMarket], set: ['⚙️ 설정', drawSet], tr: ['🌐 번역 · 용어집', drawTr], look: ['🎨 꾸미기', drawLook] };
function draw(keepScroll = false) {
    try { kit.setFaces(R.engine?.reg?.has('people') ? store()?.apps?.people?.faces : null); } catch (e) { kit.setFaces(null); }
    const body = $('.mb4-body'), top = body.scrollTop;
    const isApp = view.startsWith('app:'), isPage = view.startsWith('page:');
    const ent = isPage ? entryInfo(entryOf(view.split(':')[1])) : null;
    backHook = null; menuItems = []; pageParts = []; pageTitle = ''; closeMenu();
    const [title, fn] = isPage ? [`${ent?.icon ?? ''} ${ent?.name ?? ''}`, drawPage] : isApp ? [`${meta(view.slice(4))?.icon ?? ''} ${meta(view.slice(4))?.name ?? ''}`, drawApp] : VIEWS[view] ?? VIEWS.home;
    const home = view === 'home' || view === 'ask';
    root.classList.toggle('mb4-at-home', home);
    $('.mb4-title').textContent = home ? clock() : title;
    try { fn(body); } catch (e) { console.warn('[meatball] view failed', e); body.innerHTML = kit.empty('⚠', '화면을 그리지 못했어요', '닫았다가 다시 열어 주세요'); }
    if (pageTitle) { $('.mb4-title').textContent = pageTitle; pageTitle = ''; }
    $('[data-more]').hidden = !(menuItems.length || pageParts.length);
    if (keepScroll) body.scrollTop = top;
    // 🌐 screen translation: only when an engine is picked (with «끔» its code is never fetched)
    if (trOn()) import('../st/tr.js').then((T) => { T.apply(body, R.engine); T.apply($('.mb4-title'), R.engine); }).catch((e) => console.warn('[meatball] translation', e));
}
let pageTitle = '';
const trOn = () => { const m = cfg().tr?.mode; return m === 'free' || m === 'ai'; };
// The time shown in the status bar: the story's, when the Scene app knows it.
function clock() {
    const S = R.engine.reg.has('scene') && hasChat() ? R.engine.state('scene') : null;
    const T = R.engine.reg.has('touch') && hasChat() ? R.engine.envOf('touch').store : null;
    if (S) { const d = S.date || dayKo(S, S.day, R.engine.reg.has('calendar') ? R.engine.envOf('calendar').store.start : ''); const t = [T?.title, d, S.tod ? TOD_KO[S.tod] : ''].filter(Boolean).join(' · '); if (t) return t; }
    if (T?.title) return T.title;
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── first question ──
function drawAsk(body) {
    body.innerHTML = `<div class="mb4-ask-h"><div class="mb4-ask-logo">😼</div><h3>어떤 롤플을 해요?</h3><p>하나만 골라 주세요. 거기 맞는 앱만 켜져요.<br>나중에 🛍 마켓에서 언제든 바꿀 수 있어요.</p></div>
        ${PRESETS.map((p) => `<button class="mb4-pick" data-preset="${p.id}"><span class="mb4-pick-ico">${p.icon}</span><span class="mb4-pick-t"><b>${p.name}</b><small>${p.desc}</small><span class="mb4-pick-apps">${p.apps.map((id) => `<i title="${esc(meta(id).name)}">${meta(id).icon}</i>`).join('')}</span></span></button>`).join('')}
        <button class="mb4-btn ghost wide" data-preset="">직접 고를게요 (첫 화면에서 하나씩 켜요)</button>`;
    body.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', async () => {
        const p = PRESETS.find((x) => x.id === b.dataset.preset);
        body.querySelectorAll('[data-preset]').forEach((x) => { x.disabled = true; });
        cfg().asked = true; saveCfg();
        for (const a of BUILTIN) if (R.isOn(a.id) && !p?.apps.includes(a.id) && p) await R.setApp(a.id, false);
        for (const id of p?.apps ?? []) await R.setApp(id, true);
        go('home');
    }));
}

// ── home ──
function hero() {
    const E = R.engine, chat = hasChat();
    const S = chat && E.reg.has('scene') ? E.state('scene') : null;
    const W = chat && E.reg.has('wallet') ? E.state('wallet') : null;
    const calOn = E.reg.has('calendar'), env = calOn ? E.envOf('calendar') : null;
    // the date the story itself named wins; the calendar's own count is only a fallback (they can disagree)
    let date = '';
    // the story's date (its own weekday), else the calendar's start date counted on
    const wdK = (w) => (w == null ? '' : ` ${'일월화수목금토'[w]}요일`);
    if (S && !S.date && !S.vague) {
        const o = dayOn(S, S.day, startMs(env?.store.start) == null ? null : new Date(startMs(env.store.start)).getUTCFullYear());
        if (o) date = `${o.m}월 ${o.d}일${wdK(o.wd ?? utc(o.y, o.m, o.d).getUTCDay())}`;
        else { const t = dayDate(S, S.day, env?.store.start); if (t != null) { const d = new Date(t); date = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일${wdK(d.getUTCDay())}`; } }
    }
    if (!S) return `<div class="mb4-hero mb4-home-hero"><div class="mb4-hero-n">😼 미트볼</div><div class="mb4-hero-s">${chat ? `켠 앱 ${E.reg.size}개` : '채팅을 열면 기록이 시작돼요'}</div></div>`;
    return `<div class="mb4-hero mb4-home-hero" data-go="app:scene">
        <div class="mb4-hero-n">${S.tod ? TOD_KO[S.tod] : (S.date || date) ? esc(String(S.date || date).split(' ').slice(0, 2).join(' ')) : '😼'}</div>
        <div class="mb4-hero-s">${[S.date || date, String(S.weather ?? '').split(/[,，]/)[0].trim().slice(0, 16)].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="mb4-hero-m">${[S.loc ? `📍 ${esc(room(S.loc))}` : '📍 아직 몰라요', S.with.length ? `👥 ${S.with.length}명` : '', W ? `💰 ${Number(W.cash).toLocaleString('en-US')}` : ''].filter(Boolean).join('<i>·</i>')}</div>
    </div>`;
}
// What an entry looks like on a shelf: its own words, or its single app's.
const entryInfo = (e) => (e ? (e.apps.length === 1 ? { ...meta(e.apps[0]), ...e } : e) : null);
// One live line per entry, from what its switched-on apps would show in the status strip (no model call).
function liveLine(e, S) {
    const E = R.engine, out = [];
    for (const id of e.apps) { const app = E.reg.get(id); if (!app?.hud) continue; try { for (const t of app.hud(S[id], E.envOf(id)) ?? []) if (t) out.push(String(t)); } catch (x) { /* optional */ } }
    return out.slice(0, 4).join(' · ');
}
const TIPS = [
    '줄 오른쪽 스위치로 바로 켜고 꺼요. 끈 앱은 AI에 아무것도 보내지 않아요.',
    '👥 인물의 「한눈에」는 사람마다 한 장이에요. 줄을 누르면 그 탭으로 가요.',
    '⚙️ 설정의 「읽는 간격」을 3답마다로 두면 AI 부르는 횟수가 3분의 1로 줄어요.',
    '🧭 장면에서 「요약을 AI에게도 알려 주기」를 켜면 긴 이야기에서 앞일을 덜 잊어요.',
    '틀리게 읽은 답은 📒 기록에서 그 답만 다시 읽혀요.',
    '🎲 주사위 · 🎯 선택지 · 🔮 점집은 「오늘의 운」을 함께 써요. 점괘를 뽑으면 주사위에도 닿아요.',
    '📌 약속에 「내일」 「3일 뒤」라고 적혀 있으면 기한을 코드가 셈해요.',
    '📝 메모는 여러 장 쓸 수 있고, 「이 장면에서만」은 장소가 바뀌면 저절로 쉬어요.',
    '🌀 이야기 장치의 「예고된 사건」은 정한 답 수 뒤에 터지고, 그 전에 조짐이 먼저 보여요.',
    '💗 호감은 💞 관계가 적은 것을 받아 셈해요. 켜도 AI에 더 묻지 않아요.',
    '📖 설정집은 그 말이 나온 답에만 골라서 보내요. 길게 적어도 부담이 늘지 않아요.',
    '⚙️ 설정의 「💾 백업」으로 이 채팅의 미트볼 기록을 파일로 남겨 둘 수 있어요.',
];
// 💌 what the lover left on the home screen (read from the touch app; nothing here is sent anywhere)
function loveNote() {
    if (!R.engine.reg.has('touch')) return '';
    const T = R.engine.envOf('touch').store, n = T?.note;
    return `${n?.text ? `<div class="mb4-sticky"><span>📝 ${esc(n.text)}</span><button class="mb4-x" data-unnote aria-label="떼기">✕</button></div>` : ''}`;
}
let shelfId = '';
function drawHome(body) {
    const E = R.engine, chat = hasChat(), S = chat ? E.states() : {};
    shelfId = SHELVES.some((x) => x.id === shelfId) ? shelfId : (SHELVES.some((x) => x.id === cfg().shelf) ? cfg().shelf : 'state');
    const shelf = SHELVES.find((x) => x.id === shelfId);
    const nOn = (sh) => sh.entries.reduce((n, e) => n + e.apps.filter((id) => R.isOn(id)).length, 0);
    const entry = (e) => {
        const info = entryInfo(e), on = e.apps.filter((id) => R.isOn(id)), single = e.apps.length === 1;
        const line = chat && on.length ? liveLine(e, S) : '';
        const sub = line ? `<small class="mb4-ent-live">${esc(line)}</small>` : `<small>${esc(info.desc ?? '')}</small>`;
        const right = single
            ? `<label class="mb4-sw mb4-ent-sw" data-stop><input type="checkbox" data-app="${e.apps[0]}" ${on.length ? 'checked' : ''} aria-label="${esc(info.name)} 켜기"><i></i></label>`
            : `<span class="mb4-ent-parts">${e.apps.map((id) => `<i class="${R.isOn(id) ? 'on' : ''}" title="${esc(meta(id)?.name ?? id)}">${meta(id)?.icon ?? ''}</i>`).join('')}</span>`;
        return `<div class="mb4-ent${on.length ? ' on' : ''}" data-go="page:${e.id}">${icon(info)}<div class="mb4-ent-t"><b>${esc(info.name)}</b>${single ? badge(info.cost) : `<span class="mb4-badge">${on.length} / ${e.apps.length}</span>`}${sub}</div>${right}<span class="mb4-chev">›</span></div>`;
    };
    const ext = R.externals().filter((a) => !homeOf(a.id));
    const keys = E.reg.keys().length, every = Math.max(1, Number(cfg().every) || 1);
    body.innerHTML = `${hero()}
        ${E.paused() ? '<div class="mb4-banner">⏸ 멈춤 중이에요. AI에 아무것도 보내지 않아요.</div>' : ''}
        ${chat ? catchUp() : ''}
        ${chat ? loveNote() : ''}
        <div class="mb4-shelves" role="tablist">${SHELVES.map((sh) => `<button class="mb4-shelf${sh.id === shelfId ? ' on' : ''}" data-shelf="${sh.id}" role="tab"><span>${sh.icon}</span><b>${sh.name}</b><small>${nOn(sh)}</small></button>`).join('')}</div>
        <p class="mb4-lead">${esc(shelf.hint)} · 켠 것만 일해요.</p>
        <div class="mb4-ents">${shelf.entries.map(entry).join('')}</div>
        ${ext.length ? `<h5 class="mb4-sec">🧩 따로 깐 앱</h5><div class="mb4-ents">${ext.map((a) => `<div class="mb4-ent${R.isOn(a.id) ? ' on' : ''}" data-go="app:${a.id}">${icon(a)}<div class="mb4-ent-t"><b>${esc(a.name ?? a.id)}</b>${badge(a.cost)}<small>${esc(a.desc ?? '')}</small></div><label class="mb4-sw mb4-ent-sw" data-stop><input type="checkbox" data-app="${a.id}" ${R.isOn(a.id) ? 'checked' : ''}><i></i></label></div>`).join('')}</div>` : ''}
        ${cfg().tips === false ? '' : `<p class="mb4-tip">💡 ${esc(TIPS[(Math.floor(Date.now() / 3.6e6)) % TIPS.length])}</p>`}
        <div class="mb4-load" data-go="set"><span>${keys ? `📖 ${every > 1 ? `답 ${every}개마다` : '답마다'} 읽기 1번 · 항목 ${keys}개` : '🍃 AI를 따로 부르지 않아요'}</span><span>⚙️ 설정 ›</span></div>`;
    body.querySelectorAll('[data-shelf]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); shelfId = b.dataset.shelf; cfg().shelf = shelfId; saveCfg(); draw(true); }));
    body.querySelectorAll('[data-stop]').forEach((el) => el.addEventListener('click', (e) => e.stopPropagation()));
    body.querySelector('[data-unnote]')?.addEventListener('click', (e) => { e.stopPropagation(); const T = R.engine.envOf('touch').store; T.note = null; saveChat(); draw(true); });
    wireSwitches(body);
}
// Every [data-app] checkbox switches that app on or off.
function wireSwitches(box) {
    box.querySelectorAll('input[data-app]').forEach((b) => b.addEventListener('change', async () => {
        b.disabled = true;
        const why = await R.setApp(b.dataset.app, b.checked);
        if (why) toast(why.startsWith('key-taken') ? '다른 앱이 이미 같은 것을 읽고 있어서 켜지 못했어요.' : '켜지 못했어요. 새로 고친 뒤 다시 해 보세요.', 'warning');
        draw(true);
    }));
}

// ── catching up: carry on from an earlier Meatball, and read replies that were never read ──
const FILL = { on: false, done: 0, total: 0, calls: 0, ctl: null };
const OLD_KEYS = [['meatball_status3', '상태창 3'], ['meatlite', '미트볼폰'], ['statussim', '상태창']];
function catchUp() {
    const E = R.engine, st = store(false), md = ctx().chatMetadata ?? {};
    const old = st?.adopted ? [] : OLD_KEYS.filter(([k]) => md[k] && typeof md[k] === 'object').map(([, n]) => n);
    const left = E.unreadCount();
    let html = '';
    if (old.length) html += `<div class="mb4-card mb4-catch"><b>📦 옛 미트볼 기록이 있어요</b><small>${old.join(' · ')}의 기록을 그대로 이어받아요. AI를 부르지 않고, 옛 기록은 건드리지 않아요.</small><div class="mb4-btnrow"><button class="mb4-btn" data-catch="adopt">이어 가기</button><button class="mb4-btn ghost" data-catch="skip">새로 시작</button></div></div>`;
    if (FILL.on) html += `<div class="mb4-card mb4-catch"><b>📖 옛 답을 읽는 중… ${FILL.done} / ${FILL.total}</b>${kit.bar(FILL.total ? FILL.done / FILL.total * 100 : 0)}<small>AI ${FILL.calls}번 불렀어요. 닫아도 계속 읽어요.</small><div class="mb4-btnrow"><button class="mb4-btn ghost" data-catch="stop">멈추기</button></div></div>`;
    else if (left > Math.max(1, Number(cfg().every) || 1)) html += `<div class="mb4-card mb4-catch"><b>📖 아직 안 읽은 답 ${left}개</b><small>한 번에 읽으면 처음부터 지금까지의 상태가 채워져요. AI를 약 ${Math.ceil(left / 3)}번 불러요 (답 3개씩 묶어 읽기).</small><div class="mb4-btnrow"><button class="mb4-btn" data-catch="fill">한 번에 읽기</button></div></div>`;
    return html;
}
async function onCatch(what) {
    const E = R.engine;
    if (what === 'skip') { store(true).adopted = true; saveChat(); draw(true); }
    else if (what === 'stop') { if (FILL.ctl) FILL.ctl.stop = true; }
    else if (what === 'adopt') {
        const M = await import('../st/migrate.js');
        const got = M.collect(ctx().chatMetadata, ctx().chat ?? [], names().user);
        const n = E.adopt(got.records, got.apps);
        store(true).adopted = true; saveChat();
        toast(n ? `답 ${n}개의 기록을 이어받았어요.` : '이어받을 기록이 없었어요. 「한 번에 읽기」로 채울 수 있어요.');
        R.redrawFrame(); draw(true);
    } else if (what === 'fill' && !FILL.on) {
        Object.assign(FILL, { on: true, done: 0, total: E.unreadCount(), calls: 0, ctl: {} });
        draw(true);
        const r = await E.fill({ batch: 3, ctl: FILL.ctl, gap: 1500, onStep: (p) => { Object.assign(FILL, p); if (root.classList.contains('mb4-open') && view === 'home') draw(true); } });
        FILL.on = false;
        toast(`답 ${r.done}개를 읽었어요 (AI ${r.calls}번).`);
        R.redrawFrame(); draw(true);
    }
}

// ── market ──
function drawMarket(body) {
    const item = (a, on, ext) => `<div class="mb4-item${on ? ' on' : ''}">${icon(a)}
        <div class="mb4-item-t"><b>${esc(a.name ?? a.id)}</b>${badge(a.cost)}${ext ? '<span class="mb4-badge">따로 깐 앱</span>' : ''}<small>${esc(a.desc ?? '')}</small></div>
        <button class="mb4-get${on ? ' on' : ''}" data-app="${a.id}" data-on="${on ? 0 : 1}">${on ? '끄기' : '받기'}</button></div>`;
    const ext = R.externals(), nOn = R.active().length, keys = R.engine.reg.keys().length;
    body.innerHTML = `<div class="mb4-market-h"><b>켠 앱 ${nOn}개</b><span>${keys ? '답마다 AI 읽기 1번' : 'AI 추가 호출 없음'}</span></div>
        <p class="mb4-lead">켠 앱만 일해요. 끈 앱은 AI에 아무것도 보내지 않아요. 「조금」 앱을 여러 개 켜도 답은 한 번만 읽어요.</p>
        <div class="mb4-legend">${badge('zero')}AI를 더 안 불러요 ${badge('low')}답마다 조금 써요 ${badge('tap')}</div>
        ${SHELVES.map((g) => `<h5 class="mb4-sec">${g.icon} ${g.name} <small>${g.hint}</small></h5><div class="mb4-list">${g.entries.flatMap((e) => e.apps).map((id) => item(meta(id), R.isOn(id), false)).join('')}</div>`).join('')}
        <h5 class="mb4-sec">🧩 따로 깐 앱</h5>
        ${ext.length ? `<div class="mb4-list">${ext.map((a) => item(a, R.isOn(a.id), true)).join('')}</div>` : kit.hint('아직 없어요. 따로 만든 앱을 실리태번 확장으로 설치하면 여기 나타나요.')}
        <button class="mb4-btn ghost wide" data-go="ask">처음 질문으로 한 번에 고르기</button>`;
    body.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        const why = await R.setApp(b.dataset.app, b.dataset.on === '1');
        if (why) toast(why.startsWith('key-taken') ? '다른 앱이 이미 같은 것을 읽고 있어서 켜지 못했어요.' : '앱을 켜지 못했어요. 새로 고친 뒤 다시 해 보세요.', 'warning');
        draw(true);
    }));
}

// ── one app ──
function drawApp(body) { const id = view.slice(4); if (!R.engine.reg.get(id)) { go('home'); return; } mountApp(body, id); }
function mountApp(body, id) {
    const def = R.engine.reg.get(id), E = R.engine;
    if (!def) { body.innerHTML = ''; return; }
    if (!hasChat()) { body.innerHTML = kit.empty(def.icon ?? '📦', '채팅을 열면 쓸 수 있어요'); return; }
    if (!def.render) { body.innerHTML = kit.empty(def.icon ?? '📦', '이 앱은 화면 없이 뒤에서 일해요'); return; }
    store(true);
    const env = E.envOf(id);
    const api = {
        env, store: env.store, cfg: env.cfg, kit,
        state: () => E.state(id),
        save: () => { saveChat(); saveCfg(); E.touch(); E.refresh(); R.redrawFrame(); },
        fix: (k, v, at) => { const ok = E.fix(k, v, at); if (!ok) toast(E.lastReply() < 0 ? 'AI 답이 하나는 있어야 고칠 수 있어요.' : '그 값은 넣을 수 없어요.', 'warning'); else { clearTimeout(fixDraw); fixDraw = setTimeout(() => draw(true), 0); } return ok; },
        redraw: () => draw(true), toast, close,
        // the phone's ⋯ menu: [{ icon, label, sub?, act, disabled?, cur? } | { sec: '제목' }] (only while this app is shown)
        menu: (items) => { menuItems = Array.isArray(items) ? items : []; $('[data-more]').hidden = !(menuItems.length || pageParts.length); },
        // ‹ goes here first; return true when it stepped back inside the app
        onBack: (fn) => { backHook = typeof fn === 'function' ? fn : null; },
        title: (t) => { pageTitle = String(t ?? ''); $('.mb4-title').textContent = pageTitle || $('.mb4-title').textContent; },
        go: (v) => go(v), isOn: (other) => R.isOn(other), here: () => view,
        // a model call the person asked for by tapping (one call; '' when paused or failed)
        ask: (prompt, max) => E.ask(prompt, max),
        // the application's lorebook text the recent chat brings in ('' when none); for an app's own prompt
        lore: async (budget) => (await E.host?.lore?.(budget)) ?? '',
        // what Meatball currently knows, as the English lines it would send (for an app's own prompt)
        facts: () => { const n = E.note(); return [n.state, n.now].filter(Boolean).join('\n'); },
        // put words into the chat's input box (never sends them)
        // make a new version of the last reply (as the reroll arrow would); false when there is none to press
        regen: () => { const b = document.querySelector('#chat .last_mes .swipe_right'); if (b) { b.click(); return true; } try { ctx().executeSlashCommandsWithOptions?.('/regenerate'); return true; } catch (e) { return false; } },
        say: (text) => { const box = document.getElementById('send_textarea'); if (!box) return false; box.value = box.value ? `${box.value} ${text}` : text; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); return true; },
        core: { log: () => E.log(), chips: (e) => E.chips(e), reread: (i) => E.reread(i), unfix: (i, k, v) => E.unfix(i, k, v), chat: () => E.host.chat(),
            // a read-only summary for self-check and reports (no secrets: the reader's prompt is not included)
            status: () => ({ ...E.stats, lastPrompt: undefined, lastAnswer: undefined, promptChars: E.stats.lastPrompt?.length ?? 0, apps: E.reg.list().map((a) => a.id), keys: E.reg.keys().map((k) => k.id), paused: E.paused(), unread: E.unreadCount(), version: VERSION, gen: '',
                // note lines another app held back or changed on the way out (shown in the self-check)
                screened: (() => { try { return (E.note().screened ?? []).map((x) => ({ app: x.app, by: x.by, held: !x.to, line: x.to ?? '' })); } catch (e) { return []; } })() }),
            ownerOf: (k) => E.reg.ownerOf(k)?.id ?? '' },
        ...(id === 'helper' ? { helper: {
            appsOn: () => E.reg.list().filter((a) => a.id !== 'helper').map((a) => ({ id: a.id, name: meta(a.id)?.name ?? a.name ?? a.id, icon: meta(a.id)?.icon ?? a.icon ?? '', desc: meta(a.id)?.desc ?? a.desc ?? '' })),
            keys: () => E.reg.keys().map((k) => ({ id: k.id, line: k.line, app: k.app })),
            chip: (k, v) => { const a = E.reg.ownerOf(k); try { return a?.chip ? String(a.chip({ k, v, q: '' }, E.envOf(a.id)) ?? '') : ''; } catch (e) { return ''; } },
            fix: (k, v) => E.fix(k, v),
            storeOf: (other) => (E.reg.has(other) ? E.envOf(other).store : null),
            cardOf: (other) => (E.reg.has(other) ? E.envOf(other).card : null),
        } } : {}),
    };
    body.innerHTML = `<div class="mb4-app mb4-app-${esc(id)}"></div>`;
    try { def.render(body.firstElementChild, api); }
    catch (e) { console.warn(`[meatball] ${id} render`, e); body.innerHTML = kit.empty('⚠', `${def.name ?? id} 앱에서 오류가 났어요`, '앱을 업데이트하거나 🛍 마켓에서 꺼 주세요'); }
}

// ── one shelf entry: a single app, or several apps as inner tabs with a «한눈에» front page ──
const FEEL_KO = { attraction: '끌림', desire: '욕망', lingering: '미련', 'love-hate': '애증', 'forbidden pull': '금지된 끌림', resentment: '원망', bond: '정' };
const COST_WORD = { zero: '켜도 AI를 더 부르지 않아요.', tap: '켜 두기만 하면 0이에요. 단추를 누를 때만 AI를 한 번 불러요.', low: '켜면 답을 읽을 때 물어보는 항목이 조금 늘어요. 따로 더 부르지는 않아요.' };
let bondsMod = null;
const EDITING = new Set();   // apps whose 「✏️ 고치기」 is pressed (until the phone is reloaded)
function drawPage(body) {
    const [, eid, tabRaw] = view.split(':'), e = entryOf(eid);
    if (!e) { go('home'); return; }
    const multi = e.apps.length > 1;
    const tab = multi ? (e.apps.includes(tabRaw) ? tabRaw : e.front ? 'all' : e.apps[0]) : e.apps[0];
    // a page of several apps that is not a «한눈에» page: no tab row — the first app fills the page, the rest are in ⋯
    if (multi && !e.front) {
        pageParts = e.apps.filter((id) => id !== e.apps[0] || tab !== e.apps[0]).map((id) => ({ icon: meta(id)?.icon ?? '', label: meta(id)?.name ?? id, off: !R.isOn(id), cur: id === tab, act: () => go(`page:${e.id}${id === e.apps[0] ? '' : `:${id}`}`) }));
        if (tab !== e.apps[0]) pageTitle = `${meta(tab)?.icon ?? ''} ${meta(tab)?.name ?? tab}`;
        body.innerHTML = '<div class="mb4-page"></div>';
        appTab(body.lastElementChild, tab, true);
        wireSwitches(body);
        return;
    }
    const tabs = multi ? `<div class="mb4-tabs">${[...(e.front ? [['all', '한눈에', '✨']] : []), ...e.apps.map((id) => [id, meta(id)?.tab ?? meta(id)?.name ?? id, meta(id)?.icon ?? ''])].map(([id, name, ic]) => `<button class="mb4-tab${id === tab ? ' on' : ''}${id !== 'all' && !R.isOn(id) ? ' off' : ''}" data-go="page:${e.id}${id === 'all' ? '' : `:${id}`}">${ic} ${esc(name)}</button>`).join('')}</div>` : '';
    body.innerHTML = `${tabs}<div class="mb4-page"></div>`;
    const box = body.lastElementChild;
    if (tab === 'all') (e.id === 'cast' ? castOverview : overview)(box, e); else appTab(box, tab, multi);
    wireSwitches(body);
}
function appTab(box, id, multi) {
    const a = meta(id);
    if (!R.engine.reg.has(id)) {
        box.innerHTML = `<div class="mb4-offcard">${icon(a)}<b>${esc(a?.name ?? id)}</b>${badge(a?.cost)}<p>${esc(a?.desc ?? '')}</p><button class="mb4-btn wide" data-turn>켜기</button>${kit.hint(COST_WORD[a?.cost] ?? COST_WORD.low)}</div>`;
        box.querySelector('[data-turn]').addEventListener('click', async (ev) => { ev.target.disabled = true; const why = await R.setApp(id, true); if (why) toast('켜지 못했어요. 새로 고친 뒤 다시 해 보세요.', 'warning'); draw(true); });
        return;
    }
    const editing = EDITING.has(id);
    // a chat screen (📞 연락 · 💬 단체방) shows only the conversation: 고치기 · 끄기 go into ⋯
    const chatty = !!R.engine.reg.get(id)?.chat;
    box.innerHTML = chatty ? '<div></div>' : `<div></div><div class="mb4-tabfoot">${badge(a?.cost)}<button class="mb4-btn ${editing ? '' : 'ghost '}sm" data-editmode>${editing ? '✔ 다 고쳤어요' : '✏️ 고치기'}</button><button class="mb4-link" data-turnoff>${multi ? `「${esc(a?.name ?? id)}」 끄기` : '끄기'}</button></div>`;
    mountApp(box.firstElementChild, id);
    if (chatty) {
        menuItems = [...menuItems, { sec: '이 앱' },
            { icon: editing ? '✔' : '✏️', label: editing ? '다 고쳤어요' : '고치기', sub: '주고받은 말 · 요약을 직접 고쳐요', act: () => { if (EDITING.has(id)) EDITING.delete(id); else EDITING.add(id); draw(true); } },
            { icon: '⏻', label: `「${a?.name ?? id}」 끄기`, act: async () => { await R.setApp(id, false); draw(true); } }];
        $('[data-more]').hidden = false;
    }
    // one 「✏️ 고치기」 for the whole app: every edit box of this app shows, already open; pressed again, they all go away
    const app = box.firstElementChild;
    app.classList.toggle('mb4-editing', editing);
    if (editing) { app.querySelectorAll('details.mb4-edcard').forEach((d) => { d.open = true; }); if (!app.querySelector('.mb4-edcard')) app.insertAdjacentHTML('beforeend', kit.hint('이 앱은 위 화면에서 바로 고쳐요.')); }
    box.querySelector('[data-editmode]')?.addEventListener('click', () => { if (EDITING.has(id)) EDITING.delete(id); else EDITING.add(id); draw(true); if (EDITING.has(id)) setTimeout(() => $('.mb4-body .mb4-edcard')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); });
    box.querySelector('[data-turnoff]')?.addEventListener('click', async () => { await R.setApp(id, false); draw(true); });
}
const offRow = (off) => (off.length ? `<div class="mb4-offrow"><small>꺼져 있어요 · 누르면 켜요</small>${off.map((id) => `<label class="mb4-offchip"><input type="checkbox" data-app="${id}"><span>${meta(id)?.icon ?? ''} ${esc(meta(id)?.name ?? id)}</span></label>`).join('')}</div>` : '');
// Front page of a several-app entry: what each switched-on part has to show, each a door to its own tab.
function overview(box, e) {
    const E = R.engine, chat = hasChat(), S = chat ? E.states() : {};
    const on = e.apps.filter((id) => E.reg.has(id)), off = e.apps.filter((id) => !E.reg.has(id));
    const cards = !chat ? kit.empty(e.icon, '채팅을 열면 보여요') : on.map((id) => {
        const a = E.reg.get(id); let html = '';
        try { html = a.widget?.(S[id], E.envOf(id)) ?? ''; } catch (x) { html = ''; }
        return `<section class="mb4-card mb4-widget" data-go="page:${e.id}:${id}"><h5 class="mb4-card-h">${meta(id)?.icon ?? ''} ${esc(meta(id)?.name ?? id)}<span class="mb4-chev">›</span></h5>${html || kit.hint('아직 적힌 게 없어요.')}</section>`;
    }).join('');
    const line = chat && on.length ? liveLine(e, S) : '';
    box.innerHTML = `${line ? `<div class="mb4-hero"><small>지금</small><div class="mb4-sum-t">${esc(line)}</div></div>` : ''}${cards}${!on.length && chat ? kit.empty(e.icon, '켜 둔 게 없어요', '아래에서 골라 켜 보세요') : ''}${offRow(off)}`;
}
// 👥 People, one card per person: who they are, what they wear, where things stand with me, what is kept from
// whom, and their last inner voice — gathered from five apps, each of which may be off (its lines simply are not there).
function castOverview(box, e) {
    const E = R.engine;
    if (!hasChat()) { box.innerHTML = kit.empty('👥', '채팅을 열면 보여요'); return; }
    const st = (id) => (E.reg.has(id) ? E.state(id) : null);
    const P = st('people'), L = st('look'), B = st('bonds'), SC = st('scene'), HT = st('heart'), me = names().user;
    if (B && !bondsMod) import('../apps/bonds.js').then((m) => { bondsMod = m; if (view.startsWith('page:cast')) draw(true); }).catch(() => { bondsMod = {}; });
    const here = new Set(SC?.with ?? []), pairs = Object.values(B?.pairs ?? {});
    const sec = E.reg.has('secrets') ? (Array.isArray(E.envOf('secrets').store.list) ? E.envOf('secrets').store.list : []) : [];
    const minds = E.reg.has('mind') ? (Array.isArray(E.envOf('mind').store.list) ? E.envOf('mind').store.list : []) : [];
    const all = new Set([...here, ...Object.keys(P?.list ?? {}), ...Object.keys(L?.who ?? {}), ...pairs.flatMap((x) => [x.a, x.b])]);
    const isMe = (n) => !n || n === me || /^(?:\{\{user\}\}|user|you|me|나|너|주인공)$/i.test(String(n).trim()) || (me && String(n).trim().toLowerCase() === String(me).trim().toLowerCase());
    for (const n of [...all]) if (isMe(n)) all.delete(n);
    const gone = (n) => !!P?.list?.[n]?.gone;
    const near = kit.closeness(B, HT, me);
    const order = [...all].sort((a, b) => (here.has(b) - here.has(a)) || (gone(a) - gone(b)) || (near(b) - near(a)) || ((P?.list?.[b]?.i ?? 0) - (P?.list?.[a]?.i ?? 0)));
    const off = e.apps.filter((id) => !E.reg.has(id));
    const row = (ic, label, html, tab) => (html ? `<div class="mb4-pf-row" data-go="page:cast:${tab}"><span class="mb4-pf-k">${ic} ${label}</span><span class="mb4-pf-v">${html}</span></div>` : '');
    const seedsOf = (n) => { const x = P?.seeds?.[n]; return (Array.isArray(x) ? x : x ? [x] : []).map((y) => (typeof y === 'string' ? y : y?.v)).filter(Boolean); };
    const one = (n, isMe = false) => {
        const p = P?.list?.[n], l = L?.who?.[n];
        const pair = isMe ? null : pairs.find((x) => (x.a === n && x.b === me) || (x.b === n && x.a === me));
        const others = isMe ? [] : pairs.filter((x) => (x.a === n || x.b === n) && x !== pair).slice(0, 3);
        let stage = ''; try { stage = pair && bondsMod?.stageOf ? bondsMod.stageOf(pair)?.ko ?? '' : ''; } catch (x) { stage = ''; }
        const feels = pair ? [...new Set(Object.values(pair.feel ?? {}).map((f) => FEEL_KO[f?.t]).filter(Boolean))] : [];
        const role = P?.roles?.[n]?.v ?? '', callsMe = P?.calls?.[`${n}>${me}`]?.v, iCall = P?.calls?.[`${me}>${n}`]?.v;
        const nSec = sec.filter((x) => String(x?.who ?? '').split(/\s*[-&,]\s*/).some((w) => w.trim() && w.trim().toLowerCase() === String(n).toLowerCase())).length;   // secrets this person keeps
        const mind = minds.filter((m) => m?.who === n).at(-1);
        const pills = [here.has(n) ? kit.pill('지금 같이', 'good') : '', gone(n) ? kit.pill('떠남', 'bad') : '', stage ? kit.pill(stage, 'love') : '', l?.body ? kit.pill('🩹', 'bad') : ''].join('');
        const body = [
            row('👥', '소개', [p?.about ? esc(p.about) : '', role ? `<small>${esc(role)}</small>` : '', p?.seen?.length ? `<small>다른 이름: ${p.seen.map(esc).join(', ')}</small>` : '', seedsOf(n).length ? `<small>${seedsOf(n).slice(-3).map(esc).join(' · ')}</small>` : ''].filter(Boolean).join('<br>'), 'people'),
            row('🗣', '부르는 말', [callsMe ? `나를 「${esc(callsMe)}」` : '', iCall ? `내가 「${esc(iCall)}」` : ''].filter(Boolean).join(' · '), 'people'),
            row('👕', '차림새', [l?.wear ? esc(l.wear) : '', l?.body ? `<small>🩹 ${esc(l.body)}</small>` : '', l?.marks?.length ? `<small>✒ ${l.marks.map(esc).join(', ')}</small>` : '', l?.carry?.length ? `<small>🎒 ${l.carry.map(esc).join(', ')}</small>` : '', l?.pos ? `<small>🪑 ${esc(l.pos)}</small>` : ''].filter(Boolean).join('<br>'), 'look'),
            row('💞', '나와', pair ? [[stage, pair.tie ? esc(pair.tie) : '', feels.join(' · ')].filter(Boolean).join(' · ') || '아직 서먹해요', pair.moves?.length ? `<small>함께한 일 ${pair.moves.length}번${pair.refuse?.length ? ` · 거절 ${pair.refuse.length}번` : ''}</small>` : ''].filter(Boolean).join('<br>') : '', 'bonds'),
            row('💗', '호감', (() => { const d = HT?.d?.[`${n}>${me}`]; return d && d.hist?.length ? `애정 <b>${d.a}</b> · 신뢰 <b>${d.t}</b>${d.j >= 30 ? ' · 🔥 질투' : ''}` : ''; })(), 'heart'),
            row('🔗', '다른 사람과', others.map((x) => `${esc(x.a === n ? x.b : x.a)}${x.tie ? ` <small>${esc(x.tie)}</small>` : ''}`).join(' · '), 'bonds'),
            row('🔒', '비밀', nSec ? `얽힌 비밀 ${nSec}개` : '', 'secrets'),
            row('💭', '속마음', mind ? `<q>${esc(String(mind.text).slice(0, 120))}</q>` : '', 'mind'),
        ].join('');
        return `<details class="mb4-pf${gone(n) ? ' gone' : ''}" ${here.has(n) || isMe ? 'open' : ''}><summary><span class="mb4-face">${kit.face(n)}</span><span class="mb4-pf-n"><b data-trc="name">${esc(n)}</b><small>${isMe ? '나' : esc(role || String(p?.about ?? '').slice(0, 30))}</small></span><span class="mb4-pf-p">${pills}</span></summary>
            ${body || kit.hint('아직 적힌 게 없어요.')}
            ${!isMe && E.reg.has('mind') ? `<div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-mind="${esc(n)}">💭 속마음 들여다보기</button></div>` : ''}</details>`;
    };
    const inScene = order.filter((n) => here.has(n)), rest = order.filter((n) => !here.has(n));
    box.innerHTML = `${offRow(off)}
        ${me && L?.who?.[me] ? one(me, true) : ''}
        ${inScene.length ? `<h5 class="mb4-sec">지금 같이 있는 사람 <small>${inScene.length}명</small></h5>${inScene.map((n) => one(n)).join('')}` : ''}
        ${rest.length ? `<h5 class="mb4-sec">그 밖의 사람 <small>${rest.length}명 · 가까운 순</small></h5>${(() => { const at = Number(E.reg.has('heart') ? E.envOf('heart').store.showAt : 0) || kit.SHOW_AT, sp = kit.byHeart(rest, HT, me, [], at); return sp ? kit.foldUnder(sp.shown.map((n) => one(n)), sp.rest.map((n) => one(n)), at) : kit.foldRest(rest.map((n) => one(n))); })()}` : ''}
        ${order.length ? kit.hint('줄을 누르면 그 탭으로 가요. 꺼 둔 기능의 줄은 나오지 않아요.') : kit.empty('👥', '아직 만난 사람이 없어요', '이야기가 진행되면 사람마다 한 장씩 생겨요')}`;
    box.querySelectorAll('[data-mind]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); const ms = E.envOf('mind').store; ms.mode = 'cast'; ms.who = b.dataset.mind; saveChat(); go('page:cast:mind'); }));
}

// ── settings ──
function drawSet(body) {
    const c = cfg(), st = store(false), E = R.engine, n = E.note(), s = E.stats;
    const keys = E.reg.keys(), lastI = E.lastReply(), chars = (n.state + n.now).length;
    const sw = (attr, on, label, sub = '', dis = false) => `<label class="mb4-sw"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" ${attr} ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><i></i></label>`;
    body.innerHTML = `
        ${kit.card('쉬기', `${sw('data-c="paused"', c.paused, '⏸ 전체 멈춤', '모든 채팅에서 읽기 · 쪽지를 쉬어요')}${sw('data-s="off"', st?.off, '🔌 이 채팅에서만 끄기', '', !hasChat())}`)}
        ${kit.card('채팅 화면', `${sw('data-c="hud"', c.hud !== false, '입력창 위 상태 줄')}${sw('data-c="chips"', c.chips !== false, '답 밑 변화 딱지')}${sw('data-side', c.side === 'left', '폰을 왼쪽에 두기')}${sw('data-c="dock"', c.dock !== false, '채팅 옆에 붙이기', '넓은 화면에서 채팅을 가리지 않게 옆으로 비켜 줘요')}<label class="mb4-label">폰 너비 (옆에 붙일 때)</label><div class="mb4-seg">${[['s', '좁게'], ['m', '보통'], ['l', '넓게']].map(([v, n]) => `<button class="${(c.phoneW ?? 'm') === v ? 'on' : ''}" data-phonew="${v}">${n}</button>`).join('')}</div>`)}
        ${kit.card('답을 읽는 AI', `<select class="mb4-input" data-profile><option value="">본편과 같은 연결</option>${profiles().map((p) => `<option value="${esc(p.id)}" ${p.id === c.profile ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
            ${kit.hint(`빠르고 싼 모델의 연결 프로필을 고르면 좋아요. ${keys.length ? `지금은 답마다 1번 읽어요 (읽는 항목 ${keys.length}개).` : '지금 켠 앱은 답을 읽을 필요가 없어서 AI를 부르지 않아요.'}`)}
            <label class="mb4-label">🪙 누를 때 부르는 짧은 호출 (속마음 · 음악 같은 것)</label><div class="mb4-seg">${[['', '아껴서 (4096)'], ['big', '넉넉히 (8192)']].map(([v, n]) => `<button class="${(c.tapRoom ?? '') === v ? 'on' : ''}" data-taproom="${v}">${n}</button>`).join('')}</div>
            ${kit.hint('생각을 길게 하는 모델에서 답이 중간에 잘리면 「넉넉히」로 바꿔 주세요.')}
            <label class="mb4-label">🍃 읽는 간격</label><div class="mb4-seg">${[[1, '답마다'], [2, '2답마다'], [3, '3답마다']].map(([v, n]) => `<button class="${(Math.max(1, Number(c.every) || 1)) === v ? 'on' : ''}" data-every="${v}">${n}</button>`).join('')}</div>
            ${kit.hint('2 · 3으로 두면 답을 모았다가 한 번에 읽어서, AI를 부르는 횟수가 절반 · 3분의 1로 줄어요. 놓치는 건 없고, 상태가 그만큼 늦게 따라와요.')}
            <button class="mb4-btn wide" data-reread ${keys.length && lastI >= 0 ? '' : 'disabled'}>🔄 마지막 답 다시 읽기 (AI 1회)</button>
            ${kit.hint(`이번에 읽은 횟수 ${s.calls} · 받은 줄 ${s.kept} · 버린 줄 ${s.dropped}${s.status ? ` · ${s.status}` : ''}`)}`)}
        <details class="mb4-card"><summary>📝 지금 AI에 보내는 쪽지 <small>${chars}자 · 약 ${Math.ceil(chars / 4)}토큰</small></summary>
            <pre class="mb4-pre">${esc([n.state, n.now].filter(Boolean).join('\n\n') || '(아무것도 안 보내요)')}</pre>
            ${Object.entries(n.by).map(([id, x]) => `<div class="mb4-row"><span class="mb4-row-v">${meta(id)?.icon ?? ''} ${esc(meta(id)?.name ?? id)}</span><small>${x.state.length + x.now.length}줄</small></div>`).join('')}</details>
        ${(() => { const M = E.meter(), tok = (c) => Math.ceil(c / 4); return `<details class="mb4-card"><summary>📏 토큰 미터 <small>읽기 고정 ${M.reader.fixed}자 · 쪽지 ${M.note.total}자</small></summary>
            <div class="mb4-row"><span class="mb4-row-k">답 읽기 (답마다 1번)</span><span class="mb4-row-v">${M.reader.total}자 · 약 ${tok(M.reader.total)}토큰 <small>(답 글 빼고)</small></span></div>
            <div class="mb4-row"><span class="mb4-row-k">본편 쪽지</span><span class="mb4-row-v">${M.note.total}자 · 약 ${tok(M.note.total)}토큰</span></div>
            ${M.apps.map((a) => `<div class="mb4-row"><span class="mb4-row-k">${meta(a.id)?.icon ?? ''} ${esc(meta(a.id)?.name ?? a.id)}</span><span class="mb4-row-v"><small>키 ${a.keys} · 읽기 +${a.reader.keys + a.reader.rules + a.reader.state} · 쪽지 +${a.note}</small></span></div>`).join('')}
            ${kit.hint(`읽기 고정 부분(역할 · 규칙 · 키)은 ${M.reader.fixed}자, 지금 상태 줄까지 ${M.reader.total}자예요. 쪽지는 이번 답에 실제로 가는 글이에요.`)}</details>`; })()}
        <details class="mb4-card"><summary>🔍 마지막으로 답을 읽은 내용</summary>
            <pre class="mb4-pre">${esc(s.lastAnswer || '(아직 없어요)')}</pre>
            ${s.lastDropped.length ? kit.hint(`버린 줄: ${s.lastDropped.map((d) => `${d.raw} (${d.why})`).join(' · ')}`) : ''}</details>
        ${kit.card('', '<button class="mb4-btn ghost wide" data-go="look">🎨 꾸미기 — 배경화면 · 테마 색 · 글꼴</button>')}
        ${trCard()}
        ${doctorCard()}
        ${kit.card('💾 백업', `<div class="mb4-btnrow"><button class="mb4-btn ghost" data-bak="chat" ${st ? '' : 'disabled'}>이 채팅 기록 받기</button><button class="mb4-btn ghost" data-bak="all">설정 전부 받기</button></div>
            <div class="mb4-btnrow"><label class="mb4-btn ghost" style="flex:1;text-align:center">📂 파일로 되살리기<input type="file" accept=".json,application/json" data-restore hidden></label></div>${undo ? `<div class="mb4-btnrow"><button class="mb4-btn ghost" style="flex:1" data-undo>↩ 되살리기 전으로 (${undo.kind === 'chat' ? '채팅 기록' : '설정'})</button></div>` : ''}
            ${sw('data-c="tips"', c.tips !== false, '💡 첫 화면 팁 보기')}
            ${kit.hint('받은 파일은 이 기기에 저장돼요. 되살리기는 파일 종류(채팅 기록 · 설정)를 보고 알맞은 곳에 넣어요. 채팅 기록은 지금 연 채팅에 들어가요.')}`)}
        ${kit.card('', `<button class="mb4-btn ghost wide" data-go="ask">처음 질문 다시 보기</button>
            <button class="mb4-btn ghost wide" data-wipe ${st ? '' : 'disabled'}>🗑 이 채팅의 미트볼 기록 지우기</button>
            ${kit.hint(`대화 글은 건드리지 않아요. 미트볼 ${VERSION}`)}`)}`;
    // switched back on: replies written while paused are read the usual way (one at a time, newest first)
    const refresh = () => { E.touch(); E.refresh(); R.redrawFrame(); R.kick?.(); draw(true); };
    body.querySelectorAll('[data-c]').forEach((el) => el.addEventListener('change', () => { c[el.dataset.c] = el.checked; saveCfg(); if (el.dataset.c === 'dock') { if (el.checked) dock(); else undock(); } refresh(); }));
    body.querySelector('[data-s]').addEventListener('change', (e) => { store(true).off = e.target.checked; saveChat(); refresh(); });
    body.querySelector('[data-side]').addEventListener('change', (e) => { c.side = e.target.checked ? 'left' : 'right'; saveCfg(); root.classList.toggle('mb4-left', c.side === 'left'); dock(); });
    body.querySelectorAll('[data-taproom]').forEach((b) => b.addEventListener('click', () => { c.tapRoom = b.dataset.taproom; saveCfg(); draw(true); }));
    body.querySelectorAll('[data-phonew]').forEach((b) => b.addEventListener('click', () => { c.phoneW = b.dataset.phonew; saveCfg(); dock(); draw(true); }));
    body.querySelector('[data-profile]').addEventListener('change', (e) => { c.profile = e.target.value; saveCfg(); });
    body.querySelectorAll('[data-every]').forEach((b) => b.addEventListener('click', () => { c.every = +b.dataset.every; saveCfg(); R.kick?.(); draw(true); }));
    wireTrCard(body);
    wireDoctor(body);
    const download = (name, data) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    body.querySelectorAll('[data-bak]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.bak === 'chat') { const s2 = store(false); if (s2) download(`meatball-chat-${stamp()}.json`, { kind: 'meatball4-chat', v: VERSION, chat: ctx().getCurrentChatId?.() ?? '', data: s2 }); }
        else download(`meatball-settings-${stamp()}.json`, { kind: 'meatball4-settings', v: VERSION, data: c });
    }));
    body.querySelector('[data-restore]')?.addEventListener('change', async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        try {
            const j = JSON.parse(await f.text());
            if (j?.kind === 'meatball4-chat' && j.data && typeof j.data === 'object') { if (!hasChat()) { toast('채팅을 먼저 열어 주세요.', 'warning'); return; } undo = { kind: 'chat', chat: ctx().getCurrentChatId?.() ?? '', data: structuredClone(ctx().chatMetadata.meatball4 ?? null) }; ctx().chatMetadata.meatball4 = j.data; saveChat(); toast('이 채팅에 기록을 되살렸어요. 「되살리기 전으로」로 되돌릴 수 있어요.'); }
            else if (j?.kind === 'meatball4-settings' && j.data && typeof j.data === 'object') { undo = { kind: 'cfg', data: structuredClone(c) }; const keepOn = c.on; Object.assign(c, j.data, { on: keepOn }); saveCfg(); toast('설정을 되살렸어요. 새로 고침하면 앱 켜짐도 맞춰져요.'); }
            else { toast('미트볼 백업 파일이 아니에요.', 'warning'); return; }
            refresh();
        } catch (x) { toast('파일을 읽지 못했어요.', 'warning'); }
    });
    body.querySelector('[data-undo]')?.addEventListener('click', () => {
        if (!undo) return;
        if (undo.kind === 'chat') { if ((ctx().getCurrentChatId?.() ?? '') !== undo.chat) { toast('되살렸던 그 채팅을 열고 눌러 주세요.', 'warning'); return; } if (undo.data) ctx().chatMetadata.meatball4 = undo.data; else delete ctx().chatMetadata.meatball4; saveChat(); }
        else { for (const k of Object.keys(c)) delete c[k]; Object.assign(c, undo.data); saveCfg(); }
        undo = null; toast('되살리기 전으로 돌렸어요.'); refresh();
    });
    body.querySelector('[data-reread]').addEventListener('click', async (e) => { e.target.disabled = true; e.target.textContent = '읽는 중…'; await E.reread(lastI); draw(true); });
    body.querySelector('[data-wipe]').addEventListener('click', (e) => {
        if (e.target.dataset.sure !== '1') { e.target.dataset.sure = '1'; e.target.textContent = '한 번 더 누르면 지워요'; return; }
        const s2 = store(false); if (s2) { s2.ev = {}; s2.fix = {}; s2.apps = {}; delete s2.tries; saveChat(); }
        toast('이 채팅의 미트볼 기록을 지웠어요.'); refresh();
    });
}

// ── 🌐 screen translation (core feature, off by default) ──
function trCard() {
    const t = trCfg(cfg()), on = t.mode !== 'off';
    const opt = (list, cur) => Object.entries(list).map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
    return kit.card('🌐 화면 번역', `<label class="mb4-label">번역 방식<select class="mb4-input" data-tr="mode">${opt(TR_ENGINES, t.mode)}</select></label>
        ${on ? `<label class="mb4-label">어떤 말로<select class="mb4-input" data-tr="lang">${opt(TR_LANGS, t.lang)}</select></label>
        ${t.mode === 'ai' ? `<label class="mb4-label">번역할 AI 연결<select class="mb4-input" data-tr="profile"><option value="">답을 읽는 AI와 같은 연결</option>${profiles().map((p) => `<option value="${esc(p.id)}" ${p.id === t.profile ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        ${TR_CATS.map((x) => `<label class="mb4-sw"><span><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></span><input type="checkbox" data-trcat="${x.c}" ${t.cats[x.c] ? 'checked' : ''}><i></i></label>`).join('')}` : ''}
        <button class="mb4-btn ghost wide" data-go="tr">📘 용어집 · 번역 목록</button>
        ${kit.hint(on ? (t.mode === 'free' ? '폰 화면 · 상태 줄 · 답 밑 딱지에 보이는 글만 옮겨요. 실리태번 기본 번역을 써서 AI를 부르지 않아요. 저장된 기록과 본편 글은 그대로예요.' : '고른 AI 연결로 옮겨요. 새로 나온 말만 모아서 한 번에 보내요.') : '끄면 번역 코드를 아예 불러오지 않아요.')}`);
}
function wireTrCard(body) {
    const t = trCfg(cfg());
    body.querySelectorAll('[data-tr]').forEach((el) => el.addEventListener('change', () => { t[el.dataset.tr] = el.value; saveCfg(); R.redrawFrame(); draw(true); }));
    body.querySelectorAll('[data-trcat]').forEach((el) => el.addEventListener('change', () => { t.cats[el.dataset.trcat] = el.checked; saveCfg(); R.redrawFrame(); draw(true); }));
}
function drawTr(body) {
    const t = trCfg(cfg());
    body.innerHTML = '<div class="mb4-notr">불러오는 중…</div>';
    import('../st/tr.js').then((T) => {
        if (view !== 'tr') return;
        const G = T.glossLists(), on = t.mode !== 'off', chat = hasChat();
        const D = on && chat ? T.current().dict.entries().reverse() : [], st = on && chat ? T.current().stats : null;
        const CAT = Object.fromEntries(TR_CATS.map((x) => [x.c, x.label]));
        const gRow = (g, where, i) => `<div class="mb4-row"><span class="mb4-row-v"><b>${esc(g.from)}</b> → ${esc(g.to)} <small>${where === 'all' ? '모든 채팅' : '이 채팅'}</small></span><button class="mb4-x" data-gdel="${where}|${i}" aria-label="지우기">✕</button></div>`;
        body.innerHTML = `<div class="mb4-notr">
            ${kit.card('📘 용어집 · 표기 고정', `${[...G.chat.map((g, i) => gRow(g, 'chat', i)), ...G.all.map((g, i) => gRow(g, 'all', i))].join('') || kit.hint('아직 없어요.')}
                <div class="mb4-btnrow"><input class="mb4-input" data-gf="from" maxlength="60" placeholder="원래 말 (예: Harbor)"><input class="mb4-input" data-gf="to" maxlength="60" placeholder="고정할 말 (예: 항구)"></div>
                <div class="mb4-btnrow"><select class="mb4-input" data-gf="where"><option value="chat">이 채팅</option><option value="all">모든 채팅</option></select><button class="mb4-btn" data-gadd ${chat ? '' : 'disabled'}>＋ 넣기</button></div>
                ${kit.hint('용어집에 있는 말은 번역기에 보내지 않고 바로 바꿔요. 영어 낱말은 통째로만 바꿔요 (Leo는 Leon 안에서 안 바뀜). 같은 말이면 이 채팅 것이 먼저예요.')}`)}
            ${on ? kit.card(`🌐 번역 목록 <small>${TR_ENGINES[t.mode]} · ${D.length}개${st?.calls ? ` · 최근 ${st.ms}ms` : ''}</small>`, `
                ${st?.lastError ? `<p class="mb4-hint">⚠ ${esc(st.lastError)}</p>` : ''}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-redo="">🔄 전부 다시</button>${TR_CATS.map((x) => `<button class="mb4-btn ghost sm" data-redo="${x.c}">🔄 ${esc(x.label)}</button>`).join('')}</div>
                ${D.slice(0, 120).map(([s, e]) => `<details class="mb4-tr-item"><summary><b>${esc(s.slice(0, 40))}</b> → ${esc(e.t === s ? '(원문 그대로)' : e.t.slice(0, 40))} <small>${esc(CAT[e.c] ?? e.c)}${e.k ? ' · ✋ 직접 고침' : ''}</small></summary>
                    <input class="mb4-input" data-tfix="${esc(s)}" value="${esc(e.t === s ? '' : e.t)}" placeholder="비우면 원문 그대로">
                    <div class="mb4-btnrow"><button class="mb4-btn sm" data-tact="fix" data-v="${esc(s)}">이대로 (✋ 고정)</button><button class="mb4-btn ghost sm" data-tact="again" data-v="${esc(s)}">이것만 다시</button><button class="mb4-btn ghost sm" data-tact="gloss" data-v="${esc(s)}">용어집에 고정</button><button class="mb4-btn ghost sm" data-tact="keep" data-v="${esc(s)}">원문 그대로</button><button class="mb4-btn ghost sm" data-tact="del" data-v="${esc(s)}">지우기</button></div></details>`).join('') || kit.hint(chat ? '아직 없어요. 새로 나온 말이 생기면 모아서 한 번에 번역해요.' : '채팅을 열면 보여요.')}
                ${D.length > 120 ? kit.hint('최근 120개만 보여요.') : ''}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-tidy>🧹 화면에 없는 번역 정리</button><button class="mb4-btn ghost sm" data-clear>🗑 번역 전체 삭제</button></div>
                ${kit.hint('✋ 직접 고친 번역은 「전부 다시」 · 「전체 삭제」 · 「정리」에서 빠져요. 하나씩 「이것만 다시」는 돼요.')}`) : kit.hint('화면 번역이 꺼져 있어요. ⚙️ 설정의 「🌐 화면 번역」에서 켤 수 있어요. 용어집은 꺼져 있어도 저장돼요.')}
        </div>`;
        const re = () => draw(true);
        body.querySelector('[data-gadd]')?.addEventListener('click', () => { if (T.addGloss(kit.val(body, '[data-gf="from"]'), kit.val(body, '[data-gf="to"]'), kit.val(body, '[data-gf="where"]'))) re(); });
        body.querySelectorAll('[data-gdel]').forEach((b) => b.addEventListener('click', () => { const [w, i] = b.dataset.gdel.split('|'); T.delGloss(w, Number(i)); re(); }));
        body.querySelectorAll('[data-redo]').forEach((b) => b.addEventListener('click', () => { const n = T.redo({ cat: b.dataset.redo || null }); toast(n ? `${n}개 다시 번역해요` : '다시 번역할 게 없어요'); re(); }));
        body.querySelectorAll('[data-tact]').forEach((b) => b.addEventListener('click', () => {
            const s = b.dataset.v, inp = [...body.querySelectorAll('[data-tfix]')].find((x) => x.dataset.tfix === s), v = String(inp?.value ?? '').trim();
            const e = T.current().dict.get(s);
            if (b.dataset.tact === 'fix') T.setOne(s, v || s);
            else if (b.dataset.tact === 'again') T.redo({ src: s });
            else if (b.dataset.tact === 'gloss') { if (T.addGloss(s, v || e?.t || s, 'chat')) T.dropOne(s); }
            else if (b.dataset.tact === 'keep') T.setOne(s, s);
            else if (b.dataset.tact === 'del') T.dropOne(s);
            re();
        }));
        body.querySelector('[data-tidy]')?.addEventListener('click', () => { toast(`안 쓰는 번역 ${T.tidy()}개를 지웠어요`); re(); });
        body.querySelector('[data-clear]')?.addEventListener('click', (e) => { if (e.target.dataset.sure !== '1') { e.target.dataset.sure = '1'; e.target.textContent = '한 번 더 누르면 지워요'; return; } toast(`번역 ${T.clearAll()}개를 지웠어요 (직접 고친 건 남김)`); re(); });
    }).catch((e) => { console.warn('[meatball] translation screen', e); body.innerHTML = kit.empty('⚠', '번역 화면을 열지 못했어요'); });
}

// ── 🩺 self-check and 📋 copyable report (all three generations had both) ──
function checks() {
    const E = R.engine, s = E.stats, c = cfg(), st = store(false), out = [];
    const add = (lv, t, sub = '') => out.push({ lv, t, sub });
    add(c.on ? 'ok' : 'bad', c.on ? '미트볼이 켜져 있어요' : '미트볼이 꺼져 있어요');
    if (c.paused) add('bad', '전체 멈춤 중이에요', '⚙️ 맨 위에서 풀 수 있어요');
    if (st?.off) add('bad', '이 채팅에서 꺼 두었어요');
    add(R.active().length ? 'ok' : 'mid', `켠 앱 ${R.active().length}개`, R.active().map((a) => a.name ?? a.id).join(' · '));
    const keys = E.reg.keys().length;
    add('ok', keys ? `답마다 읽는 항목 ${keys}개` : '답을 읽을 필요가 없어요 (AI 안 부름)');
    if (keys) add(c.profile ? 'ok' : 'mid', c.profile ? '읽는 AI: 따로 고른 연결' : '읽는 AI: 본편과 같은 연결', c.profile ? '' : '빠르고 싼 연결을 고르면 좋아요');
    if (String(s.status).startsWith('error')) add('bad', '마지막 읽기가 실패했어요', String(s.status).slice(0, 160));
    else if (s.status) add('ok', `마지막 읽기: ${s.status}`);
    const q = R.queueState?.(); if (q?.waitMs > 0) add('mid', `쉬는 중 · ${Math.ceil(q.waitMs / 1000)}초 뒤 다시`, `연달아 실패 ${q.fails}번`);
    const left = hasChat() ? E.unreadCount() : 0; if (left > 1) add('mid', `안 읽은 답 ${left}개`, '홈의 「한 번에 읽기」로 채울 수 있어요');
    if (s.dropped) add(s.dropped > s.kept ? 'mid' : 'ok', `받은 줄 ${s.kept} · 버린 줄 ${s.dropped}`, s.lastDropped?.slice(0, 3).map((d) => d.why).join(' · ') ?? '');
    const t = trCfg(c); add('ok', `화면 번역: ${TR_ENGINES[t.mode]}`);
    return out;
}
function report() {
    const E = R.engine, s = E.stats, c = cfg();
    const mask = (x) => String(x ?? '').replace(/(sk-|key[=:]\s*|token[=:]\s*|Bearer\s+)[A-Za-z0-9._-]{6,}/gi, '$1***').replace(/https?:\/\/[^\s)]+/g, '(주소)');
    const n = E.note();
    const guard = (t) => String(t ?? '').split('\n').map((l) => (/Guarded \[/.test(l) ? '(지키는 비밀 — 가림)' : l)).join('\n');
    return [`미트볼 ${VERSION} 오류 보고`, `앱: ${R.active().map((a) => a.id).join(', ') || '없음'}`, `읽는 항목: ${E.reg.keys().map((k) => k.id).join(', ')}`,
        `상태: ${s.status || '-'} · 읽기 ${s.calls} · 받음 ${s.kept} · 버림 ${s.dropped}`, `멈춤: ${!!c.paused} · 번역: ${trCfg(c).mode}`,
        '— 점검 —', ...checks().map((x) => `[${x.lv}] ${x.t}${x.sub ? ` (${x.sub})` : ''}`),
        '— 버린 줄 —', ...(s.lastDropped ?? []).map((d) => `${d.raw} (${d.why})`),
        '— 마지막 읽은 답 —', guard(s.lastAnswer || '-'),
        '— 쪽지 —', guard([n.state, n.now].filter(Boolean).join('\n') || '-')].map(mask).join('\n');
}
function doctorCard() {
    const ic = { ok: '✅', mid: '🟡', bad: '⛔' };
    return `<details class="mb4-card"><summary>🩺 자가 진단 · 📋 오류 보고</summary>
        ${checks().map((x) => `<div class="mb4-row"><span class="mb4-row-k">${ic[x.lv]} ${esc(x.t)}</span>${x.sub ? `<span class="mb4-row-v"><small>${esc(x.sub)}</small></span>` : ''}</div>`).join('')}
        <button class="mb4-btn wide" data-report>📋 오류 보고 복사</button>
        ${kit.hint('키 · 주소는 저절로 가려요. 지키는 비밀 글은 넣지 않아요.')}</details>`;
}
function wireDoctor(body) {
    body.querySelector('[data-report]')?.addEventListener('click', async () => {
        const t = report();
        try { await navigator.clipboard.writeText(t); toast('복사했어요. 그대로 붙여 넣어 보내 주세요.'); }
        catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); try { document.execCommand('copy'); toast('복사했어요.'); } catch (e2) { toast('복사하지 못했어요.', 'warning'); } a.remove(); }
    });
}
