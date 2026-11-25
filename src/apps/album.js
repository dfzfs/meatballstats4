// 🏆 Album: achievements worked out by code from what the other apps already know (read-only), and moments the
// person keeps by tapping. No reader key, no model call, nothing sent to any model. An achievement, once earned,
// stays (the day it was earned is kept); a swiped-away reply does not take it back.
import { clip, cleanText } from '../core/text.js';
import { esc, card, hint, acts, empty } from '../ui/kit.js';

// id, icon, name, how to get it (shown), test(ctx) -> true when earned
const ACH = [
    ['day7', '🗓', '한 주', '이야기 속 7일째가 되기', (c) => (c.scene?.day ?? 0) >= 7],
    ['day30', '📆', '한 달', '이야기 속 30일째가 되기', (c) => (c.scene?.day ?? 0) >= 30],
    ['wander', '🧭', '방랑자', '다른 장소 5곳 지나기', (c) => new Set((c.scene?.trail ?? []).map((t) => t.loc)).size >= 5 || Object.keys(c.map?.P ?? {}).length >= 5],
    ['cartog', '🗺', '지도 제작자', '지도에 장소 12곳', (c) => Object.keys(c.map?.P ?? {}).length >= 12],
    ['crowd', '👥', '마당발', '인물 10명 만나기', (c) => Object.keys(c.people?.list ?? {}).length >= 10],
    ['close', '🤝', '가까워짐', '누군가와 관계가 한 단계 이상 깊어지기', (c) => Object.values(c.bonds?.pairs ?? {}).some((p) => (p.lvl ?? 0) >= 2)],
    ['lovers', '💞', '연인', '누군가와 연인이 되기', (c) => Object.values(c.bonds?.pairs ?? {}).some((p) => /lover|couple|dating|연인|애인|사귀/i.test(p.tie ?? ''))],
    ['ring', '💍', '평생', '약혼이나 결혼', (c) => Object.values(c.bonds?.pairs ?? {}).some((p) => /engaged|married|약혼|부부|결혼/i.test(p.tie ?? ''))],
    ['word', '📌', '지킨 약속', '약속 하나 지키기', (c) => (c.todo?.closed ?? []).some((p) => (p.st ?? 'kept') === 'kept')],
    ['word5', '🏅', '믿을 만한 사람', '약속 다섯 개 지키기', (c) => (c.todo?.closed ?? []).filter((p) => (p.st ?? 'kept') === 'kept').length >= 5],
    ['rich', '💰', '두둑한 지갑', '돈이 처음보다 두 배 넘게', (c) => c.wallet && (c.wallet.cash ?? 0) > 0 && (c.wallet.cash ?? 0) >= 2 * Math.max(1, c.walletStart ?? 0) && (c.walletStart ?? 0) > 0],
    ['broke', '🪙', '빈털터리', '돈이 0이 되기', (c) => c.wallet && (c.wallet.cash ?? 1) <= 0 && (c.walletStart ?? 0) > 0],
    ['collector', '🎒', '수집가', '가방에 물건 10개', (c) => (c.wallet?.items?.length ?? 0) >= 10],
    ['secret', '🔓', '드러난 진실', '지켜 온 비밀 하나가 열리기', (c) => (c.secrets?.ev ?? []).some((e) => /revealed|opens|settled/.test(String(e?.kind ?? e?.k ?? e)))],
    ['crit', '🎲', '대성공', '주사위 20', (c) => (c.diceStore?.hist ?? []).some((h) => h.n === 20)],
    ['fumble', '💥', '대실패', '주사위 1', (c) => (c.diceStore?.hist ?? []).some((h) => h.n === 1)],
    ['survive', '🩹', '버텨 냄', '생활 욕구가 바닥났다가 다시 차기', (c) => !!c.self.lowSeen && c.life && Math.min(c.life.food ?? 100, c.life.rest ?? 100) >= 60],
    ['moments', '📸', '추억 다섯', '앨범에 장면 5개 남기기', (c) => (c.self.shots ?? []).length >= 5],
];
function ctxOf(env) {
    const p = (id) => env.peek?.(id) ?? null, s = (id) => env.peekStore?.(id) ?? null;
    return { scene: p('scene'), map: p('map'), people: p('people'), bonds: p('bonds'), todo: p('todo'), wallet: p('wallet'), walletStart: Number(s('wallet')?.startCash) || 0, secrets: p('secrets'), life: p('life'), diceStore: s('dice'), self: env.store };
}
// -> ids newly earned this time
function check(env) {
    const st = env.store, c = ctxOf(env), got = (st.got ??= {}), fresh = [];
    if (c.life && Math.min(c.life.food ?? 100, c.life.rest ?? 100) <= 10) st.lowSeen = true;
    for (const [id, , , , test] of ACH) { if (got[id]) continue; let ok = false; try { ok = !!test(c); } catch (e) { ok = false; } if (ok) { got[id] = { day: c.scene?.day ?? null, at: Date.now() }; fresh.push(id); } }
    return fresh;
}

export default {
    api: 1, id: 'album', name: '앨범', icon: '🏆', color: '#ffb703', cost: 'zero',
    desc: '이야기에서 이룬 것(업적)이 저절로 모이고, 마음에 드는 장면을 눌러서 남겨요. AI를 부르지 않아요.',
    onReply(env) { const f = check(env); if (f.length) { env.store.news = f; return true; } return false; },
    hud: (_s, env) => (env.store.news?.length ? [`🏆 ${ACH.find((a) => a[0] === env.store.news[0])?.[2] ?? ''}`] : []),
    widget: (_s, env) => { const got = env.store.got ?? {}; const n = Object.keys(got).length; return `<div class="mb4-row"><span class="mb4-row-k">🏆 업적</span><span class="mb4-row-v">${n} / ${ACH.length}${env.store.news?.length ? ` · 새로 ${env.store.news.length}개` : ''}</span></div>${(env.store.shots ?? []).length ? `<div class="mb4-row"><span class="mb4-row-k">📸 추억</span><span class="mb4-row-v">${env.store.shots.length}장</span></div>` : ''}`; },
    render(el, api) {
        const st = api.store, env = api.env;
        check(env);
        const got = st.got ?? {}, news = new Set(st.news ?? []);
        st.shots = Array.isArray(st.shots) ? st.shots : [];
        const tab = st._tab === 'shots' ? 'shots' : 'ach';
        const sc = env.peek('scene');
        el.innerHTML = `<div class="mb4-btnrow tight" style="margin-bottom:10px"><button class="mb4-btn ${tab === 'ach' ? '' : 'ghost '}sm" data-act="tab" data-v="ach">🏆 업적 ${Object.keys(got).length}/${ACH.length}</button><button class="mb4-btn ${tab === 'shots' ? '' : 'ghost '}sm" data-act="tab" data-v="shots">📸 추억 ${st.shots.length}</button></div>
        ${tab === 'ach' ? `<div class="mbx-ach">${ACH.map(([id, ic, name, how]) => `<div class="mbx-a${got[id] ? ' on' : ''}${news.has(id) ? ' new' : ''}"><span>${got[id] ? ic : '🔒'}</span><b>${esc(name)}</b><small>${got[id] ? `${got[id].day ? `${got[id].day}일째` : '달성'}` : esc(how)}</small></div>`).join('')}</div>
            ${hint('다른 앱이 이미 아는 것으로만 셈해요. 꺼 둔 앱의 업적은 그 앱을 켜야 열려요.')}`
        : `<button class="mb4-btn wide" data-act="shot">📸 방금 장면 남기기</button>
            <input class="mb4-input" data-f="cap" maxlength="60" placeholder="한 줄 제목 (비워도 돼요)" style="margin-top:6px">
            ${st.shots.length ? st.shots.slice().reverse().map((x, n) => card(`${esc(x.cap || `${x.day ?? '?'}일째`)}${x.loc ? ` <small>📍 ${esc(x.loc)}</small>` : ''}`, `<p class="mbx-shot">${esc(x.text)}</p><div class="mb4-btnrow tight"><small class="mb4-dim" style="flex:1">${x.day ? `${x.day}일째` : ''}${x.with?.length ? ` · 👥 ${esc(x.with.join(', '))}` : ''}</small><button class="mb4-x" data-act="del" data-v="${st.shots.length - 1 - n}" aria-label="지우기">✕</button></div>`)).join('') : empty('📸', '아직 남긴 장면이 없어요', '마음에 드는 답이 오면 눌러서 남겨요')}`}`;
        if (news.size) { st.news = []; api.save(); }
        if (tab === 'shots') api.kit.editMore(el, api, [
            { name: 'cap', list: st.shots, label: (x) => `제목 · ${x.day ?? '?'}일째`, get: (x) => x.cap || '', set: (x, t) => { x.cap = t.slice(0, 60); } },
            { name: 'text', list: st.shots, rows: 4, label: (x) => `장면 글 · ${x.cap || `${x.day ?? '?'}일째`}`, get: (x) => x.text, set: (x, t) => { x.text = t.slice(0, 900); }, del: false },
        ]);
        acts(el, {
            tab: (v) => { st._tab = v; api.save(); api.redraw(); },
            shot: () => {
                const t = cleanText(env.recent(1)[0] ?? '');
                if (!t) { api.toast('남길 답이 없어요.'); return; }
                const cap = el.querySelector('[data-f="cap"]')?.value.trim() ?? '';
                st.shots.push({ text: clip(t, 900), cap: clip(cap, 60), day: sc?.day ?? null, loc: String(sc?.loc ?? '').split('>').pop().trim(), with: (sc?.with ?? []).slice(0, 6), at: Date.now() });
                if (st.shots.length > 60) st.shots.shift();
                check(env); api.save(); api.redraw(); api.toast('📸 남겼어요.');
            },
            del: (n) => { st.shots.splice(+n, 1); api.save(); api.redraw(); },
        });
    },
    css: '.mbx-ach{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mbx-a{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:14px;background:var(--card);text-align:center;opacity:.55}.mbx-a.on{opacity:1;box-shadow:0 2px 8px rgba(120,70,50,.1)}.mbx-a.new{outline:2px solid #ffb703}.mbx-a span{font-size:24px}.mbx-a b{font-size:12.5px}.mbx-a small{font-size:10.5px;color:var(--sub);line-height:1.3}.mbx-shot{white-space:pre-wrap;font-size:13px;line-height:1.55;max-height:180px;overflow-y:auto;margin:0}',
};
