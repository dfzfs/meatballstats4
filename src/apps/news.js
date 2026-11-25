// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };

// 📰 News: on a tap, a few items from the story's world, written by the model. Not sent on unless asked.
// Ported from the second generation's world-news kinds: 📰 news (the wider world), 💬 rumours (what goes around the
// neighbourhood, school or office), 📱 feed (short posts the characters put online, with likes worked out in code),
// 🌙 off-screen (what someone did while not on the page). The person picks which kinds; default news + off-screen.
import { optList } from '../ui/kit.js';
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const KINDS_BASE = [
    { id: 'world', icon: '📰', name: '뉴스', ai: 'a news item from the wider world, off-screen, not caused by the main characters' },
    { id: 'rumor', icon: '💬', name: '소문', ai: 'a rumour going around the neighbourhood, school or workplace' },
    { id: 'feed', icon: '📱', name: '피드', ai: 'a short social-media post by one of the characters, written as they would post it (Name | post)' },
    { id: 'life', icon: '🌙', name: '화면 밖', ai: 'what one of the characters did off-screen recently (Name | what they did)' },
];
let KINDS = KINDS_BASE;
const DEF = { world: true, rumor: false, feed: false, life: true };
const on = (st) => ({ ...DEF, ...(st.kinds ?? {}) });
// a feed card's reactions, decided in code from the text (same text, same numbers)
const likes = (t) => ({ like: 3 + (hash(t) % 97), talk: hash(`${t}!`) % 23 });
const itemsOf = (st) => (Array.isArray(st.items) ? st.items : []).map((x) => (typeof x === 'string' ? { k: 'world', t: x } : x)).filter((x) => x?.t);

export default {
    _t: { likes },   // for tests only; not part of the app contract
    api: 1, id: 'news', name: '소식', icon: '📰', color: '#6c7a89', cost: 'tap',
    desc: '누르면 이야기 속 세상의 소식 몇 줄을 만들어 줘요. 원하면 소문으로 이야기에 흘려 넣어요.',
    note: (_s, env) => { const L = itemsOf(env.store); return L.length && env.store.tell ? { state: [`Talk going around in the background (may be overheard, never the focus): ${L.slice(0, 3).map((x) => clip(x.who ? `${x.who}: ${x.t}` : x.t, 120)).join(' / ')}.`] } : null; },
    widget: (_s, env) => (KINDS = optList(env.cfg, 'kinds', KINDS_BASE), itemsOf(env.store)).slice(0, 2).map((x) => `<div class="mb4-row"><span class="mb4-row-v">${KINDS.find((k) => k.id === x.k)?.icon ?? '📰'} ${esc(clip(x.who ? `${x.who}: ${x.t}` : x.t, 70))}</span></div>`).join(''),
    widgetTitle: '세상 소식',
    render(el, api) {
        KINDS = optList(api.cfg, 'kinds', KINDS_BASE);
        const st = api.store, k = api.kit, K = on(st), L = itemsOf(st), tab = st._tab ?? 'all';
        const shown = L.filter((x) => tab === 'all' || x.k === tab);
        const card = (x) => x.k === 'feed' ? `<div class="mb4-quote"><b>${k.face(x.who)} ${esc(x.who || '누군가')}</b><q>${esc(x.t)}</q><small class="mb4-dim">♥ ${likes(x.t).like} · 💬 ${likes(x.t).talk}</small></div>`
            : `<div class="mb4-quote">${KINDS.find((y) => y.id === x.k)?.icon ?? '📰'} ${x.who ? `<b>${esc(x.who)}</b> ` : ''}${esc(x.t)}</div>`;
        el.innerHTML = `<div class="mb4-btnrow tight" style="margin-bottom:8px">${[['all', '전체'], ...KINDS.map((x) => [x.id, x.icon])].map(([id, n]) => `<button class="mb4-btn ${tab === id ? '' : 'ghost '}sm" data-act="tab" data-v="${id}">${n}</button>`).join('')}</div>
        ${shown.length ? k.card('오늘의 소식', shown.map(card).join('')) : k.empty('📰', '아직 소식이 없어요', '버튼을 누르면 이 세계의 소식을 만들어요')}
        <button class="mb4-btn wide" data-act="get">📰 새 소식 받기 (AI 1회)</button>
        ${k.card('받을 종류', `<div class="mb4-chips">${KINDS.map((x) => `<button class="mb4-btn ${K[x.id] ? '' : 'ghost '}sm" data-act="kind" data-v="${x.id}">${x.icon} ${x.name}</button>`).join('')}</div>
            <label class="mb4-sw"><span><b>소문으로 흘려 넣기</b><small>본편 AI가 배경 이야기로 알아요</small></span><input type="checkbox" data-act="tell" ${st.tell ? 'checked' : ''}><i></i></label>`)}
        ${k.optCard(api.cfg, 'kinds', KINDS_BASE, { title: '소식 종류', aiLabel: '어떤 소식인지 (예: a weather report from the radio)' })}`;
        k.optWire(el, api.cfg, () => { api.save(); api.redraw(); });
        k.acts(el, {
            tab: (v) => { st._tab = v; api.redraw(); },
            tell: (_v, c) => { st.tell = c.checked; api.save(); },
            kind: (id) => { st.kinds = { ...on(st), [id]: !on(st)[id] }; api.save(); api.redraw(); },
            get: async (_v, b) => {
                b.disabled = true; b.textContent = '받는 중…';
                const kinds = KINDS.filter((x) => K[x.id]);
                if (!kinds.length) { api.toast('받을 종류를 하나 이상 골라 주세요.'); api.redraw(); return; }
                const cast = [...new Set([...(api.env.peek('scene')?.with ?? []), ...Object.keys(api.env.peek('people')?.list ?? {})])].filter((n) => n !== api.env.user).slice(0, 8);
                const answer = await api.ask(`Write four short items from the world of an ongoing story, one per line, each starting with its kind:\n${kinds.map((x) => `${x.id}: ${x.ai}`).join('\n')}\n\n[What is known]\n${api.facts() || '(nothing recorded)'}\n\n[Latest part of the story]\n${clip(api.env.recent(1)[0] ?? '', 1500)}\n\n[Characters]\n${cast.join(', ') || '(any)'}\n\nUnder 25 words each, fitting the setting and its tone, in the same language as the story. Format: kind | text   or, for feed and life: kind | Name | text. Four lines only.`, 360);
                const got = answer.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').split('|').map((x) => x.trim())).filter((p) => p.length >= 2).map((p) => {
                    const kd = KINDS.find((x) => x.id === p[0].toLowerCase())?.id ?? 'world';
                    return p.length >= 3 && (kd === 'feed' || kd === 'life') ? { k: kd, who: clip(p[1], 30), t: clip(p.slice(2).join(' '), 200) } : { k: kd, t: clip(p.slice(1).join(' '), 200) };
                }).filter((x) => x.t.length > 4 && K[x.k]).slice(0, 4);
                if (got.length) { st.items = [...got, ...L].slice(0, 30); } else api.toast('소식을 받지 못했어요. 잠시 뒤 다시 해 보세요.');
                api.save(); api.redraw();
            },
        });
    },
};
