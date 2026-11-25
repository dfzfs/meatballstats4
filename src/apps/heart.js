// 💗 Heart: affection and trust as numbers, jealousy, a side-by-side of everyone's feelings, and yes/no cards for a
// confession, a proposal and a breakup. It asks the reader NOTHING: every number is worked out by code from the lines
// 💞 Bonds already records (move · touch · feel · refuse · yield · tie) and from who is present (🧭 Scene's «with»).
// Scores are per direction (what A feels toward B), so two people can differ.
import { clip } from '../core/text.js';
import { esc, card, bar, hint, acts, empty, pill, face } from '../ui/kit.js';

const START = { a: 20, t: 20 };
const MOVE = { closer: [4, 2], back: [-3, -1], wavering: [0, -1], crack: [-2, -4], clash: [-3, -3], same: [0, 0] };   // [affection, trust]
const TOUCH = { none: 0, brush: 1, hand: 2, hug: 3, kiss: 5, more: 6 };
const FEEL = { attraction: [5, 0], desire: [4, 0], lingering: [3, 0], 'love-hate': [2, -2], 'forbidden pull': [4, -1], resentment: [-5, -4], bond: [3, 5], none: [0, 0] };
const LOVER = /lover|couple|dating|engaged|married|연인|애인|사귀|약혼|부부/i, WED = /engaged|married|약혼|부부/i, BREAK = /broke|ex-|former|separated|헤어|이별|파혼/i;
const clampN = (n) => Math.max(0, Math.min(100, Math.round(n)));
const split = (v) => { const i = String(v).indexOf('='); return i < 0 ? null : [String(v).slice(0, i).trim(), String(v).slice(i + 1).trim()]; };
const dir = (lhs, sep = '>') => { const i = lhs.indexOf(sep); if (i < 0) return null; const a = lhs.slice(0, i).trim(), b = lhs.slice(i + 1).trim(); return a && b && a !== b ? [a, b] : null; };
const names = (v) => String(v).split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
const LEVELS = [[85, '깊이 사랑함', 'love'], [70, '좋아함', 'love'], [50, '호감', 'good'], [30, '편한 사이', ''], [15, '서먹함', ''], [0, '차가움', 'bad']];
const levelOf = (a) => LEVELS.find(([n]) => a >= n);
const get = (S, a, b) => (S.d[`${a}>${b}`] ??= { a: START.a, t: START.t, j: 0, hist: [] });
function bump(S, a, b, da, dt, why, i) {
    const d = get(S, a, b), a0 = d.a;
    d.a = clampN(d.a + da); d.t = clampN(d.t + dt);
    if (da || dt) { d.hist.push({ da: d.a - a0, dt, why, i }); if (d.hist.length > 12) d.hist.shift(); }
    return d;
}
// Chance (0-95) that `who` says yes to the user, by code: affection and trust decide, the kind of ask sets the bar.
export function yesChance(d, kind) {
    const base = kind === 'confess' ? d.a * 1.1 + d.t * 0.4 - 55 : kind === 'propose' ? d.a * 1.0 + d.t * 0.8 - 95 : 0;
    return Math.max(0, Math.min(95, Math.round(base * 2)));
}

export default {
    api: 1, id: 'heart', name: '호감', icon: '💗', color: '#ff5d8f', cost: 'zero',
    desc: '애정 · 신뢰를 숫자로, 질투와 여러 사람의 마음 비교, 고백 · 청혼 · 이별 카드까지. 💞 관계가 적은 것을 받아서 셈하니 AI에 더 묻지 않아요.',
    watch: ['move', 'touch', 'feel', 'refuse', 'yield', 'tie', 'with'],
    start: () => ({ d: {}, here: [], ties: {}, jl: [] }),
    reduce(S, { k, v, i }, env) {
        const me = env?.user ?? '';
        if (k === 'with') {
            const t = String(v).trim();
            if (/^=?\s*\(?\s*(?:none|nobody|no one|alone|empty|-)?\s*\)?\s*$/i.test(t)) S.here = [];
            else if (t.startsWith('=')) S.here = names(t.slice(1));
            else for (const p of t.split(/\s*[;/]\s*|\s+(?=[+-])/)) { const n = p.slice(1).trim(); if (p.startsWith('+') && n && !S.here.includes(n)) S.here.push(n); if (p.startsWith('-')) S.here = S.here.filter((x) => x !== n); }
            return;
        }
        const s = split(v); if (!s) return;
        if (k === 'tie') { const p = dir(s[0], '-'); if (p) { S.ties[[...p].sort().join(' & ')] = clip(s[1], 40); if (BREAK.test(s[1])) for (const [a, b] of [p, [p[1], p[0]]]) bump(S, a, b, -15, -20, '헤어짐', i); else if (LOVER.test(s[1])) for (const [a, b] of [p, [p[1], p[0]]]) bump(S, a, b, 10, 8, '사이가 정해짐', i); } return; }
        const p = dir(s[0]); if (!p) return;
        const [a, b] = p, word = s[1].split('/')[0].trim().toLowerCase();
        if (k === 'move') {
            const m = MOVE[word]; if (!m) return;
            bump(S, a, b, m[0], m[1], { closer: '다가감', back: '물러남', wavering: '흔들림', crack: '금이 감', clash: '부딪힘' }[word] ?? '', i);
            // jealousy: someone present who likes B (or A) a lot sees the two get closer
            if (word === 'closer') for (const w of S.here) {
                if (w === a || w === b) continue;
                for (const target of [a, b]) { const d = S.d[`${w}>${target}`]; if (d && d.a >= 50) { d.j = clampN(d.j + 12 + Math.round((d.a - 50) / 5)); S.jl.push({ who: w, of: target, with: target === a ? b : a, i }); if (S.jl.length > 20) S.jl.shift(); } }
            }
        } else if (k === 'touch') { const n = TOUCH[word]; if (n) bump(S, a, b, n, Math.ceil(n / 2), '스킨십', i); }
        else if (k === 'feel') { const f = FEEL[word]; if (f) bump(S, a, b, f[0], f[1], '마음의 결', i); }
        else if (k === 'refuse') bump(S, b, a, -2, -1, '거절당함', i);     // B was turned away by A
        else if (k === 'yield') bump(S, b, a, 1, 3, '받아 줌', i);
        // jealousy cools a little with every line about that pair
        for (const d of Object.values(S.d)) if (d.j > 0) d.j = Math.max(0, d.j - 1);
        void me;
    },
    // ✏️ 애정 · 신뢰 set by hand: kept as a difference per pair, laid over what the story adds up to
    adjust(S, env) { for (const [k, x] of Object.entries(env.store?.adj ?? {})) { const d = S.d[k]; if (!d) continue; if (x.a) d.a = clampN(d.a + x.a); if (x.t) d.t = clampN(d.t + x.t); } },
    note(S, env) {
        const me = env.user, st = env.store, now = [], state = [];
        // a card the person answered: the outcome rides with the next reply once
        const c = st.card;
        if (c && c.at === env.last) now.push(c.kind === 'breakup' ? `${me} tells ${c.who} it is over between them. ${c.who} takes it as ${c.who} would (${c.yes ? 'with quiet acceptance' : 'badly — refusing to accept it at first'}); from this reply on they are no longer together.`
            : `${me} ${c.kind === 'confess' ? 'confesses their feelings to' : 'proposes to'} ${c.who}. ${c.who} ${c.yes ? 'ACCEPTS — warmly, in their own way' : 'DECLINES — kindly or awkwardly, in their own way; it does not end what is between them'}. Write that outcome; do not reverse it.`);
        if (env.cfg.tell !== false) {
            const here = new Set(env.peek?.('scene')?.with ?? S.here);
            const L = [...here].map((n) => [n, S.d[`${n}>${me}`]]).filter(([, d]) => d && (d.hist.length || d.a !== START.a)).slice(0, 4);
            if (L.length) state.push(`How they feel toward ${me} right now (never say the numbers; let warmth and guardedness match): ${L.map(([n, d]) => `${n} — affection ${d.a}/100, trust ${d.t}/100`).join('; ')}.`);
            const J = [...here].map((n) => [n, Object.entries(S.d).filter(([k2, d]) => k2.startsWith(`${n}>`) && d.j >= 30).sort((x, y) => y[1].j - x[1].j)[0]]).filter(([, x]) => x)[0];
            if (J) now.push(`${J[0]} is jealous over ${J[1][0].split('>')[1]} — it may leak out once in this reply as a look, a clipped answer or a too-casual question. Not a scene, never explained.`);
        }
        return now.length || state.length ? { state, now } : null;
    },
    onReply(env) { const c = env.store.card; if (c && (env.last ?? 0) > c.at) { env.store.card = null; return true; } return false; },
    hud(S, env) { const me = env.user, top = Object.entries(S.d).filter(([k]) => k.endsWith(`>${me}`)).sort((a, b) => b[1].a - a[1].a)[0]; return top && top[1].hist.length ? [`💗 ${top[0].split('>')[0]} ${top[1].a}`] : []; },
    widget(S, env) { const me = env.user; return Object.entries(S.d).filter(([k, d]) => k.endsWith(`>${me}`) && d.hist.length).sort((a, b) => b[1].a - a[1].a).slice(0, 3).map(([k, d]) => `<div class="mb4-gauge"><span>${face(k.split('>')[0])} ${esc(k.split('>')[0])}</span><span class="mb4-meter"><i class="good" style="width:${d.a}%"></i></span><b>${d.a}</b></div>`).join(''); },
    widgetTitle: '호감',
    render(el, api) {
        const S = api.state(), env = api.env, me = env.user, st = api.store, cfg = api.cfg;
        if (!env.peek('bonds')) { el.innerHTML = empty('💞', '「관계」를 켜 주세요', '호감은 관계가 적어 둔 것을 받아서 셈해요'); return; }
        const toMe = Object.entries(S.d).filter(([k]) => k.endsWith(`>${me}`)).map(([k, d]) => [k.split('>')[0], d]).sort((a, b) => b[1].a - a[1].a);
        const others = Object.entries(S.d).filter(([k, d]) => !k.endsWith(`>${me}`) && !k.startsWith(`${me}>`) && d.hist.length).sort((a, b) => b[1].a - a[1].a).slice(0, 8);
        const tieOf = (n) => S.ties[[n, me].sort().join(' & ')] ?? '';
        const one = ([n, d]) => {
            const lv = levelOf(d.a), mine = S.d[`${me}>${n}`], tie = tieOf(n), lover = LOVER.test(tie) && !BREAK.test(tie), wed = WED.test(tie);
            const kind = lover ? (wed ? '' : 'propose') : 'confess';
            return card(`${face(n)} <span data-trc="name">${esc(n)}</span> ${pill(lv[1], lv[2])}${d.j >= 30 ? pill('질투 중', 'bad') : ''}${lover ? pill(wed ? '💍' : '💞', 'love') : ''}`, `
                <div class="mb4-gauges one"><div class="mb4-gauge"><span>💗 애정</span>${bar(d.a, 'good')}<b>${d.a}</b></div><div class="mb4-gauge"><span>🤝 신뢰</span>${bar(d.t, 'mid')}<b>${d.t}</b></div>${d.j ? `<div class="mb4-gauge"><span>🔥 질투</span>${bar(d.j, 'bad')}<b>${d.j}</b></div>` : ''}</div>
                ${mine ? `<small class="mb4-dim">내가 이 사람에게: 애정 ${mine.a} · 신뢰 ${mine.t}</small>` : ''}
                ${d.hist.length ? `<div class="mb4-chips" style="margin-top:6px">${d.hist.slice(-5).reverse().map((h) => `<span class="mb4-chip">${esc(h.why)} ${h.da > 0 ? `+${h.da}` : h.da < 0 ? h.da : '±0'}</span>`).join('')}</div>` : ''}
                <div class="mb4-btnrow tight">${kind ? `<button class="mb4-btn ghost sm" data-act="card" data-v="${kind}|${esc(n)}">${kind === 'confess' ? '💌 고백' : '💍 청혼'} <small>${yesChance(d, kind)}%</small></button>` : ''}${lover ? `<button class="mb4-btn ghost sm" data-act="card" data-v="breakup|${esc(n)}">💔 이별</button>` : ''}</div>`);
        };
        el.innerHTML = `${st.card ? card('', `<b>${{ confess: '💌 고백', propose: '💍 청혼', breakup: '💔 이별' }[st.card.kind]}</b> → ${esc(st.card.who)}: <b class="${st.card.yes ? 'mb4-good' : 'mb4-bad'}">${st.card.kind === 'breakup' ? (st.card.yes ? '받아들여요' : '쉽게 못 받아들여요') : st.card.yes ? '받아 줘요' : '거절해요'}</b><br><small>다음 답에 이 결과가 그대로 쓰여요.</small><div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="uncard">없던 일로</button></div>`, 'warn') : ''}
        ${toMe.length > 1 ? card('🏁 누가 가장 가까운가', toMe.slice(0, 6).map(([n, d], ix) => `<div class="mb4-gauge"><span>${ix + 1}. ${esc(n)}</span>${bar(d.a, ix ? 'mid' : 'good')}<b>${d.a}</b></div>`).join('')) : ''}
        ${toMe.length ? toMe.map(one).join('') : empty('💗', '아직 셈할 게 없어요', '누군가와 주고받는 일이 생기면 점수가 움직여요')}
        ${others.length ? card('인물끼리', others.map(([k, d]) => `<div class="mb4-row"><span class="mb4-row-k">${esc(k.replace('>', ' → '))}</span><span class="mb4-row-v">💗 ${d.a} · 🤝 ${d.t}${d.j >= 30 ? ' · 🔥' : ''}</span></div>`).join('')) : ''}
        ${S.jl.length ? card('🔥 질투가 일었던 때', S.jl.slice(-4).reverse().map((x) => `<div class="mb4-row"><span class="mb4-row-v">${esc(x.who)}: ${esc(x.of)}이(가) ${esc(x.with)}와(과) 가까워지는 걸 봄</span></div>`).join('')) : ''}
        <label class="mb4-sw"><span><b>점수를 AI에게도 알려 주기</b><small>같이 있는 사람의 애정 · 신뢰와 질투 한 줄. 끄면 화면에만 보여요.</small></span><input type="checkbox" data-act="tell" ${cfg.tell !== false ? 'checked' : ''}><i></i></label>
        ${hint('점수는 💞 관계가 적은 줄(다가감 +4 · 물러남 −3 · 부딪힘 −3 · 스킨십 · 거절 · 받아 줌)로 코드가 셈해요. 고백 · 청혼의 답은 애정과 신뢰로 정한 확률로 주사위를 굴려요.')}`;
        api.kit.editMore(el, api, [{ name: 'love', list: toMe, del: false, label: ([n]) => `${n}: 애정 | 신뢰 (0~100)`, get: ([, d]) => `${d.a} | ${d.t}`, set: ([n, d], t) => { const [a, b] = api.kit.two(t).map((x) => Math.round(+x)); const x = ((api.store.adj ??= {})[`${n}>${me}`] ??= {}); if (Number.isFinite(a) && api.kit.two(t)[0] !== '') x.a = (x.a ?? 0) + clampN(a) - d.a; if (Number.isFinite(b) && api.kit.two(t)[1] !== '') x.t = (x.t ?? 0) + clampN(b) - d.t; } }]);
        acts(el, {
            tell: (_v, b) => { cfg.tell = b.checked; api.save(); },
            uncard: () => { st.card = null; api.save(); api.redraw(); },
            card: (v) => {
                const [kind, who] = v.split('|'), d = S.d[`${who}>${me}`] ?? START;
                const yes = kind === 'breakup' ? (d.a ?? 0) < 60 : Math.random() * 100 < yesChance(d, kind);
                st.card = { kind, who, yes, at: env.last ?? 0 };
                if (kind === 'breakup') api.fix('tie', `${me}-${who}=broke up`);
                else if (yes) api.fix('tie', `${me}-${who}=${kind === 'confess' ? 'lovers' : 'engaged'}`);
                api.save(); api.redraw();
                api.say({ confess: `${who}에게 마음을 고백한다.`, propose: `${who}에게 청혼한다.`, breakup: `${who}에게 헤어지자고 말한다.` }[kind]);
                api.toast(kind === 'breakup' ? '💔 다음 답에 반영돼요.' : yes ? '💗 받아 줘요! 입력창을 보내면 답에 나와요.' : '😢 거절해요. 입력창을 보내면 답에 나와요.');
            },
        });
    },
};
