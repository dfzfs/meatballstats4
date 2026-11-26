// ❤️ Gauges: numbers the person chooses to track (health, energy, anything). The code keeps them in range.
// Ported from the second generation's rule book: a gauge that drops past half is a warning, past a quarter a danger,
// each with a symptom the story shows and a dice penalty (-1 / -2); status tags ("sprained ankle", "blessed") that
// last a set time and may carry a dice modifier. The dice app reads all of this (read-only) for its breakdown.
import { esc, card, bar, hint, acts, val } from '../ui/kit.js';

const DEFAULT = [{ key: 'hp', name: '체력', icon: '❤️', max: 100, start: 100 }, { key: 'energy', name: '기운', icon: '⚡', max: 100, start: 80 }];
const bars = (env) => (Array.isArray(env.store.bars) && env.store.bars.length ? env.store.bars : DEFAULT);
const parse = (v) => { const m = String(v).match(/^\s*([^=]+?)\s*=\s*([=+-])?\s*(\d+)/); return m ? { key: m[1].trim().toLowerCase(), sign: m[2] ?? '=', n: +m[3] } : null; };
const tone = (pct) => (pct <= 25 ? 'bad' : pct <= 50 ? 'mid' : 'good');
const word = (pct) => (pct <= 25 ? 'critically low' : pct <= 50 ? 'low' : 'fine');
// What a low gauge looks like (second generation's symptoms); the person can write their own per gauge.
const SYMPTOM = {
    hp: ['hurting, moves carefully', 'badly hurt, every move costs'], energy: ['yawning, slow to react', 'eyelids drooping, making mistakes'],
    hunger: ['stomach growling, hard to focus', 'irritable and shaky from hunger'], mood: ['quiet and sharp-tongued', 'about to break down over small things'],
    stress: ['tense, snaps easily', 'at the end of their rope'], mana: ['spells come slow', 'nothing left to cast'],
};
export const stageOf = (n, max) => { const p = (n / max) * 100; return p <= 25 ? 2 : p <= 50 ? 1 : 0; };
// "sprained ankle 3d | dice -1" · "blessed 6h | dice +1" · "-sprained ankle" -> { name, hours, dice, off }
export function tagOf(v) {
    const [head, rest] = String(v).split('|').map((x) => x.trim());
    if (/^[-−]/.test(head)) return { name: head.replace(/^[-−]\s*/, '').slice(0, 40), off: true };
    const m = head.match(/^(.*?)\s+(\d+)\s*(h|d|w)\s*$/i);
    const dice = (rest ?? '').match(/dice\s*([+-]\s*\d)/i);
    return { name: (m ? m[1] : head).trim().slice(0, 40), hours: m ? +m[2] * { h: 1, d: 24, w: 168 }[m[3].toLowerCase()] : null, dice: dice ? Math.max(-3, Math.min(3, +dice[1].replace(/\s/g, ''))) : 0 };
}
const hoursIn = (v) => { const t = String(v).toLowerCase(), g = (re) => { const m = t.match(re); return m ? +m[1] : 0; }; return g(/\+\s*(\d+)\s*w/) * 168 + g(/\+\s*(\d+)\s*d/) * 24 + g(/\+\s*(\d+)\s*h/) + g(/\+\s*(\d+)\s*m(?:in)?\b/) / 60; };

export default {
    api: 1,
    id: 'stats',
    name: '수치',
    icon: '❤️',
    color: '#ff6b6b',
    cost: 'low',
    desc: '체력 · 기운처럼 내가 정한 수치를 막대로 보여 주고, 낮아지면 AI가 그에 맞게 쓰게 해요.',
    keys: [
        { id: 'stat', line: 'stat: gauge=-15 (went down) / gauge=+10 (went up) / gauge==40 (the text states the value)' },
        { id: 'tag', line: 'tag: lasting condition of the user character + length if implied (sprained ankle 3d) / -name when it ends', quote: true },
    ],
    watch: ['time'],
    rules: (env) => [`"stat" uses only these gauge names, for ${env.user || 'the user character'}: ${bars(env).map((b) => b.key).join(', ')}. Change one only when the text shows a clear cause (a wound, a meal, a night's sleep, hard effort). Typical step: 5 to 25.`],
    start: (env) => ({ v: Object.fromEntries(bars(env).map((b) => [b.key, b.start ?? b.max])), max: Object.fromEntries(bars(env).map((b) => [b.key, b.max])), last: {}, tags: [] }),
    check: ({ k, v }, env) => { if (k === 'tag') return tagOf(v).name.length > 0; const x = parse(v); return !!x && bars(env).some((b) => b.key.toLowerCase() === x.key); },
    reduce(S, { k, v, i }, env) {
        S.tags ??= [];
        if (k === 'time') { const h = hoursIn(v); for (const t of S.tags) if (t.left != null) t.left -= h; S.tags = S.tags.filter((t) => t.left == null || t.left > 0); return; }
        if (k === 'tag') {
            const t = tagOf(v), key = t.name.toLowerCase();
            S.tags = S.tags.filter((x) => x.name.toLowerCase() !== key);
            if (!t.off) { S.tags.push({ name: t.name, left: t.hours, dice: t.dice, i }); if (S.tags.length > 12) S.tags.shift(); }
            return;
        }
        const x = parse(v), b = bars(env).find((y) => y.key.toLowerCase() === x?.key);
        if (!b) return;
        const cur = S.v[b.key] ?? b.max;
        const next = Math.max(0, Math.min(b.max, x.sign === '=' ? x.n : x.sign === '-' ? cur - x.n : cur + x.n));
        S.last[b.key] = { d: next - cur, i };
        S.v[b.key] = next;
    },
    stateLines: (S, env) => [...bars(env).map((b) => `stat: ${b.key}=${S.v[b.key] ?? b.max}/${b.max}`), ...((S.tags ?? []).length ? [`lasting conditions: ${S.tags.map((t) => t.name).join(', ')}`] : [])],
    note(S, env) {
        const who = env.user || 'The user character', own = env.store.sym ?? {};
        const low = bars(env).filter((b) => stageOf(S.v[b.key] ?? b.max, b.max) > 0);
        const state = [];
        if (low.length) state.push(`${who}'s condition: ${low.map((b) => { const n = S.v[b.key] ?? b.max, st = stageOf(n, b.max); const sy = own[b.key]?.[st - 1] || SYMPTOM[b.key]?.[st - 1]; return `${b.key} ${n}/${b.max} (${word(n / b.max * 100)})${sy ? ` — ${sy}` : ''}`; }).join(', ')}. Let it show in what they can do.`);
        if ((S.tags ?? []).length) state.push(`${who} is currently: ${S.tags.map((t) => t.name).join(', ')}. Keep it consistent until it ends in the story.`);
        return state.length ? { state } : null;
    },
    hud: (S, env) => bars(env).slice(0, 2).map((b) => `${b.icon} ${S.v[b.key] ?? b.max}`),
    chip({ k, v }, env) { if (k === 'tag') { const t = tagOf(v); return t.off ? `🏷 −${t.name}` : `🏷 ${t.name}`; } const x = parse(v), b = bars(env).find((y) => y.key.toLowerCase() === x?.key); return b ? `${b.icon} ${x.sign === '=' ? `= ${x.n}` : `${x.sign === '-' ? '−' : '+'}${x.n}`}` : ''; },
    widget: (S, env) => `<div class="mb4-gauges">${bars(env).map((b) => { const n = S.v[b.key] ?? b.max; return `<div class="mb4-gauge"><span>${b.icon} ${esc(b.name)}</span>${bar(n / b.max * 100, tone(n / b.max * 100))}<b>${n}</b></div>`; }).join('')}</div>`,
    render(el, api) {
        const S = api.state(), st = api.store, B = bars(api.env);
        const tags = S.tags ?? [];
        el.innerHTML = `${tags.length ? card('🏷 지금 붙어 있는 상태', tags.map((t) => `<div class="mb4-row"><span class="mb4-row-k">${esc(t.name)}</span><span class="mb4-row-v">${t.left != null ? `${t.left >= 24 ? `${Math.ceil(t.left / 24)}일` : `${Math.ceil(t.left)}시간`} 남음` : '끝날 때까지'}${t.dice ? ` · 🎲 ${t.dice > 0 ? '+' : ''}${t.dice}` : ''}</span><button class="mb4-x" data-act="untag" data-v="${esc(t.name)}" aria-label="떼기">✕</button></div>`).join('')) : ''}
        ${card('', `<div class="mb4-gauges one">${B.map((b) => { const n = S.v[b.key] ?? b.max; return `<div class="mb4-gauge"><span>${b.icon} ${esc(b.name)}</span>${bar(n / b.max * 100, tone(n / b.max * 100))}<b>${n}<small>/${b.max}</small></b>
            <span class="mb4-btnrow tight"><button class="mb4-btn ghost sm" data-act="adj" data-v="${esc(b.key)}=-10">−10</button><button class="mb4-btn ghost sm" data-act="adj" data-v="${esc(b.key)}=+10">＋10</button></span></div>`; }).join('')}</div>`)}
        <details class="mb4-card"><summary>🏷 상태 붙이기</summary>
            <div class="mb4-btnrow"><input class="mb4-input" data-f="tag" maxlength="40" placeholder="예: 발목 삠"><input class="mb4-input mb4-short" data-f="tagd" maxlength="5" placeholder="3d · 6h"><input class="mb4-input mb4-short" data-f="tagm" type="number" min="-3" max="3" placeholder="🎲±"><button class="mb4-btn" data-act="tag">붙이기</button></div>
            ${hint('기간을 적으면 이야기 시간이 흐르면서 저절로 떨어져요(🧭 장면 필요). 🎲 숫자는 주사위 보정이에요.')}
        </details>
        <details class="mb4-card"><summary>🩺 낮을 때 보이는 모습</summary>
            ${B.map((b) => `<div class="mb4-hint">${b.icon} ${esc(b.name)} — 절반 아래 · 4분의 1 아래 (영어로 적으면 그대로 가요)</div><div class="mb4-btnrow">${[0, 1].map((n) => `<input class="mb4-input" data-act="sym" data-k="${esc(b.key)}" data-n="${n}" placeholder="${esc(SYMPTOM[b.key]?.[n] ?? (n ? 'badly off' : 'a bit off'))}" value="${esc(st.sym?.[b.key]?.[n] ?? '')}">`).join('')}</div>`).join('')}
        </details>
        <details class="mb4-card"><summary>⚙️ 수치 고르기</summary>
            ${B.map((b, n) => `<div class="mb4-row"><span class="mb4-row-v">${b.icon} ${esc(b.name)} <small>(${esc(b.key)})</small></span><input class="mb4-input mb4-short" maxlength="2" data-act="icon" data-v="${n}" value="${esc(b.icon)}" aria-label="아이콘"><label class="mb4-label" style="margin:0">최대<input class="mb4-input mb4-short" type="number" min="1" max="100000" data-act="max" data-v="${n}" value="${b.max}"></label><button class="mb4-x" data-act="del" data-v="${n}" aria-label="지우기">✕</button></div>`).join('')}
            <div class="mb4-btnrow"><input class="mb4-input mb4-short" data-f="icon" maxlength="2" placeholder="🙂"><input class="mb4-input" data-f="name" maxlength="12" placeholder="이름 (예: 허기)"><input class="mb4-input mb4-short" data-f="key" maxlength="16" placeholder="영어 이름"><button class="mb4-btn" data-act="add">추가</button></div>
            ${hint('영어 이름은 답을 읽는 AI가 쓰는 이름이에요 (예: hunger). 수치를 더하거나 빼면 처음부터 다시 세요. 최대를 바꾸면 지금 값은 그 안으로 맞춰져요.')}
        </details>`;
        acts(el, {
            adj: (v) => { api.fix('stat', v); },
            untag: (n) => { api.fix('tag', `-${n}`); },
            tag: () => { const n = val(el, '[data-f="tag"]'), d = val(el, '[data-f="tagd"]'), m = val(el, '[data-f="tagm"]'); if (n) api.fix('tag', `${n}${d ? ` ${d}` : ''}${m && +m ? ` | dice ${+m > 0 ? '+' : ''}${+m}` : ''}`); },
            sym: (_v, t) => { (st.sym ??= {})[t.dataset.k] ??= ['', '']; st.sym[t.dataset.k][+t.dataset.n] = t.value.trim().slice(0, 80); api.save(); },
            del: (n) => { st.bars = B.filter((_b, i) => i !== +n); api.save(); api.redraw(); },
            icon: (n, inp) => { const ic = String(inp.value).trim().slice(0, 2) || '🔹'; st.bars = B.map((b, i) => (i === +n ? { ...b, icon: ic } : b)); api.save(); api.redraw(); },
            max: (n, inp) => { const m = Math.max(1, Math.min(100000, Math.round(+inp.value) || 100)); st.bars = B.map((b, i) => (i === +n ? { ...b, max: m, start: Math.min(b.start ?? m, m) } : b)); api.save(); api.redraw(); },
            add: () => {
                const name = val(el, '[data-f="name"]'), key = (val(el, '[data-f="key"]') || name).toLowerCase().replace(/[=|]/g, '');
                if (!name || B.some((b) => b.key === key)) { api.toast('이름을 적어 주세요. 같은 이름은 못 넣어요.'); return; }
                st.bars = [...B, { key, name, icon: val(el, '[data-f="icon"]') || '🔹', max: 100, start: 100 }]; api.save(); api.redraw();
            },
        });
    },
};
