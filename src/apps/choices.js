// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
import { todayLuck, fitToday } from '../core/luck.js';
import { optList } from '../ui/kit.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// 🎯 Choices: the numbered options at the end of the newest reply, easy to tap — or a fresh set asked for by a tap.
// Ported from the second generation's choices app: each option has a leaning (sensible · in character · need · playful ·
// head-on · leave it to chance) and stakes (ordinary · safe · gamble · price · trap, trap off by default); a gamble or a
// chance pick rolls a d20 the moment it is picked and the outcome rides along with the next reply once; each option
// shows what it would cost (wallet), its odds (gauges, needs and the day's luck from the other apps, read-only), and a
// 🍀 / ⚠ mark when it fits or goes against today's luck.
const KINDS_BASE = [
    { id: 'rational', name: '이성적으로', icon: '🧠', ai: 'the realistic, level-headed thing a sensible person would do' },
    { id: 'persona', name: '성격대로', icon: '🎭', ai: "exactly what the user's character would do by their established personality" },
    { id: 'need', name: '욕구대로', icon: '🍞', ai: "what the user's character's most urgent need or desire pushes toward" },
    { id: 'tease', name: '장난스럽게', icon: '😜', ai: 'a playful tease or prank' },
    { id: 'brave', name: '정면으로', icon: '⚔', ai: 'confront it head-on' },
    { id: 'fate', name: '운에 맡기기', icon: '🎲', check: true, ai: 'leave it to chance: a coin flip, a hunch, a random pick' },
];
let KINDS = KINDS_BASE;
const RISKS = [
    { id: 'none', name: '보통', icon: '', tone: '', ai: 'ordinary stakes' },
    { id: 'safe', name: '안전', icon: '🛡', tone: 'good', ai: 'low stakes, low reward' },
    { id: 'gamble', name: '모험', icon: '🎲', tone: 'bad', check: true, ai: 'bold: a big payoff if it works, a real cost if it fails' },
    { id: 'price', name: '대가', icon: '💸', tone: 'bad', ai: 'a sure gain that clearly costs something (money, time, trust); do NOT write the cost in the option text' },
    { id: 'trap', name: '함정', icon: '🪤', tone: 'bad', off: true, looks: 'safe', ai: 'reads like a sensible, safe option, but ONE detail quietly contradicts the story; an attentive reader can spot it' },
];
const RESULT = {
    trap: 'It was a TRAP: the hidden flaw springs now. Show a concrete, lasting consequence; do not soften it.',
    price: 'Deliver the gain AND make the user\'s character pay a fitting cost.',
    win: 'The gamble PAYS OFF: give a clear, tangible gain.', lose: 'It GOES WRONG: a real, recoverable cost.',
    crit: 'CRITICAL SUCCESS: better than hoped, with a lucky bonus.', fumble: 'CRITICAL FAILURE: the worst plausible outcome.',
};
// today's luck: one shared source with 🎲 dice and 🔮 fortune
const luck = (env) => todayLuck(env, 'choices');
const fit = fitToday;
// modifiers read from other apps (read-only): danger gauges −2, low −1, conditions with a dice value, empty needs
function mods(env) {
    const st = env.peek?.('stats'), life = env.peek?.('life');
    let n = 0;
    if (st?.v) for (const [k, v] of Object.entries(st.v)) { const p = (v / (st.max?.[k] ?? 100)) * 100; n += p <= 25 ? -2 : p <= 50 ? -1 : 0; }
    for (const t of st?.tags ?? []) n += t.dice || 0;
    if (life) n -= Math.min(2, ['food', 'rest', 'clean'].filter((k) => (life[k] ?? 100) <= 10).length);
    n += todayLuck(env, 'choices')?.n ?? 0;
    return Math.max(-6, Math.min(6, n));
}
const chance = (target, mod) => Math.max(5, Math.min(95, (21 - (target - mod)) * 5));
// what an option would cost: a price written in the option, against the wallet (read-only): { text, ok } | null
function cost(env, label) {
    const W = env.peek?.('wallet');
    const m = String(label).replace(/,/g, '').match(/(\d{1,7})\s*(원|골드|냥|gold|coins?|달러|\$)/i);
    if (!W || !m) return null;
    const price = +m[1];
    return { text: `💰 −${price} → 남는 돈 ${W.cash - price}`, ok: W.cash >= price };
}
// Numbered options at the end of a reply: [{ label, kind?, risk? }]. "1. [brave|gamble] label" carries its tags.
function findChoices(text) {
    const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-14), out = [];
    for (const l of lines) {
        const m = l.match(/^(?:\*\*)?(?:\(?\d{1,2}[.)]|[①-⑨]|[A-Da-d][.)])\s*(?:\*\*)?\s*(.{2,240}?)(?:\*\*)?$/);
        if (!m) { if (out.length) out.length = 0; continue; }
        const t = m[1].replace(/\*+/g, '').trim(), tag = t.match(/^\[\s*([a-z]+)\s*\|\s*([a-z]+)\s*\]\s*(.+)$/i);
        out.push(tag ? { label: tag[3].trim(), kind: tag[1].toLowerCase(), risk: tag[2].toLowerCase() } : { label: t });
    }
    return out.length >= 2 ? out.slice(0, 6) : [];
}
const fromReply = (env) => findChoices(env.recent(1)[0]);
const current = (env) => { const a = env.store.asked; return a && a.at === env.last && a.list?.length ? a.list : fromReply(env); };

export default {
    _t: { findChoices, luck, fit, chance, cost },   // for tests only; not part of the app contract
    api: 1, id: 'choices', name: '선택지', icon: '🎯', color: '#ef476f', cost: 'tap',
    desc: 'AI 답 끝의 선택지를 누르기 쉬운 목록으로 보여 주고, 누르면 입력창에 넣어 줘요.',
    note(_s, env) {
        KINDS = optList(env.cfg, 'kinds', KINDS_BASE);
        const now = [], p = env.store.picked;
        // the outcome of a picked gamble / chance / price / trap goes with the next reply once
        if (p && p.at === env.last && p.result) now.push(`The user chose: "${clip(p.label, 160)}". ${RESULT[p.result]} Do not mention dice or numbers.`);
        if (env.cfg.ask) {
            const kinds = KINDS.filter((k) => env.cfg.kinds?.[k.id] !== false), risks = RISKS.filter((r) => (r.off ? env.cfg.risks?.[r.id] === true : env.cfg.risks?.[r.id] !== false));
            now.push(`End this reply with ${env.cfg.count ?? 3} short numbered options for what the user's character could do next, each a different leaning (${kinds.map((k) => `${k.id}: ${k.ai}`).join('; ')}) and stakes (${risks.map((r) => `${r.id}: ${r.ai}`).join('; ')}). Write each as "1. [leaning|stakes] option". Nothing after the list.`);
        }
        return now.length ? { now } : null;
    },
    onReply(env) { if (env.store.picked && (env.last ?? 0) > env.store.picked.at) { delete env.store.picked; return true; } return false; },
    hud: (_s, env) => { const n = current(env).length; return [...(n ? [`🎯 ${n}`] : []), ...(env.store.picked?.result ? [`🎲 ${{ win: '성공', crit: '대성공', lose: '실패', fumble: '대실패', trap: '함정!', price: '대가' }[env.store.picked.result]}`] : [])]; },
    widget: (_s, env) => current(env).slice(0, 3).map((c, n) => `<div class="mb4-row"><span class="mb4-row-k">${n + 1}</span><span class="mb4-row-v">${esc(clip(c.label, 60))}</span></div>`).join(''),
    render(el, api) {
        KINDS = optList(api.cfg, 'kinds', KINDS_BASE);
        const env = api.env, st = api.store, cfg = api.cfg, k = api.kit, L = current(env), lk = luck(env), mod = mods(env), target = cfg.target ?? 12;
        cfg.kinds ??= {}; cfg.risks ??= {};
        const row = (c, n) => {
            const kd = KINDS.find((x) => x.id === c.kind), rk0 = RISKS.find((x) => x.id === c.risk), rk = rk0?.looks ? RISKS.find((x) => x.id === rk0.looks) : rk0;
            const check = kd?.check || rk?.check, f = fit(lk, c.label), cs = cost(env, c.label);
            return `<button class="mb4-pick" data-act="pick" data-v="${n}"><span class="mb4-pick-ico">${kd?.icon ?? n + 1}</span><span class="mb4-pick-t">${esc(c.label)}
                <small>${[kd ? esc(kd.name) : '', rk && rk.id !== 'none' ? `${rk.icon} ${esc(rk.name)}` : '', check ? `🎲 ${chance(target, mod + (f > 0 ? 1 : f < 0 ? -1 : 0))}%` : '', f > 0 ? '🍀 오늘과 맞음' : f < 0 ? '⚠ 오늘은 조심' : '', cs ? `<span class="${cs.ok ? '' : 'mb4-bad'}">${esc(cs.text)}${cs.ok ? '' : ' · 돈이 모자라요'}</span>` : ''].filter(Boolean).join(' · ')}</small></span></button>`;
        };
        el.innerHTML = `${lk ? k.card('', `<div class="mb4-row"><span class="mb4-row-k">🍀 오늘 운 ${'★'.repeat(lk.stars)}${'☆'.repeat(5 - lk.stars)}${lk.name ? ` <small>${esc(lk.name)}</small>` : ''}</span><span class="mb4-row-v">${esc(lk.good.good)} 좋은 날 · ${esc(lk.bad.bad)}</span></div>`) : ''}
        ${L.length ? k.card('이번 답의 선택지', L.map(row).join('')) : k.empty('🎯', '이번 답에는 선택지가 없어요', '답 끝에 1. 2. 3. 처럼 번호가 붙은 줄이 있으면 여기 나와요')}
        <div class="mb4-btnrow"><button class="mb4-btn wide" data-act="ask">✨ 선택지 받기 (AI 1번)</button></div>
        ${k.card('', `<label class="mb4-sw"><span><b>답마다 AI가 선택지를 같이 쓰게</b><small>답마다 한 줄이 더 붙어요</small></span><input type="checkbox" data-act="auto" ${cfg.ask ? 'checked' : ''}><i></i></label>
            <div class="mb4-btnrow tight">${[3, 4, 5, 6].map((n) => `<button class="mb4-btn ${(cfg.count ?? 3) === n ? '' : 'ghost '}sm" data-act="count" data-v="${n}">${n}개</button>`).join('')}</div>
            <details><summary class="mb4-hint">성향 · 위험 고르기</summary><div class="mb4-chips">${KINDS.map((x) => `<button class="mb4-btn ${cfg.kinds[x.id] !== false ? '' : 'ghost '}sm" data-act="kind" data-v="${x.id}">${x.icon} ${esc(x.name)}</button>`).join('')}</div>
            <div class="mb4-chips" style="margin-top:6px">${RISKS.map((x) => { const on = x.off ? cfg.risks[x.id] === true : cfg.risks[x.id] !== false; return `<button class="mb4-btn ${on ? '' : 'ghost '}sm" data-act="risk" data-v="${x.id}">${x.icon || '·'} ${esc(x.name)}</button>`; }).join('')}</div></details>`)}
        ${Array.isArray(st.hist) && st.hist.length ? k.card('지난 선택', st.hist.slice(-6).reverse().map((h) => `<div class="mb4-row"><span class="mb4-row-k">${KINDS.find((x) => x.id === h.kind)?.icon ?? '·'}${h.day ? ` <small>${h.day}일째</small>` : ''}</span><span class="mb4-row-v">${esc(h.label)}${h.result ? ` <small>${{ win: '🎲 성공', crit: '🎲 대성공', lose: '🎲 실패', fumble: '🎲 대실패', trap: '🪤 함정', price: '💸 대가' }[h.result] ?? ''}</small>` : ''}</span></div>`).join('') + (() => { const c = {}; for (const h of st.hist) if (h.kind) c[h.kind] = (c[h.kind] ?? 0) + 1; const top = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; return top && st.hist.length >= 5 ? k.hint(`가장 자주 고른 성향: ${KINDS.find((x) => x.id === top[0])?.icon ?? ''} ${KINDS.find((x) => x.id === top[0])?.name ?? top[0]} (${top[1]}번)`) : ''; })()) : ''}
        ${k.optCard(cfg, 'kinds', KINDS_BASE, { title: '선택지 성향' })}
        ${k.hint('누르면 입력창에 들어가요. 🎲 모험 · 운에 맡기기는 고르는 순간 굴려서, 결과가 다음 답에 한 번 따라가요. 함정은 「안전」처럼 보여요(기본 꺼짐).')}`;
        k.optWire(el, cfg, () => { api.save(); api.redraw(); });
        k.acts(el, {
            pick: (n) => {
                const c = L[+n], kd = KINDS.find((x) => x.id === c.kind), rk = RISKS.find((x) => x.id === c.risk);
                let result = rk?.id === 'trap' ? 'trap' : rk?.id === 'price' ? 'price' : '';
                if (kd?.check || rk?.check) { const d = 1 + Math.floor(Math.random() * 20), f = fit(lk, c.label); result = d === 20 ? 'crit' : d === 1 ? 'fumble' : d + mod + (f > 0 ? 1 : f < 0 ? -1 : 0) >= target ? 'win' : 'lose'; }
                st.picked = { label: c.label, kind: c.kind ?? '', risk: c.risk ?? '', result, at: env.last ?? 0 };
                (st.hist = Array.isArray(st.hist) ? st.hist : []).push({ label: clip(c.label, 120), kind: c.kind ?? '', result, day: env.peek('scene')?.day ?? null }); if (st.hist.length > 30) st.hist.shift();
                api.save(); api.say(c.label);
                if (result) api.toast({ win: '🎲 성공!', crit: '🎲 대성공!', lose: '🎲 실패…', fumble: '🎲 대실패…', trap: '🪤 …', price: '💸 대가가 따라요' }[result]);
                api.close();
            },
            ask: async (_v, b) => {
                b.disabled = true; b.textContent = '받는 중…';
                const kinds = KINDS.filter((x) => cfg.kinds[x.id] !== false), risks = RISKS.filter((x) => (x.off ? cfg.risks[x.id] === true : cfg.risks[x.id] !== false));
                const raw = await api.ask(`[TASK] Do NOT continue the story. Offer ${cfg.count ?? 4} options for what ${env.user || 'the user'}'s character could do next, right after the latest part of the story.\n\n[What is known]\n${api.facts() || '(nothing recorded)'}\n\n[Latest part of the story]\n${clip(env.recent(1)[0] ?? '', 1800)}\n\nEach option has a different leaning — ${kinds.map((x) => `${x.id}: ${x.ai}`).join('; ')} — and stakes — ${risks.map((x) => `${x.id}: ${x.ai}`).join('; ')}.\nWrite in the language of the story, one line each, exactly: "1. [leaning|stakes] what they do (one short sentence)". Nothing else.`, 500);
                st.asked = { at: env.last ?? 0, list: findChoices(raw) };
                if (!st.asked.list.length) api.toast('선택지를 받지 못했어요.');
                api.save(); api.redraw();
            },
            auto: (_v, c) => { cfg.ask = c.checked; api.save(); },
            count: (n) => { cfg.count = +n; api.save(); api.redraw(); },
            kind: (id) => { cfg.kinds[id] = cfg.kinds[id] === false; api.save(); api.redraw(); },
            risk: (id) => { const x = RISKS.find((r) => r.id === id), on = x.off ? cfg.risks[id] === true : cfg.risks[id] !== false; cfg.risks[id] = !on; api.save(); api.redraw(); },
        });
    },
};
