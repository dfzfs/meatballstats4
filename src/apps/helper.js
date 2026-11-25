// 😼 Helper: the Meatball cat. Tell it in plain words what to change ("make X and me lovers, put 300 in my wallet,
// mark the 9th as market day") or ask how something works. One model call per message, never on its own.
// Changes are never made straight away: the cat lists them first, the person ticks what to keep, and each one goes
// through the owner app's own correction path (same checks; shown in 📒 기록 as «손으로 고침», and undoable there).
import { clip } from '../core/text.js';
import { BUILTIN } from './catalog.js';
import { esc, card, hint, acts } from '../ui/kit.js';

const img = (n) => new URL(`../../img/${n}.webp`, import.meta.url).href;
const FACE = { idle: 'mascot_idle', think: 'mascot_think', happy: 'mascot_happy', oops: 'mascot_surprise', sad: 'mascot_sad', hi: 'meatcon/hi', proud: 'meatcon/proud' };
// quick questions: with a real name from this story when there is one, never a made-up one
const examples = (env) => {
    const n = (env.peek?.('scene')?.with ?? []).find((x) => x && x !== env.user) ?? Object.keys(env.peek?.('people')?.list ?? {}).find((x) => x && x !== env.user) ?? '';
    return [n ? `${n} 소개 고쳐 줘` : '인물 소개 고쳐 줘', '지갑에 300 넣어 줘', '내일을 기념일로 표시해 줘', '읽는 간격이 뭐야?', '부하 줄이려면?'];
};
// What the cat knows about Meatball itself (sent only with a message, never on its own)
const ABOUT = `Meatball 4 facts (answer questions from these; never invent features):
- The phone has three shelves: 상태 (장면 · 인물 · 달력 · 지도 · 나), 지시 (도우미 · 지시 · 되풀이 막기 · 약속 · 메모 · 기록 · 선택지), 재미 (주사위 · 연락 · 점집 · 추천 음악 · 이야기 장치). Rows with several apps open as tabs.
- An app that is off sends nothing and costs nothing. Apps marked 「조금」 add a few items to the ONE reading call each reply; 「누를 때만」 call the AI only when a button is pressed; 「토큰 0」 never call it.
- ⚙️ 설정: 읽는 간격 (read every 1 / 2 / 3 replies — 2 or 3 halves or thirds the calls), the reading connection profile (pick a cheap fast model), 📏 토큰 미터 (how many characters each app adds), 🎨 꾸미기 (wallpaper, colour, night mode, font), 💾 백업, 채팅 옆에 붙이기.
- 📒 기록 shows what was read for each reply; a wrong reply can be read again there, and hand corrections can be undone there.
- 📦 이어 가기 on the home screen carries over records from Meatball generations 1-3; 📖 한 번에 읽기 reads a long chat from the start, three replies per call.
- Every app screen has its own ✏️ 직접 고치기 for hand edits.`;

function parse(raw) {
    const s = String(raw ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
    const say = (s.match(/<say>([\s\S]*?)<\/say>/i)?.[1] ?? s.replace(/<edits>[\s\S]*?(<\/edits>|$)/i, '')).trim();
    const block = s.match(/<edits>([\s\S]*?)(?:<\/edits>|$)/i)?.[1] ?? '';
    const edits = block.split(/\r?\n/).map((l) => l.trim().replace(/^[-*]\s*/, '')).filter(Boolean).map((l) => {
        const m = l.match(/^(@?[a-z]{2,16})\s*:\s*(.+)$/i);
        return m ? { k: m[1].toLowerCase(), v: m[2].trim(), on: true } : null;
    }).filter(Boolean).slice(0, 20);
    return { say: clip(say, 800), edits };
}
const STORE_ACTS = {
    '@memo': { need: 'memo', ko: '📝 메모 더하기', line: '@memo: the note text (adds a memo the AI keeps seeing)' },
    '@mark': { need: 'calendar', ko: '📅 달력에 표시', line: '@mark: YYYY-MM-DD | label (marks a calendar day)' },
    '@lore': { need: 'lore', ko: '📖 설정집에 더하기', line: '@lore: name | trigger words, comma separated | what it is' },
};

export default {
    api: 1, id: 'helper', name: '도우미', icon: '😼', color: '#f2a65a', cost: 'tap',
    desc: '미트볼 고양이에게 말로 시켜요. 「돈 300 넣어 줘」처럼 고칠 걸 말하면 먼저 보여 주고, 확인하면 고쳐요. 기능 질문에도 답해요.',
    widget: (_s, env) => { const m = (env.store.log ?? []).filter((x) => !x.me).at(-1); return `<div class="mbx-hw"><img src="${img(FACE[m?.face] ?? FACE.hi)}" alt=""><span>${esc(clip(m?.say ?? '뭐든 시켜 줘. 고칠 거 있으면 말로 해.', 70))}</span></div>`; },
    widgetTitle: '😼 도우미',
    render(el, api) {
        const st = api.store, H = api.helper;
        st.log = Array.isArray(st.log) ? st.log : [];
        const last = st.log.at(-1), face = FACE[st.busy ? 'think' : last && !last.me ? last.face : 'idle'] ?? FACE.idle;
        const label = (e) => {
            if (STORE_ACTS[e.k]) return `${STORE_ACTS[e.k].ko}: ${esc(e.v)}`;
            const c = H?.chip(e.k, e.v);
            return `${c ? esc(c) : `<b>${esc(e.k)}</b>`} <small class="mb4-dim">${esc(clip(e.v, 60))}</small>`;
        };
        const msg = (m, n) => (m.me ? `<div class="mbx-hm me">${esc(m.text)}</div>`
            : `<div class="mbx-hm"><img src="${img(FACE[m.face] ?? FACE.idle)}" alt=""><div><p>${esc(m.say)}</p>${m.edits?.length ? `<div class="mbx-edits">${m.edits.map((e, j) => `<label class="mbx-ed${e.done ? ` ${e.done}` : ''}"><input type="checkbox" data-act="tick" data-v="${n}|${j}" ${e.on ? 'checked' : ''} ${e.done ? 'disabled' : ''}><span>${label(e)}${e.done === 'ok' ? ' ✅' : e.done === 'no' ? ' ⚠ 못 고침' : ''}</span></label>`).join('')}
                ${m.edits.some((e) => !e.done) ? `<div class="mb4-btnrow"><button class="mb4-btn sm" data-act="apply" data-v="${n}">✔ 고르기한 것 고치기</button><button class="mb4-btn ghost sm" data-act="skip" data-v="${n}">안 고칠래</button></div>` : ''}</div>` : ''}</div></div>`);
        el.innerHTML = `<div class="mbx-hhead"><img src="${img(face)}" alt="미트볼 고양이"><div><b>미트볼 도우미</b><small>말로 시키기 · 1번에 AI 1회 · 고치기 전에 꼭 물어봐요</small></div></div>
        <div class="mbx-hlog">${st.log.length ? '' : `<div class="mbx-hm"><img src="${img(FACE.hi)}" alt=""><div><p>안녕! 고칠 거나 궁금한 거 말해 줘. 아래 질문을 눌러도 돼 🐾</p></div></div>`}${st.log.slice(-16).map((m, i, arr) => msg(m, st.log.length - arr.length + i)).join('')}${st.busy ? `<div class="mbx-hm wait"><img src="${img(FACE.think)}" alt=""><div><p>생각하는 중…</p></div></div>` : ''}</div>
        <div class="mbx-hq">${examples(api.env).map((x) => `<button class="mbx-qchip" data-act="ex" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <div class="mbx-hin"><textarea class="mb4-input" rows="2" data-f="ask" maxlength="400" placeholder="예: 지금 같이 있는 사람이랑 연인으로 바꿔 줘"></textarea><button class="mb4-btn" data-act="send" ${st.busy ? 'disabled' : ''} aria-label="보내기">➤</button></div>
        <p class="mb4-hint">고칠 건 목록으로 먼저 보여 줘요. 체크한 것만 「고치기」를 눌러야 바뀌고, 📒 기록에서 되돌릴 수 있어요.${st.log.length ? ' <button class="mb4-link mbx-clear" data-act="clear">대화 지우기</button>' : ''}</p>`;
        const box = el.querySelector('.mbx-hlog'); if (box) box.scrollTop = box.scrollHeight;
        acts(el, {
            ex: (v) => { const t = el.querySelector('[data-f="ask"]'); t.value = v; t.focus(); },
            clear: () => { st.log = []; api.save(); api.redraw(); },
            tick: (v, b) => { const [n, j] = v.split('|').map(Number); const e = st.log[n]?.edits?.[j]; if (e) { e.on = b.checked; api.save(); } },
            skip: (n) => { for (const e of st.log[+n]?.edits ?? []) if (!e.done) e.done = 'skip'; api.save(); api.redraw(); },
            apply: (n) => {
                const m = st.log[+n]; if (!m) return;
                let ok = 0, bad = 0;
                for (const e of m.edits) {
                    if (e.done || !e.on) { if (!e.done) e.done = 'skip'; continue; }
                    let done = false;
                    try {
                        if (e.k === '@memo') { const s = H.storeOf('memo'); if (s) { s.items = Array.isArray(s.items) ? s.items : []; if (!s.items.some((x) => x.t === clip(e.v, 400))) s.items.push({ t: clip(e.v, 400), on: true, pin: false }); done = true; } }
                        else if (e.k === '@mark') { const [date, label2] = e.v.split('|').map((x) => x.trim()); const s = H.storeOf('calendar'); if (s && /^\d{4}-\d{2}-\d{2}$/.test(date) && label2) { s.marks = Array.isArray(s.marks) ? s.marks : []; if (!s.marks.some((x) => x.date === date && x.label === clip(label2, 40))) s.marks.push({ date, label: clip(label2, 40) }); done = true; } }
                        else if (e.k === '@lore') { const [name, keys, ...rest] = e.v.split('|').map((x) => x.trim()); const c = H.cardOf('lore'); if (c && name && rest.length) { c.list = Array.isArray(c.list) ? c.list : []; c.list.push({ name: clip(name, 40), keys: clip(keys, 120), text: clip(rest.join(' | '), 500), on: true, pin: false }); done = true; } }
                        else done = !!H.fix(e.k, e.v);
                    } catch (x) { done = false; }
                    e.done = done ? 'ok' : 'no'; done ? ok++ : bad++;
                }
                st.log.push({ me: false, face: bad && !ok ? 'oops' : 'proud', say: ok ? `${ok}개 고쳤어.${bad ? ` ${bad}개는 형식이 안 맞아서 못 고쳤어. 그 앱에서 직접 고쳐 줘.` : ''}` : '하나도 못 고쳤어. 앱이 꺼져 있거나 형식이 안 맞았어.' });
                api.save(); api.redraw();
            },
            send: async () => {
                const t = String(el.querySelector('[data-f="ask"]')?.value ?? '').trim(); if (!t) return;
                st.log.push({ me: true, text: clip(t, 400) }); st.busy = true; api.save(); api.redraw();
                const on = H.appsOn(), keys = H.keys(), acts2 = Object.entries(STORE_ACTS).filter(([, a]) => on.some((x) => x.id === a.need));
                const prompt = `[ROLE] You are 미트볼 도우미, the cat mascot of a roleplay helper phone. Reply in short, friendly, plain Korean (casual speech, at most a light cat touch — no 냥 spam). You can also change what the phone has recorded, but ONLY what the user clearly asks for.

[APPS THAT ARE ON]
${on.map((a) => `${a.icon} ${a.name} (${a.id}) — ${a.desc}`).join('\n') || '(none)'}

[WHAT IS RECORDED NOW]
${api.facts() || '(nothing recorded yet)'}

[CHANGE LINES YOU MAY WRITE] one per line, exactly "key: value"
${[...keys.map((k) => k.line), ...acts2.map(([, a]) => a.line)].join('\n') || '(no app that can be changed is on)'}

[RULES]
1. Only changes the user asked for. Never invent story facts. Use names exactly as recorded.
2. If what they ask needs an app that is off, say which app to switch on instead of writing a line.
3. Questions about Meatball: answer from the facts below. Keep answers under 4 sentences.
4. For dates the user names relative to the story ("tomorrow"), use [WHAT IS RECORDED NOW]; if unknown, ask instead.

${ABOUT}

[CONVERSATION SO FAR]
${st.log.slice(-7, -1).map((m) => (m.me ? `user: ${m.text}` : `you: ${m.say}`)).join('\n') || '(new)'}

[USER]
${t}

[OUTPUT]
<say>your reply in Korean</say>
<edits>
key: value
</edits>
(Leave out <edits> when nothing should change.)`;
                const raw = await api.ask(prompt, 600);
                st.busy = false;
                if (!raw) st.log.push({ me: false, face: 'sad', say: '연결이 안 됐어. 잠깐 뒤에 다시 말해 줘.' });
                else { const r = parse(raw), known = new Set([...keys.map((k) => k.id), ...acts2.map(([k]) => k)]); r.edits = r.edits.filter((e) => known.has(e.k)); st.log.push({ me: false, face: r.edits.length ? 'think' : 'happy', say: r.say || (r.edits.length ? '이렇게 고칠까?' : '음… 잘 모르겠어.'), edits: r.edits }); }
                if (st.log.length > 60) st.log.splice(0, st.log.length - 60);
                api.save(); api.redraw();
            },
        });
    },
    css: `.mbx-hhead{display:flex;align-items:center;gap:12px;margin:0 0 12px}.mbx-hhead img{width:72px;height:72px;object-fit:contain;flex:none}.mbx-hhead>div{display:flex;flex-direction:column;min-width:0}.mbx-hhead b{font-size:17px;font-weight:780}.mbx-hhead small{color:var(--sub)}
.mbx-hlog{display:flex;flex-direction:column;gap:10px;min-height:180px;max-height:46vh;overflow-y:auto;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;margin:0 0 10px}
.mbx-hm{display:flex;gap:8px;align-items:flex-end;max-width:92%}.mbx-hm img{width:34px;height:34px;object-fit:contain;flex:none}
.mbx-hm>div{padding:9px 12px;border-radius:14px 14px 14px 4px;line-height:1.55;font-size:13.5px;background:var(--bg1);border:1px solid var(--line)}.mbx-hm p{margin:0}
.mbx-hm.wait>div{color:var(--sub);font-style:italic}
.mbx-hm.me{align-self:flex-end;max-width:85%;padding:9px 12px;border-radius:14px 14px 4px 14px;background:var(--a);color:#fff;font-size:13.5px;line-height:1.55}
.mbx-hq{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.mbx-qchip{padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:12.5px!important;cursor:pointer}
.mbx-hin{display:flex;gap:8px;align-items:stretch}.mbx-hin textarea{flex:1;min-width:0;margin:0;resize:vertical}.mbx-hin .mb4-btn{flex:none;padding:0 16px;font-size:16px}
.mbx-clear{display:inline;flex:none;font-size:12px!important;text-decoration:underline}
.mbx-edits{margin-top:6px;display:flex;flex-direction:column;gap:4px}.mbx-ed{display:flex;gap:6px;align-items:flex-start;font-size:13px}.mbx-ed.ok{opacity:.7}.mbx-ed.no{color:var(--bad)}.mbx-ed.skip{opacity:.45;text-decoration:line-through}
.mbx-hw{display:flex;align-items:center;gap:8px}.mbx-hw img{width:40px;height:40px;object-fit:contain}`,
};
