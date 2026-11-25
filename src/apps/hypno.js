// 🌀 Suggestion (최면): a story device — the person plants a suggestion in one character for a number of replies.
// Code keeps the count and the strength; the main model gets one line while it lasts. No reader key, no model call.
// A character present who trusts nobody, or a suggestion against who they are, wears off sooner (code: strength).
import { clip } from '../core/text.js';
import { esc, card, hint, acts, val, empty, bar, face, pill, optList, optCard, optWire } from '../ui/kit.js';

const STR_BASE = [['light', '가볍게', 'a faint nudge the character could shake off if someone pointed it out'], ['mid', '보통', 'a firm suggestion the character follows without noticing why'], ['deep', '깊게', 'a deep suggestion the character acts on as if it were their own idea']];
const D_STR = STR_BASE.map(([id, name, ai]) => ({ id, icon: '', name, ai }));
let STR = STR_BASE;
const strOf = (cfg) => { const hide = cfg?.opts?.str?.hide ?? {}; return [...optList(cfg, 'str', D_STR), ...D_STR.filter((d) => hide[d.id]).map((d) => ({ ...d, hidden: true }))].map((x) => [x.id, x.name, x.ai, !!x.hidden]); };
const LEN = [3, 5, 10];
const cast = (env) => [...new Set([...(env.peek?.('scene')?.with ?? []), ...Object.values(env.peek?.('people')?.list ?? {}).filter((p) => !p.gone).map((p) => p.name), env.char])].filter((n) => n && n !== env.user);

export default {
    api: 1, id: 'hypno', name: '최면', icon: '🌀', color: '#7b2cbf', cost: 'zero',
    desc: '한 인물에게 암시를 걸어요. 정한 답 수만큼 그 인물이 영문도 모르고 따르다가, 풀리면 원래대로 돌아와요. AI를 부르지 않아요.',
    note(_S, env) {
        STR = strOf(env.cfg);
        const L = (env.store.on ?? []).filter((x) => x.left > 0);
        if (!L.length) return null;
        const here = env.peek?.('scene')?.with ?? null;
        const now = L.filter((x) => !here || here.includes(x.who)).map((x) => `${x.who} is under a suggestion (${STR.find((s) => s[0] === x.str)?.[2] ?? STR[1][2]}): "${clip(x.text, 200)}". ${x.who} does not know it and never mentions it; everything else about ${x.who} stays in character.${x.left === 1 ? ' It is wearing off: by the end of this reply a flicker of confusion shows.' : ''}`);
        return now.length ? { now: now.slice(0, 2) } : null;
    },
    onReply(env) {
        const st = env.store; if (!(st.on ?? []).length) return false;
        if (env.gen === 'swipe' || env.gen === 'regenerate') return false;
        const here = env.peek?.('scene')?.with ?? null;
        for (const x of st.on) if (!here || here.includes(x.who)) x.left -= 1;      // only counts while they are on the page
        const done = st.on.filter((x) => x.left <= 0);
        if (done.length) { (st.past ??= []).push(...done.map((x) => ({ who: x.who, text: x.text }))); if (st.past.length > 15) st.past.splice(0, st.past.length - 15); st.on = st.on.filter((x) => x.left > 0); }
        return true;
    },
    hud: (_S, env) => ((env.store.on ?? []).length ? [`🌀 ${env.store.on.length}`] : []),
    widget: (_S, env) => (env.store.on ?? []).slice(0, 2).map((x) => `<div class="mb4-row"><span class="mb4-row-k">🌀 ${esc(x.who)}</span><span class="mb4-row-v">${esc(clip(x.text, 40))} <small>${x.left}답</small></span></div>`).join(''),
    widgetTitle: '걸린 암시',
    render(el, api) {
        STR = strOf(api.cfg);
        const st = api.store, env = api.env, all = cast(env);
        st.on = Array.isArray(st.on) ? st.on : [];
        const who = all.includes(st.who) ? st.who : all[0] ?? '', str = STR.some((s) => s[0] === st.str) ? st.str : 'mid', len = LEN.includes(st.len) ? st.len : 5;
        el.innerHTML = `${st.on.length ? st.on.map((x, n) => card(`${face(x.who)} ${esc(x.who)} ${pill(STR.find((s) => s[0] === x.str)?.[1] ?? '')}`, `<p>「${esc(x.text)}」</p>${bar((x.left / x.len) * 100, 'mid')}<div class="mb4-btnrow tight"><small class="mb4-dim" style="flex:1">${x.left}답 남음 · 그 사람이 장면에 있을 때만 줄어요</small><button class="mb4-btn ghost sm" data-act="wake" data-v="${n}">👏 깨우기</button></div>`)).join('') : empty('🌀', '걸린 암시가 없어요')}
        ${card('암시 걸기', `${all.length ? `<div class="mb4-chips">${all.map((n) => `<button class="mb4-opt${n === who ? ' on' : ''}" data-act="who" data-v="${esc(n)}">${face(n)} ${esc(n)}</button>`).join('')}</div>` : hint('걸 사람이 없어요. 👥 인물이나 🧭 장면을 켜 주세요.')}
            <textarea class="mb4-input" rows="2" data-f="text" maxlength="200" placeholder="예: 비가 오면 꼭 우산을 같이 쓰자고 한다" style="margin-top:8px"></textarea>
            <div class="mb4-chips" style="margin-top:6px">${STR.filter((x) => !x[3]).map(([id, n]) => `<button class="mb4-opt${str === id ? ' on' : ''}" data-act="str" data-v="${id}">${n}</button>`).join('')}</div>
            <div class="mb4-chips" style="margin-top:6px">${LEN.map((n) => `<button class="mb4-opt${len === n ? ' on' : ''}" data-act="len" data-v="${n}">${n}답 동안</button>`).join('')}</div>
            <div class="mb4-btnrow"><button class="mb4-btn wide" data-act="cast" ${who ? '' : 'disabled'}>🌀 걸기</button></div>`)}
        ${(st.past ?? []).length ? card('풀린 암시', st.past.slice().reverse().slice(0, 6).map((x) => `<div class="mb4-row mb4-dim"><span class="mb4-row-v">${esc(x.who)}: ${esc(x.text)}</span></div>`).join('')) : ''}
        ${optCard(api.cfg, 'str', D_STR, { title: '암시 세기', fields: ['name', 'ai'], aiLabel: '어떤 세기인지 (예: a whisper the character barely notices)' })}
        ${hint('한 사람에 하나씩, 모두 세 개까지. 같은 답을 다시 뽑아도 남은 답 수는 줄지 않아요.')}`;
        optWire(el, api.cfg, () => { api.save(); api.redraw(); });
        acts(el, {
            who: (n) => { st.who = n; api.save(); api.redraw(); },
            str: (v) => { st.str = v; api.save(); api.redraw(); },
            len: (v) => { st.len = +v; api.save(); api.redraw(); },
            wake: (n) => { const x = st.on.splice(+n, 1)[0]; if (x) (st.past ??= []).push({ who: x.who, text: x.text }); api.save(); api.redraw(); },
            cast: () => {
                const text = val(el, '[data-f="text"]'); if (!text) { api.toast('암시 내용을 적어 주세요.'); return; }
                st.on = st.on.filter((x) => x.who !== who);
                if (st.on.length >= 3) { api.toast('세 개까지만 걸 수 있어요.'); return; }
                st.on.push({ who, text: clip(text, 200), str, len, left: len });
                api.save(); api.redraw(); api.toast('🌀 걸었어요. 다음 답부터 따라요.');
            },
        });
    },
};
