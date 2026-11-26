// 🎲 Dice: a twenty-sided die rolled in code when the person taps. The verdict rides along with the next reply once.
// Ported from the second generation's dice parts: modifiers come from the gauges (a danger gauge −2, a low one −1),
// lasting conditions that carry a modifier, needs that ran out, and the luck of the story day — each shown as a line of
// the breakdown, read-only through peek (an app that is off adds nothing).
import { clip, hash } from '../core/text.js';
import { esc, card, hint, acts, val, ring } from '../ui/kit.js';
import { todayLuck } from '../core/luck.js';
import { plain, spendPlain, stamped, spendStamped } from '../core/once.js';
import { optList, optCard, optWire } from '../ui/kit.js';

const LEVELS_BASE = [['쉬움', 8], ['보통', 12], ['어려움', 15], ['매우 어려움', 18], ['극한', 22]];
const D_LEVELS = LEVELS_BASE.map(([name, t]) => ({ id: `l${t}`, icon: '', name, ai: String(t) }));
const levelsOf = (cfg) => optList(cfg, 'levels', D_LEVELS).map((x) => [x.name, Math.max(2, Math.min(30, parseInt(x.ai, 10) || 12))]);
const MODS = [-2, -1, 0, 1, 2, 3];
export const roll = (sides = 20, rnd = Math.random) => 1 + Math.floor(rnd() * sides);
// Chance (0-100) that d20 + mod reaches the target.
export const chance = (target, mod = 0) => Math.max(0, Math.min(100, (21 - (target - mod)) * 5));
// -> [Korean label, English phrase, tone]
export function verdict(n, mod, target) {
    if (n === 1) return ['대실패', 'a critical failure', 'bad'];
    if (n === 20) return ['대성공', 'a critical success', 'good'];
    const total = n + mod;
    if (total >= target) return ['성공', 'a success', 'good'];
    return total >= target - 2 ? ['아슬아슬한 실패', 'a near miss: failure, but something small is gained', 'bad'] : ['실패', 'a failure', 'bad'];
}
// Luck of the story day: one shared source (🔮 fortune > 🎲 the day's luck roll > the day itself).
export const luckOf = (env) => todayLuck(env, 'dice');
// Every automatic modifier with its reason. [{ why, n }]
export function parts(env) {
    const out = [], st = env.peek?.('stats');
    if (st?.v) for (const [k, v] of Object.entries(st.v)) { const max = st.max?.[k] ?? 100, p = (v / max) * 100; if (p <= 25) out.push({ why: `${k} 위험`, n: -2 }); else if (p <= 50) out.push({ why: `${k} 낮음`, n: -1 }); }
    for (const t of st?.tags ?? []) if (t.dice) out.push({ why: `🏷 ${t.name}`, n: t.dice });
    const life = env.peek?.('life');
    if (life) { const low = ['food', 'rest', 'clean'].filter((k) => (life[k] ?? 100) <= 10); if (low.length) out.push({ why: `🧸 ${low.join(' · ')} 바닥`, n: -Math.min(2, low.length) }); }
    const L = luckOf(env);
    if (L?.n) out.push({ why: L.why, n: L.n });
    return out;
}
const autoMod = (env) => (env.store.auto === false ? 0 : Math.max(-6, Math.min(6, parts(env).reduce((a, p) => a + p.n, 0))));
const die = (n, tone) => `<svg class="mb4-die ${tone}" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,4 92,27 92,73 50,96 8,73 8,27"/><polygon class="in" points="50,22 78,66 22,66"/><path d="M50 4 50 22M92 27 78 66M8 27 22 66M50 96 78 66M50 96 22 66M92 27 50 22M8 27 50 22M92 73 78 66M8 73 22 66"/><text x="50" y="58" text-anchor="middle">${n}</text></svg>`;

export default {
    api: 1,
    id: 'dice',
    name: '주사위',
    icon: '🎲',
    color: '#7c5cff',
    cost: 'tap',
    desc: '판정이 필요할 때 눌러서 굴려요. 결과는 다음 답에 한 번만 반영돼요.',
    note(_S, env) {
        const r = plain(env.store, 'roll', env);   // a reroll of the reply it was for gets the same verdict
        if (!r) return null;
        return { now: [`A die decided the outcome of ${r.what ? `"${clip(r.what, 120)}"` : 'the action the user is attempting'}: ${verdict(r.n, r.mod, r.target)[1]}. Write the outcome to match it. Do not mention the die or any number.`] };
    },
    onReply(env) { return spendPlain(env.store, 'roll', env); },
    hud: (_S, env) => (env.store.roll ? [`🎲 ${verdict(env.store.roll.n, env.store.roll.mod, env.store.roll.target)[0]}`] : []),
    widget(_S, env) {
        const r = env.store.roll ?? (env.store.hist ?? []).at(-1);
        return `<div class="mb4-dice-w">${die(r?.n ?? 20, r ? verdict(r.n, r.mod, r.target)[2] : '')}<span><b>${r ? verdict(r.n, r.mod, r.target)[0] : '눌러서 굴려요'}</b><small>${env.store.roll ? '다음 답에 반영돼요' : r ? '지난 굴림' : '판정이 필요할 때'}</small></span></div>`;
    },
    render(el, api) {
        const st = api.store, r = st.roll, env = api.env, P = parts(env), auto = autoMod(env), L = luckOf(env);
        st.target ??= 12; st.mod ??= 0; st.hist = Array.isArray(st.hist) ? st.hist : [];
        const v = r ? verdict(r.n, r.mod, r.target) : null;
        el.innerHTML = `<div class="mb4-hero mb4-dice-hero">${die(r?.n ?? 20, v?.[2] ?? '')}
            <span class="mb4-dice-t">${v ? `<b class="mb4-${v[2]}">${v[0]}</b><small>${r.n}${r.mod ? ` ${r.mod > 0 ? '+' : '−'} ${Math.abs(r.mod)}` : ''} = ${r.n + r.mod} · 목표 ${r.target}</small>` : '<b>굴려 볼까요</b><small>스무 면 주사위</small>'}</span>
            ${ring(chance(st.target, st.mod + auto), '성공')}</div>
        ${card('무엇을 판정하나요', `<input class="mb4-input" data-f="what" maxlength="120" placeholder="비워도 돼요 (예: 자물쇠 따기)" value="${esc(r?.what ?? '')}">`)}
        ${card('난이도', `<div class="mb4-chips">${levelsOf(api.cfg).map(([name, t]) => `<button class="mb4-opt${st.target === t ? ' on' : ''}" data-act="target" data-v="${t}">${name} ${t}</button>`).join('')}</div>`)}
        ${card('보정', `<div class="mb4-chips">${MODS.map((m) => `<button class="mb4-opt${st.mod === m ? ' on' : ''}" data-act="mod" data-v="${m}">${m > 0 ? `+${m}` : m === 0 ? '±0' : `−${Math.abs(m)}`}</button>`).join('')}</div>${hint('유리하면 ＋, 불리하면 − 를 골라요.')}`)}
        ${card('저절로 붙는 보정', `${P.length ? P.map((p) => `<div class="mb4-row"><span class="mb4-row-k">${esc(p.why)}</span><b class="${p.n < 0 ? 'mb4-bad' : 'mb4-good'}">${p.n > 0 ? '+' : '−'}${Math.abs(p.n)}</b></div>`).join('') + `<div class="mb4-row"><span class="mb4-row-k"><b>합</b></span><b>${auto > 0 ? '+' : auto < 0 ? '−' : '±'}${Math.abs(auto)}</b></div>` : hint('지금은 없어요. ❤️ 수치 · 🧸 생활 · 🧭 장면(오늘 운)을 켜면 여기에 붙어요.')}
            <label class="mb4-sw"><span><b>저절로 보정 쓰기</b></span><input type="checkbox" data-act="auto" ${st.auto !== false ? 'checked' : ''}><i></i></label>
            ${L ? `<div class="mb4-btnrow"><span class="mb4-dim" style="flex:1">🍀 오늘 운 ${'★'.repeat(L.stars)}${'☆'.repeat(5 - L.stars)}${L.name ? ` · ${esc(L.name)}` : ''}</span>${L.src !== 'day' ? '' : '<button class="mb4-btn ghost sm" data-act="luck">🍀 오늘 운 굴리기</button>'}</div>` : ''}`)}
        <button class="mb4-btn wide" data-act="roll">🎲 굴리기</button>
        ${optCard(api.cfg, 'levels', D_LEVELS, { title: '난이도', fields: ['name', 'ai'], aiLabel: '목표 숫자 (2~30, 예: 10)' })}
        ${r ? '<button class="mb4-btn ghost wide" data-act="drop">이번 결과는 반영 안 함</button>' : ''}
        ${st.hist.length ? card(`최근 굴림 <small>성공 ${st.hist.filter((h) => verdict(h.n, h.mod, h.target)[2] === 'good').length} / ${st.hist.length}</small>`, st.hist.slice(-10).reverse().map((h) => { const v2 = verdict(h.n, h.mod, h.target); return `<div class="mb4-row"><span class="mb4-row-k"><span class="mb4-roll ${v2[2]}">${h.n}</span> ${esc(v2[0])}</span><span class="mb4-row-v"><small>${esc(h.what || '판정')} · ${h.n + (h.mod ?? 0)}/${h.target}</small></span></div>`; }).join('')) : ''}
        ${hint('결과는 다음 답에 한 번만 따라가요. AI 호출은 없어요.')}`;
        api.kit.editMore(el, api, [
            ...(r ? [{ name: 'res', obj: r, num: true, keys: [['n', '이번 결과: 주사위 눈 (1~20)'], ['mod', '이번 결과: 보정'], ['target', '이번 결과: 목표']] }, { name: 'resw', obj: r, keys: [['what', '이번 결과: 무엇을 판정']] }] : []),
            { name: 'hist', list: st.hist, max: 10, label: () => '지난 굴림: 눈 | 보정 | 목표', get: (h) => `${h.n} | ${h.mod} | ${h.target}`, set: (h, t) => { const [n, m, g] = t.split('|').map((x) => +x.trim()); if (n >= 1 && n <= 20) h.n = n; if (Number.isFinite(m)) h.mod = m; if (g > 0) h.target = g; } },
        ]);
        optWire(el, api.cfg, () => { api.save(); api.redraw(); });
        acts(el, {
            target: (t) => { st.target = +t; api.save(); api.redraw(); },
            mod: (m) => { st.mod = +m; api.save(); api.redraw(); },
            roll: () => { st.roll = { n: roll(20), mod: st.mod + autoMod(env), target: st.target, what: val(el, '[data-f="what"]'), parts: st.auto === false ? [] : P }; st.hist.push({ n: st.roll.n, mod: st.roll.mod, target: st.target, what: st.roll.what, day: env.peek('scene')?.day ?? null }); if (st.hist.length > 20) st.hist.shift(); api.save(); api.redraw(); },
            drop: () => { st.roll = null; api.save(); api.redraw(); },
            auto: (_v, b) => { st.auto = b.checked; api.save(); api.redraw(); },
            luck: () => { if (L && L.src === 'day') { st.luck = { day: L.day, d: roll(20) }; api.save(); api.redraw(); } },
        });
    },
};
