// 📝 Memo: notes the person writes for this chat — several, each switched on or off for the AI, each pinned or not.
// Sent as written; nothing is read, nothing is called. A note can be marked «this scene only»: it switches itself
// off when 🧭 Scene's place changes (code only).
import { clip } from '../core/text.js';
import { esc, card, hint, acts } from '../ui/kit.js';

const MAX = 8, PER = 400, TOTAL = 1200;
const COLORS = ['#ffe8a3', '#d7f0dd', '#dbe8ff', '#ffd9e0', '#eadcff'];
function items(st) {
    if (!Array.isArray(st.items)) { st.items = st.text ? [{ t: String(st.text), on: st.send !== false, pin: true }] : []; delete st.text; delete st.send; }
    return st.items;
}
const place = (env) => env.peek?.('scene')?.loc ?? '';

export default {
    api: 1,
    id: 'memo',
    name: '메모',
    icon: '📝',
    color: '#43aa8b',
    cost: 'zero',
    desc: '이 채팅에서 AI가 늘 기억했으면 하는 걸 여러 장 적어 둬요. 장마다 보낼지 말지, 이 장면에서만인지 골라요.',
    note(_S, env) {
        const loc = place(env);
        const L = items(env.store).filter((x) => x.on && String(x.t).trim() && (!x.scene || x.scene === loc));
        if (!L.length) return null;
        let used = 0;
        const out = [];
        for (const x of L.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0))) { const t = clip(x.t, PER); if (used + t.length > TOTAL) break; used += t.length; out.push(t); }
        return { state: [`The user's standing notes for this story: ${out.join(' / ')}`] };
    },
    widget: (_S, env) => items(env.store).filter((x) => x.pin || x.on).slice(0, 2).map((x) => `<div class="mb4-memo">${esc(clip(x.t, 90))}</div>`).join(''),
    render(el, api) {
        const st = api.store, L = items(st), loc = place(api.env);
        el.innerHTML = `${L.map((x, n) => `<section class="mb4-card" style="background:${COLORS[n % COLORS.length]}">
            <textarea class="mb4-input" data-act="text" data-n="${n}" rows="3" maxlength="${PER}" placeholder="예: 지금은 겨울. 존댓말을 유지할 것.">${esc(x.t)}</textarea>
            <div class="mb4-btnrow tight">
                <button class="mb4-btn ${x.on ? '' : 'ghost '}sm" data-act="on" data-v="${n}">${x.on ? '🤖 AI에 보냄' : '🙈 나만 봄'}</button>
                <button class="mb4-btn ${x.pin ? '' : 'ghost '}sm" data-act="pin" data-v="${n}">📌 ${x.pin ? '고정됨' : '고정'}</button>
                ${loc ? `<button class="mb4-btn ${x.scene ? '' : 'ghost '}sm" data-act="scene" data-v="${n}">${x.scene ? `📍 ${esc(clip(x.scene.split('>').pop(), 12))}에서만` : '📍 이 장면에서만'}</button>` : ''}
                <button class="mb4-x" data-act="del" data-v="${n}" aria-label="지우기">✕</button>
            </div>${x.scene && x.scene !== loc ? '<small class="mb4-dim">다른 곳이라 지금은 안 보내요</small>' : ''}</section>`).join('')}
        ${L.length < MAX ? '<button class="mb4-btn ghost wide" data-act="add">＋ 메모 한 장 더</button>' : ''}
        ${hint(`한 장에 ${PER}자, 보내는 건 모두 합쳐 ${TOTAL}자까지(고정한 것부터). 「이 장면에서만」은 장소가 바뀌면 저절로 안 보내요.`)}`;
        acts(el, {
            text: (_v, t) => { L[+t.dataset.n].t = t.value.trim(); api.save(); },
            on: (n) => { L[+n].on = !L[+n].on; api.save(); api.redraw(); },
            pin: (n) => { L[+n].pin = !L[+n].pin; api.save(); api.redraw(); },
            scene: (n) => { L[+n].scene = L[+n].scene ? '' : loc; api.save(); api.redraw(); },
            del: (n) => { L.splice(+n, 1); api.save(); api.redraw(); },
            add: () => { L.push({ t: '', on: true, pin: false }); api.save(); api.redraw(); },
        });
    },
};
