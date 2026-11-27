// 📘 Setting book (설정집): ONE text that holds the story's fixed facts — world, rules, places, people, relationships,
// routines. It is built once from the sources the person picks (character card, persona, first message, recent chat,
// any lorebook down to single entries — all read WHOLE, never cut) by one tapped model call, can be edited by hand,
// and then rides in full on every model call Meatball itself makes (🪄 schedule, 📞 texts, 📰 news, 💭 minds …; the
// reader too when switched on). It is not sent to the main story model: that one already has the card and lorebooks.
// Saved for this chat and for the character, so a new chat with the same character starts with it.
//
// Below it, the older «word notes»: facts about the world the person writes once. Load design: an entry travels with a reply ONLY when
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

export const bookOf = (env) => String(env?.store?.book ?? env?.card?.book ?? '');
let building = false;                 // while the book itself is being built, it is not attached to that call
const ui = { key: null, list: null, loading: false, open: {} };
const kChars = (n) => (n >= 10000 ? `${Math.round(n / 1000)}천 자` : n >= 1000 ? `${(n / 1000).toFixed(1)}천 자` : `${n}자`);
const BUILD = `Build the SETTING BOOK for a roleplay from the SOURCE below. Other tools will rely on this book alone, so it must be complete.
Plain text with these headers, in this order (leave a header out only when the source has nothing for it):
[WORLD] era, setting, what is going on now, the main tensions
[RULES] what always holds in this world (powers, technology, ranks, taboos, organisations)
[PLACES] one line per place: name — what it is, where it lies or what it is near, who is usually there
[USER CHARACTER] name, who they are, body and health, temperament, situation, what they want
[PEOPLE] one block per person: name (other names) — who they are, temperament, how they speak and what they call others, what they want, likes and dislikes, habits
[RELATIONSHIPS] one line per pair that matters: A – B: what they are to each other right now, and why
[ROUTINES] for each main person: their usual day in time blocks, where they go, what and whom they avoid
[NOW] where the story stands: time, place, open problems, promises
The SOURCE is the truth. It may be an alternate universe of a known work: follow the source, and never bring in people, places, powers or events the source does not use.
Keep every name exactly as the source spells it. Be complete rather than short: do not drop a person, place or rule the source gives — compress the wording, not the content. Write in the language the story is written in. No preface, no closing remark.`;

export default {
    api: 1, id: 'lore', name: '설정집', icon: '📘', color: '#8d6e63', cost: 'tap',
    desc: '카드 · 로어북 · 대화를 통째로 읽어 설정집 한 권을 만들어요. 미트볼이 AI를 부를 때마다 이 설정집이 잘리지 않고 다 들어가요.',
    // rides on every tap call; on the reader only when switched on
    brief(env, kind) {
        const b = bookOf(env).trim();
        if (!b || building || (kind === 'read' && !env.cfg?.read)) return '';
        return `[SETTING BOOK — the story's fixed facts. Treat it as true, keep every name exactly as written here${kind === 'read' ? '; it is background only: report nothing from it, only from the new text' : ''}.]\n${b}`;
    },
    note(_S, env) {
        const H = hits(env).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0)).slice(0, SEND);
        return H.length ? { state: H.map((e) => `Lore — ${e.name}: ${clip(e.text, PER)}`) } : null;
    },
    hud: (_S, env) => { const n = hits(env).length; return n ? [`📖 ${n}`] : []; },
    widget: (_S, env) => { const H = hits(env); return H.length ? H.slice(0, 3).map((e) => `<div class="mb4-row"><span class="mb4-row-k">📖 ${esc(e.name)}</span><span class="mb4-row-v">${esc(clip(e.text, 50))}</span></div>`).join('') : ''; },
    widgetTitle: '지금 알려 주는 설정',
    render(el, api) {
        const env = api.env, st = api.store, card = env.card ?? {}, book = bookOf(env);
        const key = `${env.char ?? ''}|${Array.isArray(st.pick) ? st.pick.join(',') : ''}`;
        if (ui.key !== key) { ui.key = key; ui.list = null; }
        const src = ui.list, total = (src ?? []).reduce((n, x) => n + (x.on ? (x.items ? x.items.filter((e) => e.on).reduce((m, e) => m + e.size, 0) : x.size) : 0), 0);
        const row = (x) => (x.items
            ? `<div class="mbl-src"><label class="mbl-row"><input type="checkbox" data-src="${esc(x.id)}" ${x.on ? 'checked' : ''} ${x.n ? '' : 'disabled'}><span><b>${esc(x.label)}</b>${x.linked ? ' <em>연결됨</em>' : ''}<small>${x.n ? `항목 ${x.items.filter((e) => e.on).length} / ${x.n} · ${kChars(x.items.filter((e) => e.on).reduce((m, e) => m + e.size, 0))}` : '비어 있음'}</small></span>${x.n ? `<button class="mb4-btn ghost sm" data-act="srcopen" data-v="${esc(x.id)}">${ui.open[x.id] ? '접기' : '항목 고르기'}</button>` : ''}</label>
                ${ui.open[x.id] ? `<div class="mbl-items">${x.items.map((e) => `<label class="mbl-row sub"><input type="checkbox" data-src="${esc(e.id)}" ${e.on ? 'checked' : ''}><span><b>${esc(e.title)}</b>${e.always ? ' <em>늘 켜짐</em>' : ''}<small>${kChars(e.size)}${e.keys && e.keys !== e.title ? ` · 🔑 ${esc(e.keys)}` : ''}</small></span></label>`).join('')}</div>` : ''}</div>`
            : `<label class="mbl-row"><input type="checkbox" data-src="${esc(x.id)}" ${x.on ? 'checked' : ''} ${x.size ? '' : 'disabled'}><span><b>${esc(x.label)}</b><small>${x.size ? kChars(x.size) : '비어 있음'}</small></span></label>`);
        el.innerHTML = `<section class="mb4-card"><h5 class="mb4-card-h">📘 설정집 ${book ? `<small>${kChars(book.length)} · 미트볼 AI 호출마다 전부 들어가요</small>` : '<small>아직 없어요</small>'}</h5>
            <textarea class="mb4-input mbl-book" data-act="book" rows="${book ? 16 : 4}" placeholder="아래에서 읽을 곳을 고르고 🪄 만들기를 누르거나, 여기에 직접 적어요. 길이 제한 없이 그대로 저장돼요.">${esc(book)}</textarea>
            ${hint('여기 적힌 그대로, 잘리지 않고 쓰여요. 고치면 바로 저장돼요. 이 캐릭터의 새 채팅에도 이어져요.')}</section>
        <section class="mb4-card"><h5 class="mb4-card-h">📚 읽을 곳 ${src ? `<small>고른 것 ${kChars(total)} · 전부 읽어요</small>` : ''}</h5>
            ${src ? (src.length ? `${src.filter((x) => !x.items).map(row).join('')}${src.some((x) => x.items) ? '<p class="mbl-sec">로어북</p>' : ''}${src.filter((x) => x.items).sort((a, b) => b.linked - a.linked).map(row).join('')}` : hint('읽을 수 있는 게 없어요.')) : `<p class="mb4-hint">${api.sources ? '불러오는 중…' : '채팅을 열면 고를 수 있어요.'}</p>`}
            <textarea class="mb4-input" data-act="note" rows="3" placeholder="추가 지시 (비워도 돼요) — 설정집을 만들 때 AI가 꼭 지킬 것">${esc(st.note ?? '')}</textarea>
            <button class="mb4-btn wide" data-act="build" ${src ? '' : 'disabled'}>${st._sure ? '⚠ 지금 설정집을 덮어써요 · 한 번 더' : book ? '🪄 설정집 다시 만들기 (AI 1번)' : '🪄 설정집 만들기 (AI 1번)'}</button>
            ${hint('고른 것은 잘라 내지 않고 전부 읽어요. 로어북은 「항목 고르기」로 하나씩 뺄 수 있어요. 양이 많으면 그만큼 토큰이 들어요.')}</section>
        <label class="mb4-sw"><span><b>답을 읽을 때도 설정집 붙이기</b><small>이름 · 장소를 더 정확히 읽어요. 대신 답마다 설정집 길이만큼 토큰이 더 들어요${book ? ` (${kChars(book.length)})` : ''}. 꺼 두면 🪄 같은 단추를 누를 때만 들어가요.</small></span><input type="checkbox" data-act="read" ${api.cfg.read ? 'checked' : ''}><i></i></label>
        <details class="mb4-card" ${st._notes ? 'open' : ''} data-notes><summary>📎 낱말 쪽지 <small>그 말이 나온 답에만 본편 AI에 알려 주는 짧은 설정 · ${list(env).length}장</small></summary><div data-notes-body></div></details>`;
        el.querySelector('[data-notes]').addEventListener('toggle', (e) => { st._notes = e.currentTarget.open; });
        const setBook = (t) => { st.book = t; card.book = t; };
        const pickNow = () => { const on = [...el.querySelectorAll('[data-src]')].filter((x) => x.checked).map((x) => x.dataset.src).filter((id) => !id.startsWith('wx:')); const off = (ui.list ?? []).flatMap((x) => x.items ?? []).filter((e) => !e.on).map((e) => e.id); return [...on, ...off]; };
        el.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('change', () => {
            const id = b.dataset.src;
            for (const x of ui.list ?? []) { if (x.id === id) x.on = b.checked; for (const e of x.items ?? []) if (e.id === id) e.on = b.checked; }
            st.pick = [...(ui.list ?? []).filter((x) => x.on).map((x) => x.id), ...(ui.list ?? []).flatMap((x) => x.items ?? []).filter((e) => !e.on).map((e) => e.id)];
            ui.key = `${env.char ?? ''}|${st.pick.join(',')}`;
            api.save(); api.redraw();
        }));
        acts(el, {
            book: (_v, b) => { setBook(b.value); st._sure = false; api.save(); api.redraw(); },
            note: (_v, b) => { st.note = b.value.trim().slice(0, 4000); api.save(); },
            read: (_v, b) => { api.cfg.read = b.checked; api.save(); },
            srcopen: (v) => { ui.open[v] = !ui.open[v]; api.redraw(); },
            build: async (_v, b) => {
                if (book && !st._sure) { st._sure = true; api.redraw(); return; }
                st._sure = false; b.disabled = true; b.textContent = '📚 읽는 중…';
                const got = await api.sources.read(Array.isArray(st.pick) ? st.pick : pickNow());
                if (!got?.text) { api.toast('읽을 내용이 없어요. 위에서 읽을 곳을 골라 주세요.'); api.redraw(); return; }
                b.textContent = `🪄 만드는 중… (${kChars(got.chars)} 읽음)`;
                building = true;
                let out = '';
                try { out = await api.ask(`${BUILD}${st.note ? `\n\nTHE USER'S EXTRA INSTRUCTIONS (they win over the source where the two differ):\n${st.note}` : ''}\n\nSOURCE:\n${got.text}`, 8000); } finally { building = false; }
                if (!String(out).trim()) { api.toast('받지 못했어요. 멈춤 중이 아닌지, 연결을 보고 다시 눌러 주세요.'); api.redraw(); return; }
                setBook(String(out).trim()); api.toast(`📘 설정집을 만들었어요 (${kChars(String(out).trim().length)}).`); api.save(); api.redraw();
            },
        });
        if (!ui.list && api.sources && !ui.loading) { ui.loading = true; api.sources.list(Array.isArray(st.pick) ? st.pick : null).then((L) => { ui.list = Array.isArray(L) ? L : []; }).catch(() => { ui.list = []; }).finally(() => { ui.loading = false; api.redraw(); }); }
        renderNotes(el.querySelector('[data-notes-body]'), api);
    },
    css: `
.mbl-book { min-height: 90px; font-size: 13px !important; line-height: 1.55; white-space: pre-wrap; }
.mbl-row { position: relative; display: flex; align-items: center; gap: 9px; padding: 7px 0; cursor: pointer; }
.mbl-row + .mbl-row, .mbl-src + .mbl-src, .mbl-row + .mbl-src { border-top: 1px solid var(--line); }
.mbl-row input { flex: none; width: 18px; height: 18px; accent-color: var(--a); }
.mbl-row > span { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
.mbl-row b { font-weight: 600; font-size: 13.5px; }
.mbl-row small { color: var(--sub); font-size: 11.5px; }
.mbl-row em { font-style: normal; font-size: 10.5px; font-weight: 700; color: var(--a); }
.mbl-row.sub { padding-left: 14px; }
.mbl-items { max-height: 260px; overflow-y: auto; margin: 0 0 6px; border-radius: 10px; background: color-mix(in srgb, var(--fg) 4%, transparent); }
.mbl-sec { margin: 10px 0 2px; font-size: 12px; font-weight: 700; color: var(--sub); }
`,
};
function renderNotes(el, api) {
    {
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
    }
}
