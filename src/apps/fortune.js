// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
import { todayLuck } from '../core/luck.js';
import { optList } from '../ui/kit.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };

// 🔮 Fortune: one draw per story day, decided in code (no model call). Optionally tints the story.
// Ported from the first generation's fortune house: three tellers (tarot · crystal ball · shaman) each with a voice;
// the cards (78, upright or reversed, 1 / 3 / 5-card spreads) and the luck table (overall · love · money · health ·
// work · people, at least one bad) are drawn in code, so the reading is not always flattering; concrete hooks (a
// direction, an object, a number) keep it from being vague. The model only interprets, on a tap.
const CARDS = [
    ['🌞', '대길', '무엇을 해도 술술 풀리는 날이에요.', 'things tend to go the user character\'s way today'],
    ['🍀', '길', '작은 행운이 따라와요.', 'small strokes of luck are likely today'],
    ['🌤', '평', '무난한 하루예요. 서두르지만 않으면 돼요.', 'an ordinary day; nothing leans either way'],
    ['🌧', '흉', '사소한 일이 꼬일 수 있어요. 한 번 더 확인해요.', 'small things tend to go slightly wrong today'],
    ['🌪', '대흉', '오늘은 큰 결정을 미루는 게 좋아요.', 'today leans unlucky; plans meet resistance'],
    ['💌', '인연', '뜻밖의 사람과 마주칠지도 몰라요.', 'a chance meeting or message is in the air today'],
    ['🪙', '재물', '돈과 물건에 운이 있어요.', 'money and finds are favoured today'],
    ['🗝', '발견', '숨은 것이 눈에 띄는 날이에요.', 'hidden or lost things tend to surface today'],
];
const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const draw = (seed, day) => CARDS[hashOf(`${seed}:${day}`) % CARDS.length];
const today = (env) => env.peek('scene')?.day ?? 1;
const mine = (env) => (env.store.day === today(env) ? CARDS[env.store.card] : null);
const TELLERS_BASE = {
    tarot: { icon: '🃏', name: '타로', who: '타로 언니', voice: 'a chatty tarot reader in a corner café booth who gasps at every card and loves a twist in someone\'s love life' },
    orb: { icon: '🔮', name: '수정구슬', who: '마담', voice: 'a mysterious crystal-ball madame with a vague foreign accent who slips into plain local speech when the ball shows something odd' },
    shaman: { icon: '🪭', name: '무당', who: '보살 할매', voice: 'a grumpy old shaman grandmother who scolds, then suddenly speaks as the spirits' },
};
let TELLERS = TELLERS_BASE;
const D_TELL = Object.entries(TELLERS_BASE).map(([id, t]) => ({ id, icon: t.icon, name: t.name, ai: t.voice }));
// every teller (hidden ones too, so old readings still show their icon), as the same object shape as before
const tellersOf = (cfg) => { const hide = cfg?.opts?.tellers?.hide ?? {}; return Object.fromEntries([...optList(cfg, 'tellers', D_TELL), ...D_TELL.filter((d) => hide[d.id])].map((t) => [t.id, { icon: t.icon || '🔮', name: t.name, who: TELLERS_BASE[t.id]?.who ?? t.name, voice: t.ai || TELLERS_BASE[t.id]?.voice || t.name, hidden: !!hide[t.id] }])); };
const MAJOR = ['바보', '마법사', '여사제', '여황제', '황제', '교황', '연인', '전차', '힘', '은둔자', '운명의 수레바퀴', '정의', '매달린 사람', '죽음', '절제', '악마', '탑', '별', '달', '태양', '심판', '세계'];
const SUITS = ['완드', '컵', '소드', '펜타클'], RANKS = ['에이스', '2', '3', '4', '5', '6', '7', '8', '9', '10', '시종', '기사', '여왕', '왕'];
const TAROT = [...MAJOR, ...SUITS.flatMap((su) => RANKS.map((r) => `${su} ${r}`))];
const SPREADS = { 1: ['오늘의 메시지'], 3: ['과거', '현재', '미래'], 5: ['지금의 상황', '가로막는 것', '숨은 영향', '조언', '결과'] };
const AREAS = [['총운', 'overall'], ['애정', 'love'], ['재물', 'money'], ['건강', 'health'], ['일', 'work'], ['사람', 'people']];
const VERDICTS = [['대길', 'GREAT', 10], ['길', 'GOOD', 20], ['평', 'MIXED', 22], ['흉', 'BAD', 32], ['대흉', 'DISASTROUS', 16]];
const HOOKS = { dir: ['east', 'west', 'south', 'north'], obj: ['a red umbrella', 'a cracked mirror', 'an old key', 'a letter', 'a black cat', 'a ring', 'running water', 'a stopped clock', 'a white flower', 'a bridge'], ev: ['a lost object', 'a request to borrow money', 'a move', 'a small accident', 'a late-night message', 'a quarrel', 'a secret coming out', 'a broken promise'] };
// everything chancy is decided here, in code
function deal(rnd, n) {
    const deck = [...TAROT], out = [];
    for (const pos of SPREADS[n] ?? SPREADS[3]) { const i = Math.floor(rnd() * deck.length); out.push({ pos, name: deck.splice(i, 1)[0], rev: rnd() < 0.35 }); }
    return out;
}
function luckTable(rnd) {
    const pick = () => { let x = rnd() * 100; for (const [k, , w] of VERDICTS) { if (x < w) return k; x -= w; } return '평'; };
    const L = AREAS.map(([a]) => ({ a, v: pick() }));
    if (!L.some((l) => l.v === '흉' || l.v === '대흉')) L[Math.floor(rnd() * L.length)].v = rnd() < 0.66 ? '흉' : '대흉';   // one bad area, always
    return L;
}
const hooks = (rnd) => { const p = (a) => a[Math.floor(rnd() * a.length)]; return [`within ${1 + Math.floor(rnd() * 12)} weeks`, `the ${p(HOOKS.dir)}`, p(HOOKS.obj), p(HOOKS.ev), `the number ${1 + Math.floor(rnd() * 9)}`]; };
const EN = Object.fromEntries(VERDICTS.map(([k, e]) => [k, e]));

export default {
    _t: { deal, luckTable, draw },   // for tests only; not part of the app contract
    api: 1, id: 'fortune', name: '점집', icon: '🔮', color: '#9b5de5', cost: 'tap',
    desc: '이야기 속 하루에 한 번 운세를 뽑아요. 원하면 그날의 운이 이야기에 살짝 스며들어요.',
    note: (_s, env) => (mine(env) && env.store.tell ? { state: [`Luck today (a light tint only, never stated outright): ${mine(env)[3]}.`] } : null),
    hud: (_s, env) => (mine(env) ? [`${mine(env)[0]} ${mine(env)[1]}`] : []),
    widget: (_s, env) => (mine(env) ? `<div class="mb4-row"><span class="mb4-row-k">${mine(env)[0]} ${mine(env)[1]}</span><span class="mb4-row-v">${esc(mine(env)[2])}</span></div>` : ''),
    widgetTitle: '오늘의 운세',
    render(el, api) {
        TELLERS = tellersOf(api.cfg);
        const st = api.store, k = api.kit, env = api.env, c = mine(env), d = today(env);
        st.seed ??= String(Math.random()).slice(2, 10);
        st.readings = Array.isArray(st.readings) ? st.readings : [];
        const m = TELLERS[st.method] && !TELLERS[st.method].hidden ? st.method : (Object.keys(TELLERS).find((x) => !TELLERS[x].hidden) ?? 'tarot'), n = [1, 3, 5].includes(st.n) ? st.n : 3;
        const cast = [...new Set([env.user, ...(env.peek('scene')?.with ?? []), ...Object.keys(env.peek('people')?.list ?? {})])].filter(Boolean);
        const who = cast.includes(st.who) ? st.who : cast[0] ?? '';
        const last = st.readings.at(-1);
        el.innerHTML = `<div class="mb4-hero mb4-center">${c ? `<div class="mb4-hero-n">${c[0]}</div><div class="mb4-big">${c[1]}</div><p>${esc(c[2])}</p><small>이야기 ${d}일째의 운세</small>` : `<div class="mb4-hero-n">🔮</div><div class="mb4-big">오늘의 운세</div><small>이야기 속 하루에 한 번 뽑아요</small>`}</div>
        ${(() => { const T = todayLuck(env, 'fortune'); if (!c || !T) return ''; const parts = [T.n ? `🎲 주사위 ${T.n > 0 ? '+' : '−'}${Math.abs(T.n)}` : '🎲 주사위 보정 없음', `🎯 선택지: ${T.good.good} 좋고 · ${T.bad.bad}`]; return k.hint(`오늘 운이 다른 앱에 닿아요 → ${parts.join(' · ')}`); })()}
        <button class="mb4-btn wide" data-act="draw" ${c ? 'disabled' : ''}>${c ? '내일 다시 뽑을 수 있어요' : '🔮 뽑기 (AI 0회)'}</button>
        ${k.card('🔮 점 보러 가기', `<div class="mb4-chips">${Object.entries(TELLERS).filter(([, t]) => !t.hidden).map(([id, t]) => `<button class="mb4-opt${m === id ? ' on' : ''}" data-act="method" data-v="${id}">${t.icon} ${t.name}</button>`).join('')}</div>
            ${m === 'tarot' ? `<div class="mb4-chips" style="margin-top:6px">${[1, 3, 5].map((x) => `<button class="mb4-opt${n === x ? ' on' : ''}" data-act="n" data-v="${x}">${x}장</button>`).join('')}</div>` : ''}
            <div class="mb4-chips" style="margin-top:6px">${cast.map((x) => `<button class="mb4-opt${x === who ? ' on' : ''}" data-act="who" data-v="${esc(x)}">${k.face(x)} ${esc(x)}</button>`).join('')}</div>
            <input class="mb4-input" data-f="q" maxlength="80" placeholder="궁금한 것 (비우면 종합운)">
            <div class="mb4-btnrow"><button class="mb4-btn wide" data-act="read" ${who ? '' : 'disabled'}>점괘 받기 (AI 1회)</button></div>`)}
        ${last ? k.card(`${TELLERS[last.m]?.icon ?? '🔮'} ${esc(last.who)}의 점괘 · ${last.day}일째`, `${last.cards?.length ? `<div class="mb4-chips">${last.cards.map((x) => `<span class="mb4-chip">${esc(x.pos)}: ${esc(x.name)}${x.rev ? ' (역)' : ''}</span>`).join('')}</div>` : ''}
            <div class="mb4-chips" style="margin-top:6px">${last.luck.map((l) => `<span class="mb4-pill ${/길/.test(l.v) ? 'good' : /흉/.test(l.v) ? 'bad' : ''}">${esc(l.a)} ${esc(l.v)}</span>`).join(' ')}</div>
            <p style="white-space:pre-wrap">${esc(last.text)}</p>`) : ''}
        ${st.readings.length > 1 ? k.card(`지난 점괘 <small>맞음 ${st.readings.filter((r) => r.hit === true).length} · 빗나감 ${st.readings.filter((r) => r.hit === false).length}</small>`, st.readings.map((r, ix) => [r, ix]).slice(0, -1).reverse().slice(0, 10).map(([r, ix]) => `<details class="mb4-tr-item"><summary>${TELLERS[r.m]?.icon ?? '🔮'} <b>${esc(r.who)}</b> <small>${r.day}일째${r.hit === true ? ' · ✅ 맞음' : r.hit === false ? ' · ❌ 빗나감' : ''}</small></summary>${r.cards?.length ? `<div class="mb4-chips">${r.cards.map((x) => `<span class="mb4-chip">${esc(x.pos)}: ${esc(x.name)}${x.rev ? ' (역)' : ''}</span>`).join('')}</div>` : ''}<p style="white-space:pre-wrap">${esc(r.text)}</p><div class="mb4-btnrow tight"><button class="mb4-btn ghost sm" data-act="hit" data-v="${ix}:1">✅ 맞았어요</button><button class="mb4-btn ghost sm" data-act="hit" data-v="${ix}:0">❌ 빗나갔어요</button></div></details>`).join('')) : ''}
        ${k.optCard(api.cfg, 'tellers', D_TELL, { title: '점쟁이', aiLabel: '어떤 점쟁이인지 · 말투 (영어로 쓰면 더 잘 알아들어요)' })}
        ${k.card('', `<label class="mb4-sw"><span><b>이야기에 스며들게</b><small>그날의 운을 AI에 한 줄로 알려요</small></span><input type="checkbox" data-act="tell" ${st.tell ? 'checked' : ''}><i></i></label>`)}
        ${k.hint('카드 · 운세표 · 좋고 나쁨은 코드가 먼저 정해요(늘 좋은 말만 나오지 않게). AI는 풀이만 해요. 점괘는 본편 AI에 안 가요.')}`;
        api.kit.editMore(el, api, [
            { name: 'read', list: st.readings, rows: 4, max: 10, label: (x) => `${x.who} · ${x.day}일째 풀이`, get: (x) => x.text, set: (x, t) => { x.text = t.slice(0, 1500); } },
            ...(c && st.card >= 0 ? [{ name: 'today', obj: st, keys: [['card', '오늘 카드 번호 (0부터)']], num: true }] : []),
        ]);
        k.optWire(el, api.cfg, () => { api.save(); api.redraw(); });
        k.acts(el, {
            draw: () => { st.day = d; st.card = CARDS.indexOf(draw(st.seed, d)); api.save(); api.redraw(); },
            tell: (_v, x) => { st.tell = x.checked; api.save(); },
            hit: (v) => { const [ix, ok] = v.split(':'); const r = st.readings[+ix]; if (r) { r.hit = ok === '1'; api.save(); api.redraw(); } },
            method: (v) => { st.method = v; api.save(); api.redraw(); },
            n: (v) => { st.n = +v; api.save(); api.redraw(); },
            who: (v) => { st.who = v; api.save(); api.redraw(); },
            read: async (_v, b) => {
                b.disabled = true; b.textContent = '점 보는 중…';
                const rnd = Math.random, cards = m === 'tarot' ? deal(rnd, n) : [], luck = luckTable(rnd), hk = hooks(rnd), q = k.val(el, '[data-f="q"]');
                const T = TELLERS[m];
                const raw = await api.ask(`You are ${T.voice}. ${who} comes for a reading${q ? ` about: ${q}` : ''}.\n\n[What is known about the story]\n${api.facts() || '(nothing recorded)'}\n\n[Decided already — do not change it]\n${cards.length ? `Cards: ${cards.map((x) => `${x.pos} — ${x.name}${x.rev ? ' (reversed)' : ''}`).join('; ')}\n` : ''}Luck: ${luck.map((l) => `${AREAS.find((a) => a[0] === l.a)[1]}: ${EN[l.v]}`).join(', ')}\nWork these in concretely: ${hk.join('; ')}.\n\nGive the reading in your own voice, 5 to 8 sentences, in Korean. Bad areas are said plainly, not softened. Output only the reading.`, 700);
                if (raw) { st.readings.push({ m, who, day: d, cards, luck, text: String(raw).trim().slice(0, 1500) }); if (st.readings.length > 20) st.readings.shift(); } else api.toast('점괘를 받지 못했어요. 잠시 뒤 다시 해 보세요.');
                api.save(); api.redraw();
            },
        });
    },
};
