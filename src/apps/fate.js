// 🃏 Fate: curses, blessings and event cards. Drawn in code on a tap (no model call); a drawn card rides with the
// next replies for as long as it lasts (counted in replies), then burns out by itself. One card at a time.
import { esc, card, hint, acts, empty, pill, bar } from '../ui/kit.js';

// kind, icon, name, Korean blurb, line for the model, how many replies it lasts
const DECK = [
    ['bless', '🌟', '뜻밖의 호의', '낯선 사람이 선뜻 도와줘요.', 'Blessing in effect: strangers and acquaintances are unusually willing to help the user character — a favour offered, a door held, a price lowered.', 4],
    ['bless', '🍀', '손에 붙는 날', '하는 일이 손에 잘 붙어요.', 'Blessing in effect: the user character\'s hands and timing are good — small tasks go smoothly, a guess turns out right.', 4],
    ['bless', '💬', '말이 통하는 날', '하려던 말이 제대로 전해져요.', 'Blessing in effect: what the user character means gets across — people hear it the way it was meant.', 3],
    ['bless', '🧭', '길이 열림', '막힌 일에 샛길이 보여요.', 'Blessing in effect: where the user character is stuck, a side way opens — a hint, a person who knows, a forgotten option.', 3],
    ['curse', '🕳', '엇갈림', '약속과 시간이 자꾸 어긋나요.', 'Curse in effect: timing keeps slipping for the user character — arriving a moment late, just missing someone, a message read too late.', 4],
    ['curse', '🧵', '풀리는 실밥', '가진 것이 하나씩 말썽이에요.', 'Curse in effect: the user character\'s things misbehave — a strap snaps, a pen dies, a lock sticks. Small, annoying, never dangerous.', 4],
    ['curse', '🌫', '오해', '한 말이 다르게 들려요.', 'Curse in effect: something the user character says or does is taken the wrong way once, by someone whose opinion matters.', 3],
    ['curse', '🪙', '새는 주머니', '돈이 자꾸 나가요.', 'Curse in effect: small costs keep finding the user character — a fee, a fine, something that must be replaced.', 4],
    ['event', '📨', '뜻밖의 소식', '멀리서 소식이 와요.', 'Event card: in this reply, unexpected news reaches the scene — a letter, a call, a rumour — that concerns someone present.', 1],
    ['event', '🚪', '찾아온 손님', '누군가 문을 두드려요.', 'Event card: in this reply, someone arrives uninvited — known or unknown — with a reason of their own.', 1],
    ['event', '⛈', '날씨의 심술', '날씨가 계획을 바꿔요.', 'Event card: in this reply, the weather turns and forces a change of plan — shelter, delay, a detour.', 1],
    ['event', '🔎', '주운 것', '바닥에서 뭔가 눈에 띄어요.', 'Event card: in this reply, the user character notices something small that was left or lost — and it belongs to a story of its own.', 1],
    ['event', '🕯', '정전', '불이 꺼지고 조용해져요.', 'Event card: in this reply, the lights or the noise go out for a while; what people do in the quiet shows who they are.', 1],
    ['event', '🎭', '뒤바뀐 자리', '평소와 반대 입장이 돼요.', 'Event card: in this reply, roles flip for a moment — the one who usually helps needs help, the quiet one speaks first.', 1],
];
const KIND = { bless: ['축복', 'good'], curse: ['저주', 'bad'], event: ['사건', ''] };

export default {
    api: 1, id: 'fate', name: '운명', icon: '🃏', color: '#3d348b', cost: 'zero',
    desc: '축복 · 저주 · 사건 카드를 뽑아요. 뽑은 카드는 몇 답 동안 이야기에 스며들다 저절로 꺼져요. AI를 부르지 않아요.',
    note(_S, env) { const c = env.store.now; return c && c.left > 0 ? { now: [`${DECK[c.n][4]} Weave it in naturally; never name the card.`] } : null; },
    onReply(env) {
        const st = env.store, c = st.now, again = env.gen === 'swipe' || env.gen === 'regenerate';
        if (!c) {
            // «저절로 뽑히게»: about ten quiet replies after the last card, code draws one
            if (!env.cfg.auto || again) return false;
            st.idle = (st.idle ?? 0) + 1;
            if (st.idle >= 10) { const pool = DECK.map((x, n) => [x, n]).filter(([x]) => env.cfg.kinds?.[x[0]] !== false); if (pool.length) { const [x, n] = pool[Math.floor(Math.random() * pool.length)]; st.now = { n, left: x[5], day: env.peek?.('scene')?.day ?? null }; } st.idle = 0; }
            return true;
        }
        if (again) return false;   // the same reply written again: the card is not spent twice
        c.left -= 1;
        if (c.left <= 0) { (st.past ??= []).push({ n: c.n, day: c.day }); if (st.past.length > 20) st.past.shift(); st.now = null; }
        return true;
    },
    hud: (_S, env) => { const c = env.store.now; return c ? [`${DECK[c.n][1]} ${c.left}`] : []; },
    widget: (_S, env) => { const c = env.store.now; return c ? `<div class="mb4-row"><span class="mb4-row-k">${DECK[c.n][1]} ${esc(DECK[c.n][2])}</span><span class="mb4-row-v">${c.left}답 남음</span></div>` : ''; },
    widgetTitle: '지금 걸린 운명',
    render(el, api) {
        const st = api.store, cfg = api.cfg, c = st.now, d = c ? DECK[c.n] : null;
        cfg.kinds = cfg.kinds && typeof cfg.kinds === 'object' ? cfg.kinds : {};
        const okKind = (k) => cfg.kinds[k] !== false;
        el.innerHTML = `${d ? `<div class="mb4-hero mb4-center"><div class="mb4-hero-n">${d[1]}</div><div class="mb4-big">${esc(d[2])}</div><p>${esc(d[3])}</p>${pill(KIND[d[0]][0], KIND[d[0]][1])}<div style="margin-top:8px">${bar((c.left / d[5]) * 100, d[0] === 'curse' ? 'bad' : 'good')}</div><small>${c.left}답 남음</small></div>
            <div class="mb4-btnrow"><button class="mb4-btn ghost wide" data-act="drop">🔥 카드 태우기 (지금 끝내기)</button></div>`
        : `<div class="mb4-hero mb4-center"><div class="mb4-hero-n">🃏</div><div class="mb4-big">운명의 카드</div><small>한 번에 한 장만 걸려요</small></div>
            <button class="mb4-btn wide" data-act="draw">🃏 한 장 뽑기 (AI 0회)</button>`}
        ${card('뽑을 종류', `<div class="mb4-chips">${Object.entries(KIND).map(([k, [n]]) => `<button class="mb4-btn ${okKind(k) ? '' : 'ghost '}sm" data-act="kind" data-v="${k}">${n}</button>`).join('')}</div>
            <label class="mb4-sw"><span><b>저절로 뽑히게</b><small>카드가 꺼지고 답이 열 번쯤 지나면 코드가 한 장 뽑아요</small></span><input type="checkbox" data-act="auto" ${cfg.auto ? 'checked' : ''}><i></i></label>`)}
        ${(st.past ?? []).length ? card('지나간 카드', st.past.slice().reverse().slice(0, 8).map((p) => `<div class="mb4-row mb4-dim"><span class="mb4-row-v">${DECK[p.n][1]} ${esc(DECK[p.n][2])} <small>${KIND[DECK[p.n][0]][0]}${p.day ? ` · ${p.day}일째` : ''}</small></span></div>`).join('')) : ''}
        ${!d && !(st.past ?? []).length ? empty('🃏', '아직 뽑은 카드가 없어요') : ''}
        ${hint('축복 · 저주는 서너 답 동안, 사건은 바로 다음 답 한 번이에요. 같은 답을 다시 뽑아도 카드는 줄지 않아요.')}`;
        const draw = () => { const pool = DECK.map((x, n) => [x, n]).filter(([x]) => okKind(x[0])); if (!pool.length) { api.toast('뽑을 종류를 하나는 켜 주세요.'); return; } const [x, n] = pool[Math.floor(Math.random() * pool.length)]; st.now = { n, left: x[5], day: api.env.peek('scene')?.day ?? null }; st.idle = 0; api.save(); api.redraw(); };
        acts(el, {
            draw,
            drop: () => { st.now = null; api.save(); api.redraw(); },
            kind: (k) => { cfg.kinds[k] = cfg.kinds[k] === false; api.save(); api.redraw(); },
            auto: (_v, b) => { cfg.auto = b.checked; api.save(); },
        });
    },
};
