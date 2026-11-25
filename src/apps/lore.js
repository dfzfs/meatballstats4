// 📖 Lore book: facts about the world the person writes once. Load design: an entry travels with a reply ONLY when
// one of its trigger words shows up in the person's last message, the newest reply, the place or the people present
// (code match, no model call) — or when it is pinned. A draft can be asked from the model by a tap (one call).
import { clip } from '../core/text.js';
import { esc, card, hint, acts, val, empty, pill } from '../ui/kit.js';

const MAX = 40, PER = 500, SEND = 4;
const list = (env) => (Array.isArray(env.card?.list) ? env.card.list : (env.card.list = []));   // follows the character into every chat
const keysOf = (e) => String(e.keys ?? '').split(/[,，、]/).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2);
function hits(env) {
    const sc = env.peek?.('scene');
    const hay = [env.lastUser?.() ?? '', env.recent?.(1)[0] ?? '', sc?.loc ?? '', (sc?.with ?? []).join(' ')].join('\n').toLowerCase();
    return list(env).filter((e) => e.on !== false && String(e.text ?? '').trim() && (e.pin || [String(e.name ?? '').toLowerCase(), ...keysOf(e)].some((k) => k.length >= 2 && hay.includes(k))));
}

export default {
    api: 1, id: 'lore', name: '설정집', icon: '📖', color: '#8d6e63', cost: 'zero',
    desc: '세계 · 장소 · 물건 · 규칙을 적어 두면, 그 말이 나온 답에만 골라서 AI에 알려 줘요. 캐릭터를 따라 모든 채팅에 이어져요.',
    note(_S, env) {
        const H = hits(env).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0)).slice(0, SEND);
        return H.length ? { state: H.map((e) => `Lore — ${e.name}: ${clip(e.text, PER)}`) } : null;
    },
    hud: (_S, env) => { const n = hits(env).length; return n ? [`📖 ${n}`] : []; },
    widget: (_S, env) => { const H = hits(env); return H.length ? H.slice(0, 3).map((e) => `<div class="mb4-row"><span class="mb4-row-k">📖 ${esc(e.name)}</span><span class="mb4-row-v">${esc(clip(e.text, 50))}</span></div>`).join('') : ''; },
    widgetTitle: '지금 알려 주는 설정',
    render(el, api) {
        const env = api.env, L = list(env), H = new Set(hits(env)), open = api.store._open ?? -1;
        el.innerHTML = `${L.length ? L.map((e, n) => `<details class="mb4-card" ${open === n ? 'open' : ''} data-n="${n}"><summary><b>${esc(e.name || '(이름 없음)')}</b> ${H.has(e) ? pill('지금 보냄', 'good') : ''}${e.pin ? pill('📌 늘') : ''}${e.on === false ? pill('쉼', 'bad') : ''}</summary>
            <label class="mb4-label">이름<input class="mb4-input" data-act="set" data-n="${n}" data-k="name" maxlength="40" value="${esc(e.name ?? '')}"></label>
            <label class="mb4-label">이 말이 나오면 꺼내기 (쉼표로)<input class="mb4-input" data-act="set" data-n="${n}" data-k="keys" maxlength="120" placeholder="예: 등대, 등대지기, lighthouse" value="${esc(e.keys ?? '')}"></label>
            <label class="mb4-label">내용<textarea class="mb4-input" rows="4" data-act="set" data-n="${n}" data-k="text" maxlength="${PER}">${esc(e.text ?? '')}</textarea></label>
            <div class="mb4-btnrow tight"><button class="mb4-btn ${e.pin ? '' : 'ghost '}sm" data-act="pin" data-v="${n}">📌 늘 보내기</button><button class="mb4-btn ${e.on === false ? '' : 'ghost '}sm" data-act="off" data-v="${n}">${e.on === false ? '▶ 다시 쓰기' : '⏸ 쉬기'}</button><button class="mb4-btn ghost sm" data-act="draft" data-v="${n}">✨ 이야기에서 뽑아 쓰기 (AI 1회)</button><button class="mb4-x" data-act="del" data-v="${n}" aria-label="지우기">✕</button></div></details>`).join('') : empty('📖', '아직 적은 설정이 없어요', '장소 · 물건 · 조직 · 세계의 규칙을 한 장씩 적어 보세요')}
        ${L.length < MAX ? `<div class="mb4-btnrow"><input class="mb4-input" data-f="new" maxlength="40" placeholder="새 설정 이름"><button class="mb4-btn" data-act="add">＋ 넣기</button></div>` : ''}
        ${hint(`이름이나 꺼내는 말이 내 글 · 방금 답 · 지금 장소 · 같이 있는 사람에 나오면 그 답에만 보내요(한 답에 ${SEND}장까지). 영어 이야기라면 꺼내는 말에 영어도 같이 적어 주세요.`)}`;
        el.querySelectorAll('details[data-n]').forEach((d) => d.addEventListener('toggle', () => { api.store._open = d.open ? +d.dataset.n : -1; }));
        acts(el, {
            set: (_v, b) => { L[+b.dataset.n][b.dataset.k] = b.value.trim(); api.save(); },
            pin: (n) => { L[+n].pin = !L[+n].pin; api.save(); api.redraw(); },
            off: (n) => { L[+n].on = L[+n].on === false; api.save(); api.redraw(); },
            del: (n) => { L.splice(+n, 1); api.store._open = -1; api.save(); api.redraw(); },
            add: () => { const name = val(el, '[data-f="new"]'); if (!name) return; L.push({ name, keys: '', text: '', on: true, pin: false }); api.store._open = L.length - 1; api.save(); api.redraw(); },
            draft: async (n, b) => {
                const e = L[+n]; if (!e.name) { api.toast('이름을 먼저 적어 주세요.'); return; }
                b.disabled = true; b.textContent = '쓰는 중…';
                const raw = await api.ask(`[TASK] Do NOT continue the story. Write a short lore entry about "${e.name}" for this story, using only what the story has established; where it has said nothing, stay vague rather than inventing big facts.\n\n[What is known]\n${api.facts() || '(nothing recorded)'}\n\n[Latest part of the story]\n${clip(env.recent(2).join('\n\n'), 2500)}\n\nTwo to four plain sentences in English, under 400 characters. Then a last line: KEYS: three to five trigger words, comma-separated (the name in the story's language and in English). Output only that.`, 400);
                if (!raw) { api.toast('받지 못했어요.'); api.redraw(); return; }
                const m = String(raw).match(/KEYS:\s*(.+)\s*$/im);
                e.text = clip(String(raw).replace(/KEYS:.*$/ims, '').trim(), PER);
                if (m && !e.keys) e.keys = clip(m[1], 120);
                api.save(); api.redraw();
            },
        });
    },
};
