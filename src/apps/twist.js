// 🌀 Story devices: small machines that make the story move by itself. No reader key and no model call: code
// decides (with a dice of its own) in which reply a device is due, and only then does one line go with that reply.
// At most ONE event device speaks per reply, so lines never pile up. A reroll of the same reply gets the same
// devices again (the dice is tied to the count of replies, not to the clock).
import { esc, card, bar, hint, acts, val } from '../ui/kit.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const reroll = (env) => env.gen === 'swipe' || env.gen === 'regenerate';
const DAY = 864e5;
const RATES = [[0.5, '드물게'], [1, '보통'], [1.8, '자주']];

// kind: 'event' (one per reply, by this order) | 'side' (rides along freely)
const DEV = [
    { id: 'bomb', kind: 'event', icon: '⏳', name: '예고된 사건', desc: '내가 적은 사건이 정한 답 수 뒤에 터져요. 가까워지면 조짐이 먼저 보여요.' },
    { id: 'tension', kind: 'event', icon: '🎬', name: '긴장도', desc: '잔잔한 답이 이어지면 긴장이 차올라 사건이 하나 생기고, 그 뒤 세 답은 숨 돌리는 구간이에요.' },
    { id: 'debt', kind: 'event', icon: '🎲', name: '운명의 빚', desc: '다시 뽑을 때마다 빚이 1 쌓이고, 5가 되면 다음 답에 작은 불운으로 갚아요.' },
    { id: 'chance', kind: 'event', icon: '🚪', name: '우연한 만남', desc: '가끔, 지금 장면에 없는 아는 사람이 우연히 스쳐요.', gap: 8, p: 22 },
    { id: 'world', kind: 'event', icon: '🌍', name: '바깥 세상', desc: '가끔, 장면 밖에서 벌어진 일의 흔적(소리 · 소식 · 연락)이 닿아요.', gap: 10, p: 20 },
    { id: 'weather', kind: 'event', icon: '🌦', name: '날씨 변덕', desc: '가끔 날씨가 바뀌어요. 계절에 맞게요.', gap: 12, p: 25 },
    { id: 'callback', kind: 'event', icon: '🧵', name: '복선 줍기', desc: '가끔, 예전에 스쳐 간 작은 것(누군가의 버릇 · 지나온 곳)을 한 번 다시 꺼내요.', gap: 9, p: 25 },
    { id: 'sense', kind: 'event', icon: '🍃', name: '생활의 결', desc: '가끔, 그 장소의 소리 · 냄새 · 작은 일상을 한 줄 넣어요.', gap: 6, p: 30 },
    { id: 'loop', kind: 'side', icon: '🔁', name: '기시감', desc: '같은 답을 두 번 넘게 다시 뽑으면, 누군가 희미한 기시감을 느낄 수 있어요.' },
    { id: 'away', kind: 'side', icon: '🕰', name: '오랜만이야', desc: '실제로 하루 가까이 안 오면 인물이 한 번 반응해요.' },
];
const LINES = {
    loop: (n) => `Déjà vu: the user has already lived this exact moment ${n} times and rewound it. No character can know that, but one of them may feel a faint déjà vu once — a pause, a half-remembered line. Do not explain it.`,
    debt: 'Fate collects: in this reply something small but unlucky happens to the user\'s character — bad timing, a mishap, a minor loss. Proportionate, never catastrophic, woven into the scene.',
    tension: 'Pacing: it has been calm for a long while. Introduce a real complication in this reply — an interruption, bad news, a rival, a discovery — that fits the scene and demands a reaction.',
    calm: 'Pacing: a big moment just passed. Keep this reply a breather — quieter, room for the characters to react and talk.',
    away: (d) => `Absence: the user has been gone for about ${d < 1.5 ? 'a day' : `${Math.round(d)} days`}. A character who would notice may remark on it once, in a way that fits the story.`,
    chance: (who) => (who ? `Chance: ${who}, who is not in this scene, may plausibly cross paths with it now — a glimpse, a call, walking in. Only if the place allows it; otherwise let an unknown passer-by matter for a moment.` : 'Chance: someone unexpected crosses this scene for a moment — a stranger, a clerk, an old acquaintance — and leaves a small mark on it.'),
    world: 'Offscreen: the wider world has moved on by itself. Let one trace of it reach this scene — a noise outside, a piece of news, a message — without taking the scene over.',
    weather: (w) => `Weather: it changes during this reply${w ? ` (it was: ${w})` : ''} — to something that fits the season and place. Let it touch what people do.`,
    callback: (what) => `Thread: bring back, once and in passing, this small earlier detail — ${what}. No explanation, just let it be noticed.`,
    sense: 'Texture: one concrete line of everyday life in this place — a sound, a smell, something ordinary happening nearby.',
    bombNear: (t, n) => `Foreshadow: in about ${n} repl${n === 1 ? 'y' : 'ies'} this will happen — «${t}». Do not make it happen yet; show one small sign that it is coming.`,
    bombNow: (t) => `It happens now, in this reply: «${t}». Make it land fully and let the characters react.`,
};
const rate = (env) => Number(env.cfg.rate) || 1;
const roll = (env, salt) => hash(`${env.store.seed ?? ''}|${env.store.tick ?? 0}|${salt}`) % 100;
// Which event device (if any) is due for the reply about to be written. -> id or ''
function pick(env) {
    const on = env.cfg.on ?? {}, st = env.store, since = st.since ?? {};
    if (on.bomb && st.bomb?.text && (st.bomb.left ?? 0) <= 0) return 'bomb';
    if (on.tension && (st.t ?? 0) >= 100) return 'tension';
    if (on.debt && (st.debt ?? 0) >= 5) return 'debt';
    if ((st.calm ?? 0) > 0) return '';                                   // breather: no surprise on top
    for (const d of DEV) if (d.gap && on[d.id] && (since[d.id] ?? d.gap) >= d.gap / rate(env) && roll(env, d.id) < d.p * rate(env)) return d.id;
    return '';
}
function lineOf(id, env) {
    const st = env.store;
    if (id === 'bomb') return LINES.bombNow(st.bomb.text);
    if (id === 'chance') {
        const here = new Set(env.peek?.('scene')?.with ?? []), P = env.peek?.('people')?.list ?? {};
        const away = Object.values(P).filter((p) => p?.name && !p.gone && !here.has(p.name) && p.name !== env.user);
        return LINES.chance(away.length ? away[roll(env, 'who') % away.length].name : '');
    }
    if (id === 'weather') return LINES.weather(env.peek?.('scene')?.weather ?? '');
    if (id === 'callback') {
        const pool = [], seeds = env.peek?.('people')?.seeds ?? {};
        for (const [who, list] of Object.entries(seeds)) for (const s of Array.isArray(list) ? list : [list]) { const v = typeof s === 'string' ? s : s?.v; if (v) pool.push(`${who}: ${v}`); }
        for (const t of (env.peek?.('scene')?.trail ?? []).slice(0, -2)) if (t?.loc) pool.push(`the place "${t.loc}"`);
        return pool.length ? LINES.callback(pool[roll(env, 'cb') % pool.length]) : '';
    }
    return typeof LINES[id] === 'string' ? LINES[id] : '';
}

export default {
    api: 1, id: 'twist', name: '이야기 장치', icon: '🌀', color: '#118ab2', cost: 'zero',
    desc: '이야기가 알아서 조금씩 출렁이게 하는 장치 열 가지. AI를 따로 부르지 않고, 때가 된 답에만 한 줄이 가요.',
    note(_s, env) {
        const on = env.cfg.on ?? {}, st = env.store, now = [], last = env.last ?? 0, again = reroll(env);
        const id = again ? (st.fired ?? '') : pick(env);
        if (id) { const l = lineOf(id, env); if (l) now.push(l); }
        else if (!again && on.tension && (st.calm ?? 0) > 0) now.push(LINES.calm);
        if (on.bomb && st.bomb?.text && id !== 'bomb' && (st.bomb.left ?? 0) > 0 && st.bomb.left <= 3) now.push(LINES.bombNear(st.bomb.text, st.bomb.left));
        if (on.loop && again) { const n = st.loop?.[last] ?? 0; if (n >= 2) now.push(LINES.loop(n + 1)); }
        if (on.away && st.seen) { const d = (Date.now() - st.seen) / DAY; if (d >= 0.85) now.push(LINES.away(d)); }
        return now.length ? { now } : null;
    },
    onReply(env) {
        const on = env.cfg.on ?? {}, st = env.store, last = env.last ?? 0;
        if (!Object.values(on).some(Boolean)) return false;
        st.seed ??= String(Math.random()).slice(2, 10);
        if (reroll(env)) {
            if (on.loop) st.loop = { [last]: (st.loop?.[last] ?? 0) + 1 };
            if (on.debt) st.debt = (st.debt ?? 0) + 1;
        } else {
            const id = pick(env);
            st.fired = id; st.since ??= {};
            if (id === 'bomb') { (st.done ??= []).push(st.bomb.text); if (st.done.length > 10) st.done.shift(); st.bomb = null; }
            else if (st.bomb?.text) st.bomb.left = Math.max(0, (st.bomb.left ?? 0) - 1);
            if (id === 'debt') st.debt -= 5;
            if (on.tension) {
                if (id === 'tension') { st.t = 15; st.calm = 3; }
                else { st.calm = Math.max(0, (st.calm ?? 0) - 1); st.t = Math.min(100, (st.t ?? 0) + Math.round((Number(env.cfg.step) || 7) * (id ? 0.3 : 1))); }   // another device already stirred things: tension rises less
            }
            for (const d of DEV) if (d.gap) st.since[d.id] = d.id === id ? 0 : (st.since[d.id] ?? d.gap) + 1;
            st.tick = (st.tick ?? 0) + 1;
            st.loop = {};
        }
        if (on.away) st.seen = Date.now();
        return true;
    },
    hud: (_s, env) => { const on = env.cfg.on ?? {}, st = env.store; return [...(on.tension && (st.t ?? 0) >= 80 ? [`🎬 ${st.t}`] : []), ...(on.debt && (st.debt ?? 0) >= 3 ? [`🎲 빚 ${st.debt}`] : []), ...(on.bomb && st.bomb?.text ? [`⏳ ${st.bomb.left}`] : [])]; },
    widget: (_s, env) => { const on = env.cfg.on ?? {}, st = env.store, n = Object.values(on).filter(Boolean).length; return n ? `<div class="mb4-row"><span class="mb4-row-k">켠 장치 ${n}개</span><span class="mb4-row-v">${on.tension ? `🎬 ${st.t ?? 0}` : ''} ${on.debt ? `🎲 ${st.debt ?? 0}/5` : ''} ${on.bomb && st.bomb?.text ? `⏳ ${st.bomb.left}답 뒤` : ''}</span></div>` : ''; },
    render(el, api) {
        const cfg = api.cfg, st = api.store;
        cfg.on = cfg.on && typeof cfg.on === 'object' ? cfg.on : {};
        const sw = (d) => `<label class="mb4-sw"><span><b>${d.icon} ${esc(d.name)}</b><small>${esc(d.desc)}</small></span><input type="checkbox" data-act="on" data-v="${d.id}" ${cfg.on[d.id] ? 'checked' : ''}><i></i></label>`;
        el.innerHTML = `${card('🎯 사건을 만드는 장치 <small>한 답에 하나만</small>', DEV.filter((d) => d.kind === 'event').map(sw).join(''))}
        ${card('🫧 곁들이는 장치', DEV.filter((d) => d.kind === 'side').map(sw).join(''))}
        ${card('얼마나 자주', `<div class="mb4-btnrow tight">${RATES.map(([v, n]) => `<button class="mb4-btn ${rate(api.env) === v ? '' : 'ghost '}sm" data-act="rate" data-v="${v}">${n}</button>`).join('')}</div>${hint('우연한 만남 · 바깥 세상 · 날씨 · 복선 · 생활의 결에 적용돼요.')}`)}
        ${cfg.on.bomb ? card('⏳ 예고된 사건', `${st.bomb?.text ? `<div class="mb4-row"><span class="mb4-row-v"><b>${esc(st.bomb.text)}</b><br><small>${st.bomb.left}답 뒤에 터져요${st.bomb.left <= 3 ? ' · 조짐이 보이는 중' : ''}</small></span><button class="mb4-x" data-act="unbomb" aria-label="지우기">✕</button></div>` : ''}
            <input class="mb4-input" data-f="bomb" maxlength="160" placeholder="예: 정전이 된다 / 옛 친구가 찾아온다">
            <div class="mb4-btnrow tight">${[3, 5, 10, 20].map((n) => `<button class="mb4-btn ghost sm" data-act="bomb" data-v="${n}">${n}답 뒤</button>`).join('')}<button class="mb4-btn ghost sm" data-act="bomb" data-v="0">🎲 아무 때나</button></div>
            ${(st.done ?? []).length ? hint(`터진 사건: ${st.done.slice(-3).join(' · ')}`) : ''}`) : ''}
        ${cfg.on.tension ? card('🎬 긴장도', `<div class="mb4-row"><span class="mb4-row-k">지금</span><span class="mb4-row-v">${bar(st.t ?? 0, (st.t ?? 0) >= 80 ? 'bad' : 'mid')} ${st.t ?? 0}${(st.calm ?? 0) > 0 ? ` · 숨 돌리기 ${st.calm}답` : ''}</span></div>
            <div class="mb4-btnrow tight">${[[4, '느긋'], [7, '보통'], [12, '빠르게']].map(([v, n]) => `<button class="mb4-btn ${(Number(cfg.step) || 7) === v ? '' : 'ghost '}sm" data-act="step" data-v="${v}">${n}</button>`).join('')}<button class="mb4-btn ghost sm" data-act="firenow">지금 터뜨리기</button></div>`) : ''}
        ${cfg.on.debt ? card('🎲 운명의 빚', `<div class="mb4-row"><span class="mb4-row-k">쌓인 빚</span><span class="mb4-row-v">${st.debt ?? 0} / 5</span></div>`) : ''}
        ${st.fired ? hint(`지난 답에 쓴 장치: ${DEV.find((d) => d.id === st.fired)?.name ?? ''}`) : ''}
        ${hint('AI를 따로 부르지 않아요. 끈 장치는 아무것도 보내지 않아요. 빚 · 긴장도는 답을 지워도 되돌아가지 않아요.')}`;
        acts(el, {
            on: (id, b) => { cfg.on[id] = b.checked; if (id === 'away' && b.checked) st.seen = Date.now(); api.save(); api.redraw(); },
            rate: (v) => { cfg.rate = +v; api.save(); api.redraw(); },
            step: (v) => { cfg.step = +v; api.save(); api.redraw(); },
            firenow: () => { st.t = 100; st.calm = 0; api.save(); api.redraw(); api.toast('다음 답에 사건이 생겨요.'); },
            bomb: (n) => { const t = val(el, '[data-f="bomb"]'); if (!t) { api.toast('사건을 먼저 적어 주세요.'); return; } st.bomb = { text: t, left: +n || 4 + Math.floor(Math.random() * 12) }; api.save(); api.redraw(); },
            unbomb: () => { st.bomb = null; api.save(); api.redraw(); },
        });
    },
};
