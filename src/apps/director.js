// 🎬 Director: instructions that never appear in the chat. Ported from the director window (지시창): an order for the
// next reply (📌 pin it for the scene or for good), saved orders, scene mode (how to get there · how to open · one
// reply or several), style picks for every reply (quick sets, boosters, length, point of view, how far), a reroll with
// a reason, directions (where the story should end up, with pacing), and rules about the AI's habits that are watched
// (by code, or by the reader for the person's own rules) and sent only right after they slipped.
import { clip } from '../core/text.js';
import { esc, card, hint, acts, val, pill } from '../ui/kit.js';

// ── scene mode: the first reply of a pinned scene gets "start", the ones after get "going" ──────────────────
const GOING = 'This scene is already under way: pick up exactly where the last reply stopped and carry it forward. Do not set it up again, re-describe the place or the mood, or wrap it up. Take the next part only; keep the rest for later replies';
export const OPT = {
    enter: [['skip', '⏩ 타임스킵', 'Time skip to the scene: if the user\'s message says how much time passes, use that; otherwise pick a fitting amount. One line for the passing time, then the scene'],
        ['fill', '➡ 이어서', 'Go on naturally from where the last reply stopped, filling in what happens on the way, then start the scene']],
    intro: [['no', '바로 본론', 'No opening description: start straight with what happens'], ['yes', '채우기', 'Open the scene with a short setting of the place and the mood']],
    len: [['multi', '여러 답으로', 'Pace it over several replies: do not use up everything asked for in this one reply; take the first part and leave the rest for the next replies'],
        ['one', '한 답에 기승전결', 'Tell the whole scene in this reply, beginning to end: setup, development, turn and close']],
    pov: [['auto', '알아서', ''], ['first', '1인칭', 'Write in first person, from the point of view of the main other character in the scene'], ['third', '3인칭 한 명씩', 'Write in close third person, staying with one character at a time'], ['omni', '전지적', 'Write in third person that can move between characters and show what each one thinks']],
    reach: [['auto', '알아서', ''], ['upto', '인풋까지만', 'Write only as far as the user\'s message goes, then stop. Do not go past it or decide what the user\'s character does next'], ['beyond', '인풋 다음도', 'After what the user\'s message covers, carry the story on a little further on your own']],
    size: [['auto', '알아서', ''], ['short', '짧게', 'Reply length: short, one or two paragraphs'], ['mid', '보통', 'Reply length: medium, three to five paragraphs'], ['long', '길게', 'Reply length: long, six paragraphs or more; take the room the scene needs']],
};
export const BOOST = [
    ['talk', '💬 대사 많이', 'More dialogue and back-and-forth: characters react to each other in what they say, not only in narration'],
    ['logic', '🧩 개연성', 'Strong plausibility and structure: events follow from causes, motives make sense, a clear build, turn and payoff, no convenient coincidences'],
    ['npc', '👥 조연 활약', 'Use the side characters actively: they have aims of their own, speak up and act, not just background'],
    ['world', '🌍 세계가 반응', 'The world reacts: places, crowds, rumours and consequences respond to what happened'],
    ['voice', '🗣 말투 살리기', 'Every character sounds like themselves: word choice, rhythm and habits of speech stay distinct'],
    ['subtext', '🎭 속마음은 행동으로', 'Feelings shown through small physical details and subtext rather than stated outright'],
    ['sense', '🌿 감각 묘사', 'Rich sensory detail: sound, smell, touch, temperature, light'],
    ['twist', '🔀 반전', 'Bring in an unexpected but fitting turn or complication when the scene allows'],
    ['pace', '⏱ 빠른 전개', 'Keep the pace brisk: less description, more happening'],
    ['humor', '😄 유머', 'Light humour that fits the characters is welcome'],
    ['spark', '💞 설렘 유지', 'Keep the romantic tension alive: glances, closeness, what is almost said'],
    ['conflict', '🔥 갈등 키우기', 'Sharpen the conflict: people want different things and push for them'],
    ['breath', '🕊 쉬어 가는 순간', 'Leave room for quiet, everyday moments between the big ones'],
    ['foreshadow', '📜 복선', 'Plant small hints that can pay off later'],
    ['hook', '🎣 다음이 궁금하게', 'End the reply on a hook that makes the next one wanted'],
    ['memory', '🧠 지난 일 기억', 'Characters remember and bring up what happened before'],
    ['table', '📊 표 · 그래프', 'Where it fits the story, show things as a small table or chart (a list, a schedule, a status board)'],
    ['html', '🎨 HTML 카드', 'Where it fits the story, show things visually with self-contained inline HTML and CSS (a letter, a phone screen, a sign); no scripts'],
];
export const SETS = [['plain', '기본', {}], ['talk', '대화극', { reach: 'upto', boost: ['talk', 'voice', 'memory'] }], ['movie', '영화처럼', { boost: ['pace', 'sense', 'hook', 'twist'] }],
    ['novel', '소설처럼', { size: 'long', boost: ['subtext', 'sense', 'breath', 'foreshadow'] }], ['drama', '드라마', { boost: ['conflict', 'spark', 'hook', 'npc'] }], ['quick', '짧고 빠르게', { size: 'short', boost: ['pace', 'humor'] }]];
// ── rules about the AI's habits. auto = sent only for the reply right after one slipped · always · off ─────────
export const RULES = [
    { id: 'kiddo', name: '유아화 금지', en: 'No dumbing down', text: 'Do not make the user\'s character dim, ditzy or helpless: no cluelessness, no wide-eyed confusion, no needing simple things explained, no clumsy cuteness the user did not write.', re: /어리둥절|고개를 갸웃|눈을 (동그랗게|깜빡)|멍하니|헤헤|무슨 말인지 (몰라|모르)|천천히 (다시 )?설명|bewildered|tilt(ed|s) (her|his|their) head|blinked (owlishly|in confusion)|clueless/i },
    { id: 'belittle', name: '무시 · 깔보기 금지', en: 'No belittling', text: 'Do not belittle or dismiss the user\'s character as less capable. No talking down.', re: /여자(가|는|들은|들이)\s?(뭘|무슨|감히)|계집|여자답게|얌전히 있어|silly girl|little woman|know your place/i },
    { id: 'mine', name: '소유 선언 금지', en: 'No "you\'re mine"', text: 'No possessive declarations such as "you\'re mine".', re: /넌 내 (거|것)|내 여자|내 남자|you'?re mine|my woman/i },
    { id: 'instead', name: '「A 대신 B」 말투', en: '"Instead of A, B"', text: 'Do not frame what a character does or says against what they did not do ("instead of saying hello, he asked…"). Just write what they do or say.', re: /대신(에)?[,\s]|instead of|rather than/i },
    { id: 'ifthen', name: '「만약 ~면 ~한 거다」', en: '"If you…, then you…"', text: 'No conditional verdicts like "If you do X, you are Y". Say it plainly or show it.', re: /(만약|만일)[^.\n]{0,40}(면|다면)[^.\n]{0,40}(거다|거야|것이다|셈이다)|\bif you\b[^.\n]{0,60}\b(you're|you are|then|i'll|means)\b/i },
    { id: 'notbut', name: '「X가 아니었다. Y였다」', en: '"It wasn\'t X. It was Y."', text: 'Avoid the "It wasn\'t X. It was Y." reveal pattern. State the thing itself.', re: /아니었다[.\s]+[^.\n]{0,40}(였다|이었다)|\bit wasn'?t\b[^.\n]{0,40}\.\s*it was\b/i },
    { id: 'breath', name: '숨 참기 클리셰', en: 'Breath clichés', text: 'No breath clichés (holding a breath one did not know one was holding, letting out a breath).', re: /참았던 숨|숨을 (참|들이켜|내쉬|멈추)|breath (she|he|they|i) didn'?t know|let out a breath|released a breath/i },
    { id: 'dots', name: '말줄임표 남발', en: 'Too many ellipses', text: 'Use ellipses sparingly: two at most in a reply.', test: (t) => (t.match(/…|\.\.\./g) ?? []).length >= 6 },
];
const modeOf = (cfg, r) => cfg.modes?.[r.id] ?? r.mode ?? 'auto';
export function allRules(cfg) {
    return [...RULES.map((r) => ({ ...r, mode: modeOf(cfg, r) })), ...(Array.isArray(cfg.rules) ? cfg.rules : []).filter((r) => r?.id && r.text).map((r) => ({ ...r, name: clip(r.text, 24), en: clip(r.text, 40), mode: r.mode ?? 'auto', own: true }))];
}
const pickOf = (cfg, k) => OPT[k].find(([id]) => id === cfg.pick?.[k]) ?? OPT[k][0];
// Lines that go with every story reply: boosters, length, point of view, how far.
export function styleLines(cfg) {
    return [pickOf(cfg, 'size')[2], pickOf(cfg, 'pov')[2], pickOf(cfg, 'reach')[2], ...BOOST.filter(([id]) => cfg.boost?.[id]).map(([, , t]) => t)].filter(Boolean);
}
// Rules that slipped in the last reply: by code (a pattern or a count), or by the reader (the person's own rules).
export function slipped(cfg, lastText, broke = []) {
    const out = new Set();
    for (const r of allRules(cfg)) {
        if (r.mode !== 'auto') continue;
        if (r.test ? r.test(lastText) : r.re ? r.re.test(lastText) : broke.includes(r.id)) out.add(r.id);
    }
    return out;
}
// Directions: has it moved (its words showed in the recent replies)?
const shows = (g, texts) => (g.signs ?? []).some((w) => w.length >= 2 && texts.some((t) => t.toLowerCase().includes(w.toLowerCase())));
const ownWords = (t) => String(t ?? '').split(/[,，、\n]/).map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 10);

export default {
    api: 1,
    id: 'director',
    name: '지시',
    icon: '🎬',
    color: '#264653',
    cost: 'low',
    desc: '채팅에 남지 않는 지시를 적어요. 다음 답 한 번 · 이 장면 동안 · 계속 중에서 골라요.',
    // the person's own rules are judged by the reader in the same call (no extra call); the built-in ones by code
    keys: [{ id: 'broke', line: 'broke: rule-id  (a Watched rule in [CURRENT STATE] that the NEW reply breaks; judge the meaning, not the words)', quote: true, when: (_S, env) => allRules(env?.cfg ?? {}).some((r) => r.own && r.mode === 'auto') }],
    rules: (env) => (allRules(env?.cfg ?? {}).some((r) => r.own && r.mode === 'auto') ? ['"broke" only for the Watched rules listed in [CURRENT STATE], by their id, and only for the reply itself (never <user>).'] : ['No Watched rules: never write "broke".']),
    start: () => ({ broke: [] }),
    check: ({ v }, env) => allRules(env.cfg ?? {}).some((r) => r.own && r.id === String(v).trim().split(/\s/)[0]),
    reduce(S, { v, i }) { S.broke.push({ id: String(v).trim().split(/\s/)[0], i }); if (S.broke.length > 30) S.broke.shift(); },
    stateLines: (_S, env) => allRules(env.cfg ?? {}).filter((r) => r.own && r.mode === 'auto').map((r) => `Watched rule ${r.id}: ${clip(r.text, 160)}`),
    note(S, env) {
        const st = env.store, cfg = env.cfg, state = [], now = [], last = env.last ?? -1, reroll = env.gen === 'swipe' || env.gen === 'regenerate';
        if (st.ooc) return { now: ['This reply is out of character: answer the user\'s message as the writer, plainly, outside the story. Ignore story format, trackers and length instructions above; do not continue the scene.'] };
        if (st.always) state.push(`Standing condition (background, not an event for this reply): ${clip(st.always, 600)}`);
        now.push(...styleLines(cfg));
        if (st.scene) {
            const first = st.sceneAt == null || (reroll && st.sceneAt >= last);
            const words = first ? [pickOf(cfg, 'enter')[2], pickOf(cfg, 'intro')[2], pickOf(cfg, 'len')[2]].join('. ') : pickOf(cfg, 'len')[0] === 'one' ? '' : GOING;
            now.push(`For the current scene: ${clip(st.scene, 600)}${words ? `. ${words}` : ''}`);
        }
        // directions: silent (never sent) · hint (it moves slowly) · push (one small step every few replies, never the arrival)
        const recent = env.recent?.(6) ?? [], beat = Math.floor(Math.max(0, last) / 2);
        for (const g of Array.isArray(st.goals) ? st.goals : []) {
            if (!g?.v || g.done) continue;
            if (g.mode === 'hint') state.push('Where this story is going is moving slowly; nothing is settled yet.');
            if (g.mode === 'push' && beat % Math.max(2, g.every ?? 4) === 0 && !shows(g, recent)) now.push(`Direction: ${clip(g.v, 200)} — the user's long-term direction. Do not arrive there. If it fits this scene, take one small step toward it (a look, a choice, a small turn); otherwise ignore it.`);
        }
        // habits: "always" every reply; "auto" only for the reply right after one slipped (or every reroll of it)
        const lastText = (env.recent?.(1) ?? [])[0] ?? '', again = !!st.redo && reroll;
        const hit = slipped(cfg, again ? (st.redo.text0 ?? lastText) : lastText, (S?.broke ?? []).filter((b) => b.i === last).map((b) => b.id));
        for (const r of allRules(cfg)) {
            if (r.mode === 'always') now.push(r.text);
            else if (hit.has(r.id)) now.push(again ? `The version being rewritten slipped into this (${r.en}) and was thrown away for it. This version must not: ${r.text}` : `The previous reply slipped into this (${r.en}). Watch it in this reply: ${r.text}`);
        }
        const once = st.once || (reroll ? st.onceLast : '');   // a reroll of the reply it was written for gets it again
        if (once) now.push(`Direction for this reply (follow it; do not mention that it was given): ${clip(once, 1200)}`);
        // a reroll with a reason: the strongest, last line, for every reroll of that reply
        if (again && st.redo.text) now.push(`The previous version of this reply was thrown away because: ${clip(st.redo.text, 400)}. This version must not repeat that.`);
        return state.length || now.length ? { state, now: [...new Set(now)] } : null;
    },
    // The one-time direction is spent by the reply it was written for; a scene's first reply moves it to "going".
    onReply(env) {
        const st = env.store, last = env.last ?? 0, reroll = env.gen === 'swipe' || env.gen === 'regenerate';
        let ch = false;
        if (st.once) { st.onceLast = st.once; st.once = ''; ch = true; } else if (!reroll && st.onceLast) { delete st.onceLast; ch = true; }
        if (st.scene && st.sceneAt == null) { st.sceneAt = last; ch = true; }
        if (st.redo && !reroll) { delete st.redo; ch = true; }
        if (st.ooc === 'once') { st.ooc = false; ch = true; }
        return ch;
    },
    hud(_S, env) {
        const st = env.store, out = [];
        if (st.ooc) out.push('💬 OOC');
        else if (st.once) out.push('🎬 지시 대기'); else if (st.scene) out.push('🎬 장면 지시');
        const rushed = (st.goals ?? []).filter((g) => g?.v && !g.done && g.mode !== 'push' && shows(g, env.recent?.(1) ?? []));
        if (rushed.length) out.push('⚠ 방향 빨라짐');
        return out;
    },
    widget: (_S, env) => [['once', '🎯'], ['scene', '📌'], ['always', '🪨']].filter(([k]) => env.store[k]).map(([k, i]) => `<div class="mb4-row"><span class="mb4-row-k">${i}</span><span class="mb4-row-v">${esc(clip(env.store[k], 60))}</span></div>`).join('')
        + (env.store.goals ?? []).filter((g) => g?.v && !g.done).slice(0, 2).map((g) => `<div class="mb4-row"><span class="mb4-row-k">🧭</span><span class="mb4-row-v">${esc(clip(g.v, 50))}</span></div>`).join(''),
    widgetTitle: '걸어 둔 지시',
    css: `
.mb4-dir-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
.mb4-dir-tabs button { flex: 1; }
.mb4-dir-seg { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 8px; }
.mb4-dir-seg button.on { background: var(--a); color: #fff; }
.mb4-dir-lab { font-size: 12px; color: var(--sub); margin-top: 6px; }
`,
    render(el, api) {
        const st = api.store, cfg = api.cfg, env = api.env, S = api.state() ?? { broke: [] };
        cfg.saved = (Array.isArray(cfg.saved) ? cfg.saved : []).map((x) => (typeof x === 'string' ? { title: clip(x, 20), text: x } : x)).filter((x) => x?.text);
        cfg.pick = cfg.pick && typeof cfg.pick === 'object' ? cfg.pick : {};
        cfg.boost = cfg.boost && typeof cfg.boost === 'object' ? cfg.boost : {};
        cfg.modes = cfg.modes && typeof cfg.modes === 'object' ? cfg.modes : {};
        cfg.rules = Array.isArray(cfg.rules) ? cfg.rules : [];
        st.goals = Array.isArray(st.goals) ? st.goals : [];
        const tab = api.store._tab ?? 'order';
        const seg = (k) => `<div class="mb4-dir-seg">${OPT[k].map(([id, n]) => `<button class="mb4-btn ghost sm${pickOf(cfg, k)[0] === id ? ' on' : ''}" data-act="pick" data-v="${k}|${id}">${esc(n)}</button>`).join('')}</div>`;
        const tabs = `<div class="mb4-dir-tabs">${[['order', '✍ 지시'], ['style', '🎨 문체'], ['goal', '🧭 방향'], ['rule', '📏 규칙']].map(([id, n]) => `<button class="mb4-btn ${tab === id ? '' : 'ghost '}sm" data-act="tab" data-v="${id}">${n}</button>`).join('')}</div>`;
        const last = env.last ?? -1, hit = slipped(cfg, (env.recent?.(1) ?? [])[0] ?? '', (S.broke ?? []).filter((b) => b.i === last).map((b) => b.id));
        const secretsClose = (env.peek?.('secrets')?.ev ?? []).some((x) => x.kind === 'revealed' && x.i === last);
        let body = '';
        if (tab === 'order') {
            const reasons = [...allRules(cfg).filter((r) => hit.has(r.id)).map((r) => r.name), ...(secretsClose ? ['비밀을 먼저 말해 버림'] : [])];
            body = `${card(`🎯 다음 답 한 번${st.once ? ` ${pill('켜짐', 'good')}` : ''}`, `<textarea class="mb4-input" data-act="edit" data-k="once" rows="3" placeholder="이번 답에서 일어났으면 하는 일">${esc(st.once ?? '')}</textarea>
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="pin" data-v="scene">📌 이 장면 동안으로</button><button class="mb4-btn ghost sm" data-act="pin" data-v="always">🪨 계속으로</button><button class="mb4-btn ghost sm" data-act="keep">☆ 저장</button></div>
                ${cfg.saved.length ? `<div class="mb4-chips" style="margin-top:8px">${cfg.saved.map((s, n) => `<span class="mb4-chip"><button class="mb4-link" data-act="use" data-v="${n}">${esc(s.title)}</button> <button class="mb4-x" data-act="forget" data-v="${n}" aria-label="지우기">✕</button></span>`).join('')}</div>` : ''}`)}
            ${card(`📌 이 장면 동안${st.scene ? ` ${pill(st.sceneAt == null || st.sceneAt >= last ? '첫 답' : '이어 가는 중', 'good')}` : ''}`, `<textarea class="mb4-input" data-act="edit" data-k="scene" rows="2" placeholder="장면이 끝날 때까지 지킬 것">${esc(st.scene ?? '')}</textarea>
                <div class="mb4-dir-lab">어떻게 넘어갈까</div>${seg('enter')}<div class="mb4-dir-lab">시작</div>${seg('intro')}<div class="mb4-dir-lab">분량</div>${seg('len')}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="clear">장면 끝 · 비우기</button></div>`)}
            ${card(`🪨 계속${st.always ? ` ${pill('켜짐', 'good')}` : ''}`, `<textarea class="mb4-input" data-act="edit" data-k="always" rows="2" placeholder="늘 깔려 있는 조건">${esc(st.always ?? '')}</textarea>`)}
            ${last >= 0 ? card('↻ 이유를 붙여 다시 뽑기', `${reasons.length ? `<div class="mb4-chips">${reasons.map((r) => `<button class="mb4-btn ghost sm" data-act="reason" data-v="${esc(r)}">+ ${esc(r)}</button>`).join('')}</div>` : ''}
                <textarea class="mb4-input" data-act="redotext" rows="2" placeholder="지난 답에서 뭐가 별로였나요?">${esc(st.redo?.idx === last ? st.redo.text : '')}</textarea>
                <div class="mb4-btnrow"><button class="mb4-btn sm" data-act="redo">↻ 이 이유로 다시 뽑기</button>${st.redo?.idx === last ? pill('다시 뽑을 때마다 붙어요', 'good') : ''}</div>`) : ''}
            ${card('💬 OOC', `<div class="mb4-btnrow"><button class="mb4-btn ${st.ooc ? '' : 'ghost '}sm" data-act="ooc">${st.ooc ? '✓ 다음 답은 OOC로 (누르면 취소)' : '다음 답은 OOC로 물어보기'}</button></div>`)}`;
        } else if (tab === 'style') {
            const cur = JSON.stringify({ size: pickOf(cfg, 'size')[0], reach: pickOf(cfg, 'reach')[0], boost: Object.keys(cfg.boost).filter((k) => cfg.boost[k]).sort() });
            const setOn = (x) => JSON.stringify({ size: x.size ?? 'auto', reach: x.reach ?? 'auto', boost: [...(x.boost ?? [])].sort() }) === cur;
            body = `${card('묶음', `<div class="mb4-dir-seg">${SETS.map(([id, n, x]) => `<button class="mb4-btn ghost sm${setOn(x) ? ' on' : ''}" data-act="set" data-v="${id}">${esc(n)}</button>`).join('')}</div>`)}
            ${card('분량 · 시점 · 어디까지', `<div class="mb4-dir-lab">분량</div>${seg('size')}<div class="mb4-dir-lab">시점</div>${seg('pov')}<div class="mb4-dir-lab">어디까지</div>${seg('reach')}`)}
            ${card('✨ 더하기 (답마다 1줄씩)', `<div class="mb4-dir-seg">${BOOST.map(([id, n]) => `<button class="mb4-btn ghost sm${cfg.boost[id] ? ' on' : ''}" data-act="boost" data-v="${id}">${esc(n)}</button>`).join('')}</div>`)}
            ${hint('문체는 모든 채팅에 같이 써요. 고른 만큼 답마다 한 줄씩 붙어요.')}`;
        } else if (tab === 'goal') {
            body = `${st.goals.map((g, n) => card(`🧭 방향 ${n + 1}${g.done ? ` ${pill('도착', 'good')}` : shows(g, env.recent?.(1) ?? []) && g.mode !== 'push' ? ` ${pill('⚠ 빨라짐', 'bad')}` : ''}`, `
                <textarea class="mb4-input" rows="2" data-act="goal" data-n="${n}" data-k="v" placeholder="이야기가 결국 갔으면 하는 곳">${esc(g.v ?? '')}</textarea>
                <input class="mb4-input" data-act="goal" data-n="${n}" data-k="signs" placeholder="도착했다는 낱말 (쉼표로) — 너무 빨리 나오면 ⚠" value="${esc((g.signs ?? []).join(', '))}">
                <div class="mb4-dir-seg">${[['silent', '안 알림'], ['hint', '살짝 알리기'], ['push', '천천히 밀어주기']].map(([m, w]) => `<button class="mb4-btn ghost sm${(g.mode ?? 'silent') === m ? ' on' : ''}" data-act="gmode" data-v="${n}|${m}">${w}</button>`).join('')}</div>
                ${g.mode === 'push' ? `<label class="mb4-label">몇 답에 한 번<input class="mb4-input mb4-short" type="number" min="2" max="20" data-act="goal" data-n="${n}" data-k="every" value="${g.every ?? 4}"></label>` : ''}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="arrive" data-v="${n}">${g.done ? '다시 켜기' : '✓ 도착했어요'}</button><button class="mb4-btn ghost sm" data-act="gdel" data-v="${n}">지우기</button></div>`)).join('')}
            <div class="mb4-btnrow"><button class="mb4-btn wide" data-act="gadd">＋ 방향 추가</button></div>
            ${hint('안 알림: AI는 몰라요(⚠ 감시만). 살짝 알리기: 「천천히 가는 중」만 가서 서두르지 않아요. 천천히 밀어주기: 몇 답에 한 번 방향을 알려 주고 작은 한 걸음만 허락해요(도착은 막음).')}`;
        } else {
            body = `${card('📏 AI 버릇 규칙', allRules(cfg).map((r) => `<div class="mb4-row"><span class="mb4-row-k">${hit.has(r.id) ? '⚠ ' : ''}${esc(r.name)}</span><span class="mb4-row-v"><select class="mb4-input" style="width:112px" data-act="rmode" data-v="${esc(r.id)}">${[['auto', '보일 때만'], ['always', '늘'], ['off', '끔']].map(([m, w]) => `<option value="${m}" ${r.mode === m ? 'selected' : ''}>${w}</option>`).join('')}</select>${r.own ? `<button class="mb4-x" data-act="rdel" data-v="${esc(r.id)}" aria-label="지우기">✕</button>` : ''}</span></div>`).join(''))}
            ${card('＋ 내 규칙', `<div class="mb4-btnrow"><input class="mb4-input" data-f="rule" placeholder="지킬 것 한 줄 (영어면 더 잘 들어요)"><button class="mb4-btn" data-act="radd">추가</button></div>`)}
            ${hint('「보일 때만」: 지난 답에서 그 버릇이 보였을 때 다음 답에만 한 줄을 붙여요. 기본 규칙은 코드가 낱말로 보고, 내 규칙은 답을 읽는 AI가 같은 호출에서 함께 봐요(호출이 늘지 않아요).')}`;
        }
        el.innerHTML = tabs + body;
        const save = () => { api.save(); api.redraw(); };
        acts(el, {
            tab: (v) => { st._tab = v; api.redraw(); },
            edit: (_v, t) => { const k = t.dataset.k; st[k] = t.value.trim(); if (k === 'scene') st.sceneAt = null; api.save(); },
            pin: (to) => { const t = val(el, '[data-k="once"]'); if (!t) return; st[to] = t; st.once = ''; if (to === 'scene') st.sceneAt = null; save(); },
            clear: () => { st.scene = ''; st.sceneAt = null; save(); },
            keep: () => { const t = val(el, '[data-k="once"]'); if (t && !cfg.saved.some((s) => s.text === t)) { cfg.saved.push({ title: clip(t, 20), text: t }); if (cfg.saved.length > 30) cfg.saved.shift(); save(); } },
            use: (n) => { st.once = cfg.saved[+n].text; save(); },
            forget: (n) => { cfg.saved.splice(+n, 1); save(); },
            pick: (v) => { const [k, id] = v.split('|'); cfg.pick[k] = id; save(); },
            set: (id) => { const x = SETS.find((s) => s[0] === id)?.[2] ?? {}; cfg.pick.size = x.size ?? 'auto'; cfg.pick.reach = x.reach ?? 'auto'; cfg.boost = Object.fromEntries((x.boost ?? []).map((b) => [b, true])); save(); },
            boost: (id) => { cfg.boost[id] = !cfg.boost[id]; save(); },
            reason: (r) => { const t = el.querySelector('[data-act="redotext"]'); t.value = [t.value.trim(), r].filter(Boolean).join(', '); st.redo = { idx: last, text: t.value, text0: (env.recent?.(1) ?? [])[0] ?? '' }; api.save(); },
            redotext: (_v, t) => { st.redo = { idx: last, text: t.value.trim(), text0: (env.recent?.(1) ?? [])[0] ?? '' }; api.save(); },
            redo: () => { const t = el.querySelector('[data-act="redotext"]').value.trim(); st.redo = { idx: last, text: t, text0: (env.recent?.(1) ?? [])[0] ?? '' }; api.save(); if (!api.regen?.()) api.toast('이유를 걸었어요. 마지막 답을 다시 뽑으면 붙어요.'); },
            ooc: () => { st.ooc = st.ooc ? false : 'once'; save(); },
            gadd: () => { st.goals.push({ v: '', signs: [], mode: 'silent', every: 4 }); save(); },
            gdel: (n) => { st.goals.splice(+n, 1); save(); },
            goal: (_v, t) => { const g = st.goals[+t.dataset.n], k = t.dataset.k; if (!g) return; g[k] = k === 'signs' ? ownWords(t.value) : k === 'every' ? Math.max(2, Math.min(20, +t.value || 4)) : t.value.trim(); api.save(); },
            gmode: (v) => { const [n, m] = v.split('|'); st.goals[+n].mode = m; save(); },
            arrive: (n) => { st.goals[+n].done = !st.goals[+n].done; save(); },
            rmode: (id, s) => { const own = cfg.rules.find((r) => r.id === id); if (own) own.mode = s.value; else cfg.modes[id] = s.value; save(); },
            rdel: (id) => { cfg.rules = cfg.rules.filter((r) => r.id !== id); save(); },
            radd: () => { const t = val(el, '[data-f="rule"]'); if (!t) return; cfg.rules.push({ id: `r${Date.now().toString(36).slice(-5)}`, text: clip(t, 300), mode: 'auto' }); save(); },
        });
    },
};
