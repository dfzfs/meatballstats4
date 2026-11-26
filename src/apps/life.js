// 🧸 Life (part of 「나」): needs that run down as story time passes — hunger, sleep, cleanliness, company.
// Load design: time and company are WATCHED from 🧭 Scene (no key of our own, no extra question). The three things
// only the text can tell (ate · slept · washed) are asked only in replies where a cue word for them appears.
// Mood, advice and the warning stages are worked out by code. A need the person switched off does not exist.
import { cueOr } from '../core/cadence.js';
import { esc, card, bar, hint, acts } from '../ui/kit.js';

// id, name, icon, drain per hour, word for the note, [low, very low] symptoms, what refills it (shown as a tip)
const NEEDS = [
    { id: 'food', name: '허기', icon: '🍞', rate: 4, word: 'hungry', sym: ['stomach growling, hard to focus', 'shaky and irritable from hunger, thinking about food'], tip: '뭐라도 먹기', say: '뭔가 먹을 것을 찾는다.' },
    { id: 'rest', name: '졸림', icon: '😴', rate: 3, word: 'tired', sym: ['yawning, slow to react', 'eyelids drooping, clumsy mistakes, short temper'], tip: '눈 붙이기', say: '잠깐 눈을 붙인다.' },
    { id: 'clean', name: '청결', icon: '🫧', rate: 1.5, word: 'unwashed', sym: ['messy hair, wrinkled clothes', 'people nearby notice the smell and the state of the clothes'], tip: '씻기', say: '씻으러 간다.' },
    { id: 'social', name: '사람', icon: '🫂', rate: 1.2, word: 'lonely', sym: ['a little too eager to talk, lingers near people', 'aches for company, talks to themself'], tip: '누군가와 시간 보내기', say: '누군가를 만나러 간다.' },
];
const SPEEDS = [[0.5, '느긋'], [1, '보통'], [1.5, '빠듯'], [2, '혹독']];
const LOW = 30, VERY = 10, START = 80, AFTER_SKIP_H = 6;
const JUMP = /\+\s*(?:\d+|\?)\s*(?:d|w|mo|y)/i;
export const hoursIn = (v) => { const t = String(v).toLowerCase(), g = (re) => { const m = t.match(re); return m ? +m[1] : 0; }; return g(/\+\s*(\d+)\s*w/) * 168 + g(/\+\s*(\d+)\s*d/) * 24 + g(/\+\s*(\d+)\s*h/) + g(/\+\s*(\d+)\s*m(?:in)?\b/) / 60; };
const tone = (n) => (n <= 25 ? 'bad' : n <= 50 ? 'mid' : 'good');
const on = (env, id) => env?.cfg?.off?.[id] !== true;
const live = (env) => NEEDS.filter((n) => on(env, n.id));
const clamp = (n) => Math.max(0, Math.min(100, n));
// One face for the whole body: the average of what is switched on, pulled down by the worst.
export function mood(S, env) {
    const L = live(env); if (!L.length) return { n: 100, face: '🙂', word: '평온' };
    const avg = L.reduce((a, n) => a + S[n.id], 0) / L.length, worst = Math.min(...L.map((n) => S[n.id]));
    const n = Math.round(avg * 0.6 + worst * 0.4);
    return { n, ...(n >= 80 ? { face: '😄', word: '아주 좋음' } : n >= 60 ? { face: '🙂', word: '괜찮음' } : n >= 40 ? { face: '😐', word: '그럭저럭' } : n >= 20 ? { face: '😣', word: '힘듦' } : { face: '😵', word: '한계' }) };
}
const CUE = {
    ate: /\b(?:eat|eats|ate|eaten|eating|meal|breakfast|lunch|dinner|supper|snack|bite|bites|chew|swallow|devour|feast|drink|drank|sip|sipped|coffee|tea|soup|bread|stew|plate|bowl)\b|먹|식사|밥|마시|마셨|간식|끼니|한 입/i,
    slept: /\b(?:sleep|sleeps|slept|asleep|nap|napped|doze|dozed|woke|wake|wakes|awake|awoke|bed|passed out|dream(?:t|ed)?)\b|자고|잤|잠[이을에들]|졸았|깨어|일어났|눈을 떴/i,
    washed: /\b(?:wash|washed|washes|bath|bathe|bathed|shower|showered|rinse|rinsed|scrub|scrubbed|soak|soaked)\b|씻|목욕|샤워|감았/i,
};

export default {
    api: 1, id: 'life', name: '생활', icon: '🧸', color: '#f4978e', cost: 'low',
    desc: '시간이 흐르면 허기 · 졸림 · 청결 · 사람이 저절로 줄어요. 먹고 자고 씻고 누굴 만나면 다시 차요.',
    keys: [
        { id: 'ate', line: 'ate: what was eaten — add "snack" or "feast" when it was one', when: (S, env) => on(env, 'food') && cueOr(CUE.ate)(S, env) },
        { id: 'slept', line: 'slept: how long (7h) or "nap"', when: (S, env) => on(env, 'rest') && cueOr(CUE.slept)(S, env) },
        { id: 'washed', line: 'washed: bath, shower or a proper wash', when: (S, env) => on(env, 'clean') && cueOr(CUE.washed)(S, env) },
    ],
    watch: ['time', 'with'],
    rules: (env) => [`ate, slept and washed are only about ${env.user || 'the user character'}, and only when it really happened in the text (not planned, offered or refused).`],
    start: () => ({ food: START, rest: START, clean: START, social: START, co: 0, log: [] }),
    reduce(S, { k, v, i }, env) {
        const sp = Number(env?.cfg?.speed) || 1;
        const mark = (t) => { (S.log ??= []).push({ t, i }); if (S.log.length > 12) S.log.shift(); };
        if (k === 'with') {
            const t = String(v).trim();
            if (/^=?\s*\(?\s*(?:none|nobody|no one|alone|empty|-)?\s*\)?\s*$/i.test(t)) S.co = 0;
            else if (t.startsWith('=')) S.co = t.slice(1).split(/[,，、]/).filter((x) => x.trim()).length;
            else for (const p of t.split(/\s*[;/]\s*|\s+(?=[+-])/)) S.co = Math.max(0, (S.co ?? 0) + (p.startsWith('+') ? 1 : p.startsWith('-') ? -1 : 0));
            if (S.co > 0) S.social = clamp(Math.max(S.social, 45));   // someone is here: at least no longer lonely
        } else if (k === 'time') {
            const h = Math.min(hoursIn(v), 72);
            // a jump written in days or longer: they lived normally in between, so the story opens a few hours after the last meal, sleep and wash
            if (JUMP.test(String(v))) for (const n of NEEDS) S[n.id] = clamp(START - n.rate * AFTER_SKIP_H * sp);
            else for (const n of NEEDS) {
                if (n.id === 'rest' && S.sleptAt === i) continue;   // the hours passed are the sleep itself (slept came first in this reply)
                if (n.id === 'social') S.social = clamp(S.social + (S.co > 0 ? 8 * h : -n.rate * h * sp));
                else S[n.id] = clamp(S[n.id] - n.rate * h * sp);
            }
        } else if (k === 'ate') { S.food = clamp(S.food + (/snack|bite|간식/i.test(v) ? 25 : /feast|잔치|배불리/i.test(v) ? 100 : 55)); mark('🍞'); }
        else if (k === 'slept') { S.sleptAt = i; const h = hoursIn(`+${String(v).replace(/^\+/, '')}`); S.rest = /nap|낮잠/i.test(v) ? clamp(S.rest + 30) : h && h < 5 ? clamp(S.rest + h * 14) : 100; mark('😴'); }
        else if (k === 'washed') { S.clean = 100; mark('🫧'); }
    },
    stateLines: (S, env) => { const L = live(env).filter((n) => n.id !== 'social'); return L.length ? [`needs: ${L.map((n) => `${n.id} ${Math.round(S[n.id])}/100`).join(', ')}`] : []; },
    // ✏️ numbers set by hand: kept as a difference, laid over what the story adds up to
    adjust(S, env) { const a = env.store?.adj; if (a) for (const n of NEEDS) if (a[n.id]) S[n.id] = Math.max(0, Math.min(100, S[n.id] + a[n.id])); },
    note(S, env) {
        const low = live(env).filter((n) => S[n.id] <= LOW);
        if (!low.length) return null;
        const who = env.user || 'The user character';
        return { state: [`${who} is ${low.map((n) => `${S[n.id] <= VERY ? `very ${n.word}` : n.word} (${n.sym[S[n.id] <= VERY ? 1 : 0]})`).join(' and ')}. Let it show in body and mood without naming numbers; it stays until they ${low.map((n) => ({ food: 'eat', rest: 'sleep', clean: 'wash', social: 'spend time with someone' }[n.id])).join(' / ')}.`] };
    },
    hud(S, env) { const L = live(env); if (!L.length) return []; const n = L.slice().sort((a, b) => S[a.id] - S[b.id])[0]; return S[n.id] <= 50 ? [`${n.icon} ${Math.round(S[n.id])}`] : []; },
    chip: ({ k }) => (k === 'ate' ? '🍞 먹음' : k === 'slept' ? '😴 잠' : k === 'washed' ? '🫧 씻음' : ''),
    widget: (S, env) => { const m = mood(S, env); return `<div class="mb4-gauges">${live(env).map((n) => `<div class="mb4-gauge"><span>${n.icon} ${n.name}</span><span class="mb4-meter"><i class="${tone(S[n.id])}" style="width:${Math.round(S[n.id])}%"></i></span><b>${Math.round(S[n.id])}</b></div>`).join('')}</div><div class="mb4-row"><span class="mb4-row-k">${m.face} 컨디션</span><span class="mb4-row-v">${m.word}</span></div>`; },
    widgetTitle: '생활',
    render(el, api) {
        const S = api.state(), env = api.env, cfg = api.cfg, sc = env.peek('scene'), m = mood(S, env);
        cfg.off = cfg.off && typeof cfg.off === 'object' ? cfg.off : {};
        const L = live(env), worst = L.slice().sort((a, b) => S[a.id] - S[b.id])[0];
        const left = (n) => { const sp = Number(cfg.speed) || 1; if (n.id === 'social' && S.co > 0) return '함께 있어서 차는 중'; const h = (S[n.id] - LOW) / (n.rate * sp); return h <= 0 ? '지금 부족해요' : h >= 48 ? '이틀 넘게 괜찮아요' : `약 ${h < 1 ? '1시간 안' : `${Math.round(h)}시간 뒤`}에 부족해져요`; };
        el.innerHTML = `${sc ? '' : card('', '🧭 장면을 켜야 시간이 흘러요. 지금은 먹고 자고 씻은 것만 세요.', 'warn')}
        <div class="mb4-hero mb4-center"><div class="mb4-hero-n">${m.face}</div><div class="mb4-big">${m.word}</div><small>컨디션 ${m.n} · ${worst && S[worst.id] <= 50 ? `${worst.icon} ${esc(worst.tip)}가 필요해요` : '부족한 게 없어요'}</small></div>
        ${card('', L.length ? `<div class="mb4-gauges one">${L.map((n) => `<div class="mb4-gauge"><span>${n.icon} ${n.name}</span>${bar(S[n.id], tone(S[n.id]))}<b>${Math.round(S[n.id])}</b></div><small class="mb4-dim">${esc(left(n))}</small>`).join('')}</div>` : hint('켜 둔 욕구가 없어요.'))}
        ${card('직접 넣기', `<div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="fix" data-v="ate=직접 넣음">🍞 먹었어요</button><button class="mb4-btn ghost sm" data-act="fix" data-v="ate=snack">🍪 간식</button><button class="mb4-btn ghost sm" data-act="fix" data-v="slept=8h">😴 푹 잤어요</button><button class="mb4-btn ghost sm" data-act="fix" data-v="slept=nap">💤 낮잠</button><button class="mb4-btn ghost sm" data-act="fix" data-v="washed=직접 넣음">🫧 씻었어요</button></div>
            ${worst && S[worst.id] <= 50 ? `<div class="mb4-btnrow"><button class="mb4-btn sm" data-act="say" data-v="${esc(worst.say)}">✍️ 「${esc(worst.say)}」 입력창에 적기</button></div>` : ''}`)}
        ${card('빠르기 · 쓸 욕구', `<div class="mb4-btnrow tight">${SPEEDS.map(([x, n]) => `<button class="mb4-btn ${(Number(cfg.speed) || 1) === x ? '' : 'ghost '}sm" data-act="speed" data-v="${x}">${n}</button>`).join('')}</div>
            ${NEEDS.map((n) => `<label class="mb4-sw"><span><b>${n.icon} ${n.name}</b><small>보통이면 한 시간에 ${n.rate}씩</small></span><input type="checkbox" data-act="need" data-v="${n.id}" ${on(env, n.id) ? 'checked' : ''}><i></i></label>`).join('')}`)}
        ${(S.log ?? []).length ? card('최근', `<div class="mb4-chips">${S.log.slice(-8).reverse().map((x) => `<span class="mb4-chip">${x.t}</span>`).join('')}</div>`) : ''}
        ${hint('시간과 「누구와 있는지」는 장면에서 그냥 받아 와요(AI에 더 안 물어요). 먹기 · 자기 · 씻기는 그런 말이 나온 답에서만 물어요. 30 아래로 내려가면 AI에 알려요.')}`;
        api.kit.editMore(el, api, [{ name: 'need', list: L, del: false, label: (n) => `${n.icon} ${n.name} (0~100)`, get: (n) => String(Math.round(S[n.id])), set: (n, t) => { const x = Math.max(0, Math.min(100, Math.round(+t))); if (!Number.isFinite(x)) return; const a = (api.store.adj ??= {}); a[n.id] = Math.round((a[n.id] ?? 0) + x - S[n.id]); } }]);
        acts(el, {
            fix: (v) => { const [key, val] = v.split('='); api.fix(key, val); },
            say: (v) => { if (api.say(v)) api.toast('입력창에 적어 뒀어요.'); },
            speed: (v) => { cfg.speed = +v; api.save(); api.redraw(); },
            need: (id, b) => { cfg.off[id] = !b.checked; api.save(); api.redraw(); },
        });
    },
};
