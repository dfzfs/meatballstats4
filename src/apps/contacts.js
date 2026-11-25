// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };
const one = (t) => String(t ?? '').replace(/\s*\n+\s*/g, ' ').trim();

// 📞 Contacts: text a character from the phone. One model call per tap, never on its own.
// Ported from the second generation's contacts app and the first generation's contact tab:
//   threads that remember (as many earlier texts as the memory setting allows, plus a one-line summary kept per person),
//   left on read / unread / going quiet for a while, asleep at night (the reply comes when they wake and you tap),
//   do not disturb (they never text first), texting first on request, gifts and money from the wallet,
//   letters that take story days to arrive, and a confession or proposal by text handed to the bonds app.
const threads = (st) => (st.threads ??= {});
const per = (st, who) => ((st.per ??= {})[who] ??= {});
const RECALL = { short: 0, mid: 6000, long: 20000 };   // letters of earlier texts kept in a prompt (0 = last 14 lines)
function memory(who, user, log, recall = 'mid') {
    const fmt = (m) => `${m.me ? user : who}: ${one(m.text)}`, budget = RECALL[recall] ?? RECALL.mid;
    let take = log.slice(-14);
    if (budget) { take = []; let used = 0; for (let i = log.length - 1; i >= 0; i--) { const line = fmt(log[i]); if (take.length >= 14 && used + line.length > budget) break; take.unshift(log[i]); used += line.length + 1; } }
    return `${take.length < log.length ? '(…earlier texts omitted…)\n' : ''}${take.map(fmt).join('\n')}`;
}
// Asleep at night (scene time of day), or gone quiet for a while after their last text. -> null | { why, until }
function awayOf(env, who, p) {
    if (env.cfg?.cut === false) return null;
    const sc = env.peek?.('scene');
    if (p.quiet && (sc ? sc.day * 24 + (sc.hrs ?? 0) : env.last ?? 0) < p.quiet.until) return { why: p.quiet.why || '잠수' };
    if (sc && ['night', 'midnight'].includes(sc.tod) && !(sc.with ?? []).includes(who)) return { why: '자는 시간', sleep: true };
    return null;
}
const nowMark = (env) => { const sc = env.peek?.('scene'); return sc ? sc.day * 24 + (sc.hrs ?? 0) : env.last ?? 0; };
const TAG = /[\[(【]\s*(읽씹|안\s*읽음|잠수|선물|송금|yes|no)\s*[:：]?\s*([^\])】\n]*)[\])】]/gi;
// Reply text -> { lines, seen (left on read), unread, quiet: { why, hours }, gift, money, answer: 'yes'|'no'|'' }
function parseReply(raw) {
    const o = { lines: [], seen: false, unread: false, quiet: null, gift: '', money: 0, answer: '' };
    const s = String(raw ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
    for (const m of s.matchAll(TAG)) {
        const k = m[1].replace(/\s/g, '').toLowerCase(), v = m[2].trim();
        if (k === '읽씹') o.seen = true; else if (k === '안읽음') o.unread = true;
        else if (k === '잠수') { const [why, h] = v.split('|').map((x) => x.trim()); o.quiet = { why: clip(why, 30), hours: Math.max(1, Math.min(12, +String(h ?? '').replace(/\D/g, '') || 3)) }; }
        else if (k === '선물') o.gift = clip(v, 40); else if (k === '송금') o.money = Math.max(0, +v.replace(/[^\d]/g, '') || 0);
        else if (k === 'yes' || k === 'no') o.answer = k;
    }
    o.lines = s.replace(TAG, '').split('\n').map((l) => clip(l.replace(/^["“]|["”]$/g, '').replace(/^[^:\n]{1,20}:\s*/, ''), 300)).filter(Boolean).slice(0, 3);
    return o;
}
const ASK_TEXT = { confess: '있잖아… 나 너 좋아해. 우리 사귈래?', propose: '나랑… 결혼해 줄래?' };
const LOVER = /lover|couple|dating|engaged|married|연인|애인|사귀|약혼|부부/i, WED = /married|부부/i;

export default {
    _t: { memory, awayOf, parseReply },   // for tests only; not part of the app contract
    api: 1, id: 'contacts', name: '연락', icon: '📞', color: '#34c759', cost: 'tap',
    desc: '이야기 속 인물에게 문자를 보내고 답장을 받아요. 주고받은 문자는 다음 답에 한 번 알려 줘요.',
    // Told to the main model once, by the next reply, then spent.
    note(_s, env) {
        const f = env.store.fresh, st = env.store, now = [];
        if (f && st.tell !== false) now.push(f.letter ? `A letter from ${f.who} has reached ${env.user}: "${clip(f.them, 300)}". ${env.user} has read it.` : `Since the last reply, ${env.user} and ${f.who} exchanged text messages. ${env.user}: "${clip(f.me, 200)}" — ${f.who}: "${clip(f.them, 300)}". The characters know this happened.`);
        // letters that arrived with the story's days (no call: the reply was written when it was sent, and waits)
        const day = env.peek?.('scene')?.day;
        for (const [who, L] of Object.entries(st.threads ?? {})) for (const m of L) if (m.letter && !m.me && !m.told && day != null && day >= m.arrive && st.tell !== false) now.push(`A letter from ${who} has arrived for ${env.user} today. It says: "${clip(m.text, 300)}".`);
        return now.length ? { now: now.slice(0, 2) } : null;
    },
    onReply(env) {
        const st = env.store, day = env.peek?.('scene')?.day;
        let ch = false;
        if (st.fresh) { st.fresh = null; ch = true; }
        for (const L of Object.values(st.threads ?? {})) for (const m of L) if (m.letter && !m.me && !m.told && day != null && day >= m.arrive) { m.told = true; ch = true; }
        return ch;
    },
    hud: (_s, env) => { const day = env.peek?.('scene')?.day; const mail = day != null && Object.values(env.store.threads ?? {}).some((L) => L.some((m) => m.letter && !m.me && !m.told && day >= m.arrive)); return [...(env.store.fresh ? ['📞 새 문자'] : []), ...(mail ? ['✉️ 편지 도착'] : [])]; },
    widget(_s, env) { const T = env.store.threads ?? {}, last = Object.entries(T).map(([who, l]) => ({ who, m: l.filter((m) => !m.letter || m.me).at(-1) })).filter((x) => x.m).slice(-2); return last.map((x) => `<div class="mb4-row"><span class="mb4-row-k">${esc(x.who)}</span><span class="mb4-row-v">${esc(clip(x.m.text, 50))}</span></div>`).join(''); },
    widgetTitle: '최근 문자',
    render(el, api) {
        const st = api.store, cfg = api.cfg, k = api.kit, T = threads(st), env = api.env, user = env.user || 'me';
        const day = env.peek('scene')?.day;
        const near = k.closeness(env.peek('bonds'), env.peek('heart'), env.user);
        const known0 = [...new Set([...(st.recent ?? []), ...(env.peek('scene')?.with ?? []), ...Object.keys(env.peek('people')?.list ?? {}), ...Object.keys(T)])].filter((n) => n && n !== env.user);
        // the closest people first (💞 관계 · 💗 호감); equally close ones keep the most recent first
        const known = known0.map((n, j) => [n, j]).sort((a, b) => (near(b[0]) - near(a[0])) || a[1] - b[1]).map(([n]) => n);
        if (st.who && !known.includes(st.who)) st.who = '';
        const nick = (n) => env.peekStore?.('touch')?.names?.[n] ?? '';
        const nameOf = (n) => (nick(n) ? `${esc(nick(n))} <small>${esc(n)}</small>` : esc(n));
        const visible = (m) => !m.letter || m.me || (day != null && day >= m.arrive);
        const inCount = (n) => (T[n] ?? []).filter((m) => !m.me && visible(m)).length;
        const bump = (n) => { st.recent = [n, ...(st.recent ?? []).filter((x) => x !== n)].slice(0, 60); };
        const edit = (rows, extra = '') => k.editCard(rows, extra);
        // ── the list of conversations (with the group room as one room in it) ──
        if (!st.who) {
            api.title('📞 연락');
            const groupOn = api.isOn?.('group'), G = env.peekStore?.('group')?.log ?? [], gl = G.at?.(-1);
            const row = (n) => {
                const L = (T[n] ?? []).filter(visible), last = L.at(-1), P = per(st, n), away = awayOf(env, n, P), dot = inCount(n) > (P.seen ?? 0);
                return `<button class="mbx-row" data-act="open" data-v="${esc(n)}"><span class="mb4-face">${k.face(n)}</span><span class="mbx-row-t"><b>${nameOf(n)}${P.dnd ? ' <i>🔕</i>' : ''}${away ? ` <i>${away.sleep ? '😴' : '💤'}</i>` : ''}</b><small>${last ? `${last.me ? '나: ' : ''}${last.letter ? '✉️ ' : ''}${esc(clip(one(last.text), 60))}` : '아직 문자가 없어요'}</small></span>${dot ? '<em class="mbx-new"></em>' : ''}</button>`;
            };
            el.innerHTML = `<div class="mb4-list mbx-list">
                <button class="mbx-row" data-act="group"><span class="mb4-face mbx-gface">💬</span><span class="mbx-row-t"><b>단체방</b><small>${groupOn ? (gl ? `${esc(gl.me ? '나' : gl.who)}: ${esc(clip(gl.t, 50))}` : '인물들끼리 떠드는 방') : '꺼져 있어요 · 눌러서 켜기'}</small></span></button>
                ${k.foldRest(known.map(row))}</div>
                ${known.length ? '' : k.hint('이야기에 인물이 나오면 여기 떠요. 이름을 직접 적어 추가할 수도 있어요.')}
                <div class="mb4-btnrow"><input class="mb4-input" data-f="new" maxlength="40" placeholder="＋ 이름 직접 적어 추가"><button class="mb4-btn ghost" data-act="add">추가</button></div>
                ${st._panel === 'cfg' ? settings() : ''}`;
            api.menu([
                { icon: '⚙️', label: '연락 설정', sub: '본편에 알리기 · 연락 끊김 · 기억 분량', act: () => { st._panel = st._panel === 'cfg' ? '' : 'cfg'; api.redraw(); } },
            ]);
            wire();
            return;
        }
        // ── one conversation ──
        const who = st.who, L = (T[who] ??= []), P = per(st, who), away = awayOf(env, who, P);
        P.seen = inCount(who);
        api.title(`${k.face(who)} ${nick(who) || who}`);
        api.onBack(() => { st.who = ''; st._panel = ''; api.save(); api.redraw(); return true; });
        const bond = Object.values(env.peek('bonds')?.pairs ?? {}).find((x) => (x.a === who && x.b === env.user) || (x.b === who && x.a === env.user));
        const askKind = bond ? (WED.test(bond.tie) ? '' : LOVER.test(bond.tie) ? 'propose' : bond.lvl >= 2 ? 'confess' : '') : '';
        const W = env.peek('wallet');
        const idx = L.map((m, i) => [m, i]).filter(([m]) => visible(m)).slice(-30);
        const waiting = L.some((m) => m.me && m.wait);
        const coming = L.filter((m) => m.letter && !m.me && day != null && day < m.arrive);
        const panel = st._panel === 'sum' ? k.card('🧠 한 줄 요약', `<textarea class="mb4-input" rows="2" maxlength="300" data-f="sum" placeholder="오래된 일도 기억하게 한 줄로 적어 두세요">${esc(P.sum ?? '')}</textarea><div class="mb4-btnrow"><button class="mb4-btn sm" data-act="sumSave">저장</button><button class="mb4-btn ghost sm" data-act="sum" ${L.length < 6 ? 'disabled' : ''}>🪄 AI로 요약 (1회)</button><button class="mb4-btn ghost sm" data-act="panel" data-v="">닫기</button></div>`)
            : st._panel === 'gift' ? k.card('🎁 무엇을 줄까요?', (W?.items ?? []).length ? `<div class="mb4-chips">${W.items.map((x) => { const n = typeof x === 'string' ? x : x?.name; return n ? `<button class="mb4-opt" data-act="gift" data-v="${esc(n)}">${esc(n)}</button>` : ''; }).join('')}</div>` : k.hint('가방이 비었어요.'))
            : st._panel === 'cfg' ? settings() : '';
        el.innerHTML = `${P.sum ? `<button class="mbx-sum" data-act="panel" data-v="sum">🧠 ${esc(P.sum)}</button>` : ''}
            ${away ? `<div class="mbx-away">${away.sleep ? '😴 자는 시간이에요. 보내 두면 깬 뒤 「답장 받기」로 받아요.' : `💤 ${esc(away.why)} — 지금은 연락이 안 돼요.`}</div>` : ''}
            ${panel}
            <div class="mbx-thread">${idx.map(([m]) => `<div class="mbx-b ${m.me ? 'me' : 'them'}">${m.me ? (m.wait && !m.read ? '<em class="mbx-one">1</em>' : '') : `<span class="mb4-face mbx-av">${k.face(who)}</span>`}<div class="mbx-bubble${m.letter ? ' letter' : ''}">${m.letter ? '✉️ ' : ''}${esc(m.text)}${m.att ? `<small>${esc(m.att)}</small>` : ''}</div></div>`).join('') || `<p class="mb4-hint mb4-center">${esc(who)}에게 첫 문자를 보내 보세요.</p>`}
                ${coming.length ? `<p class="mb4-hint mb4-center">✉️ 답장 편지가 오는 중 (${Math.min(...coming.map((m) => m.arrive)) - day}일 뒤)</p>` : ''}
                ${waiting && !away ? `<div class="mbx-retry"><span>${P.note === 'seen' ? '읽고 답이 없어요.' : P.note === 'unread' ? '아직 안 읽었어요.' : '아직 답장이 없어요.'}</span><button class="mb4-btn ghost sm" data-act="reply">답장 받기</button></div>` : ''}</div>
            <div class="mbx-dock"><textarea class="mb4-input mbx-in" data-f="msg" rows="1" maxlength="300" placeholder="${away ? '보내 두면 깼을 때 답장해요' : '문자 보내기'}">${esc(st._draft?.[who] ?? '')}</textarea><button class="mb4-btn mbx-go" data-act="send">보내기</button></div>
            ${edit([...(P.sum != null ? [{ name: 'sum', i: 0, label: '🧠 한 줄 요약', value: P.sum, rows: 2 }] : []), ...idx.map(([m, i]) => ({ name: 'msg', i, label: `${m.me ? '나' : who}${m.letter ? ' · 편지' : ''}`, value: m.text, rows: 2 }))])}`;
        api.menu([
            { icon: '📨', label: '먼저 연락 오게', sub: 'AI 1회', disabled: !!P.dnd, act: () => run('first') },
            { icon: '✉️', label: '편지로 보내기', sub: day == null ? '🧭 장면이 켜져 있어야 날이 흘러요' : '입력창에 쓴 글을 편지로 · AI 1회', disabled: day == null, act: () => run('letter') },
            ...(W ? [{ icon: '🎁', label: '선물 보내기', sub: '가방에서 골라요', act: () => { st._panel = 'gift'; api.redraw(); } }] : []),
            ...(askKind ? [{ icon: askKind === 'confess' ? '💌' : '💍', label: askKind === 'confess' ? '문자로 고백하기' : '문자로 청혼하기', sub: 'AI 1회', act: () => run('ask', askKind) }] : []),
            { icon: P.dnd ? '🔔' : '🔕', label: P.dnd ? '방해 금지 풀기' : '방해 금지', sub: '켜면 먼저 연락하지 않아요', act: () => { P.dnd = !P.dnd; api.save(); api.redraw(); } },
            { icon: '🧠', label: '한 줄 요약', sub: P.sum ? '보기 · 고치기' : '적어 두면 오래된 일도 기억해요', act: () => { st._panel = 'sum'; api.redraw(); } },
            { icon: '⚙️', label: '연락 설정', act: () => { st._panel = 'cfg'; api.redraw(); } },
        ]);
        const box = el.querySelector('.mbx-thread'); if (box) setTimeout(() => el.querySelector('.mbx-dock')?.scrollIntoView({ block: 'nearest' }), 0);
        const inp = el.querySelector('[data-f="msg"]');
        inp?.addEventListener('input', () => { (st._draft ??= {})[who] = inp.value; });
        inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('[data-act="send"]')?.click(); } });
        k.editors(el, {
            msg: { save: (i, t) => { if (L[i] && t) L[i].text = t; }, del: (i) => { L.splice(i, 1); } },
            sum: { save: (_i, t) => { P.sum = t || undefined; if (!t) delete P.sum; }, del: () => { delete P.sum; } },
        }, () => { api.save(); api.redraw(); });
        wire();
        function run(what, v) { handlers[what]?.(v, null); }

        function settings() {
            return k.card('⚙️ 연락 설정', `<label class="mb4-sw"><span><b>다음 답에 알리기</b><small>주고받은 문자를 본편 AI가 한 번 알아요</small></span><input type="checkbox" data-act="tell" ${st.tell !== false ? 'checked' : ''}><i></i></label>
                <label class="mb4-sw"><span><b>연락이 끊길 때도 있게</b><small>밤엔 자고, 가끔 잠수도 타요</small></span><input type="checkbox" data-act="cut" ${cfg.cut !== false ? 'checked' : ''}><i></i></label>
                <label class="mb4-label" style="margin:8px 0 6px">기억 분량</label><div class="mb4-seg">${[['short', '짧게'], ['mid', '보통'], ['long', '길게']].map(([v, n]) => `<button class="${(cfg.recall ?? 'mid') === v ? 'on' : ''}" data-act="recall" data-v="${v}">${n}</button>`).join('')}</div>
                ${k.hint('보내기 · 답장 받기 · 먼저 연락 · 요약은 누를 때마다 AI를 1번 불러요. 그 밖엔 0이에요.')}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="panel" data-v="">닫기</button></div>`);
        }
        var handlers;
        function wire() {
            const facts = () => api.facts() || '(nothing recorded)';
            const about = () => { const a = env.peek('people')?.list?.[st.who]?.about ?? ''; return a ? ` (${a})` : ''; };
            const w = st.who, PP = w ? per(st, w) : {};
            const bd = w ? Object.values(env.peek('bonds')?.pairs ?? {}).find((x) => (x.a === w && x.b === env.user) || (x.b === w && x.a === env.user)) : null;
            const tone = bd ? `\n[Where they stand]\nRelationship: ${bd.tie || 'not named yet'}; how close they have physically got so far: ${bd.lvl ?? 0} of 5. Keep the warmth of the texts at exactly that level.\n` : '';
            const story = () => clip(env.recent(1)[0] ?? '', 1500);
            const replyPrompt = (extra = '') => `[TASK] Do NOT continue the story and do not narrate. Write ONLY ${w}'s text-message reply to ${user}'s latest texts, as ${w}${about()} would type it on a phone right now.\n\n[What is known]\n${facts()}\n${PP.sum ? `Summary of their earlier texts: ${PP.sum}\n` : ''}\n[The story so far, latest part]\n${story()}\n\n[Texts, oldest first]\n${memory(w, user, T[w] ?? [], cfg.recall)}\n${tone}${extra}\nShort, like real texts: one text per line, at most 3 lines, same language as the texts, no name tag, no quotes, no narration.\nOnly if the relationship is bad, ${w} is upset or busy, ${w} may not answer: then output exactly [읽씹] or [안읽음] and nothing else.${cfg.cut !== false ? `\nIf ${w} will be unreachable for a while after this (going to sleep, working, upset), add a last line [잠수: short reason | hours 1-12].` : ''}\nIf ${w} sends ${user} a gift or money in this reply, add a last line [선물: item] or [송금: number]; without that line nothing arrives.\nOutput only the messages and tags.`;
            const take = (raw, opts = {}) => {
                const r = parseReply(raw), mine = (T[w] ??= []).filter((m) => m.me && m.wait);
                for (const m of mine) { if (r.lines.length) delete m.wait; m.read = !r.unread; }
                PP.note = r.unread ? 'unread' : r.seen ? 'seen' : '';
                if (r.quiet) PP.quiet = { why: r.quiet.why, until: nowMark(env) + (env.peek('scene') ? r.quiet.hours : r.quiet.hours * 2) };
                if (!r.lines.length) { api.toast(r.unread ? '안 읽었어요.' : r.seen ? '읽고 답이 없어요.' : '답장을 받지 못했어요.'); return r; }
                for (const t of r.lines) T[w].push({ me: false, text: t, ...(opts.letter ? { letter: true, arrive: opts.arrive } : {}) });
                if (r.gift && api.fix('got', `${r.gift} | from ${w}`)) T[w].at(-1).att = `🎁 ${r.gift}`;
                if (r.money && api.fix('cash', `+${r.money} | ${w}에게 받음`)) T[w].at(-1).att = `💸 ${r.money}`;
                if (!opts.letter) st.fresh = { who: w, me: mine.map((m) => m.text).join(' / ') || '(texted first)', them: r.lines.join(' / ') };
                if (T[w].length > 200) T[w].splice(0, T[w].length - 200);
                bump(w);
                return r;
            };
            const busy = (b, t) => { if (b) { b.disabled = true; b.textContent = t; } api.toast(t); };
            const msg = () => k.val(el, '[data-f="msg"]');
            const clear = () => { if (st._draft) delete st._draft[w]; };
            handlers = {
                open: (n) => { st.who = n; st._panel = ''; api.save(); api.redraw(); },
                group: () => api.go('page:contacts:group'),
                add: () => { const n = k.val(el, '[data-f="new"]'); if (n) { T[n] ??= []; bump(n); st.who = n; api.save(); api.redraw(); } },
                panel: (v) => { st._panel = v; api.redraw(); },
                tell: (_v, c) => { st.tell = c.checked; api.save(); },
                cut: (_v, c) => { cfg.cut = c.checked; api.save(); api.redraw(); },
                recall: (v) => { cfg.recall = v; api.save(); api.redraw(); },
                sumSave: () => { const t = k.val(el, '[data-f="sum"]'); if (t) PP.sum = clip(t, 300); else delete PP.sum; st._panel = ''; api.save(); api.redraw(); },
                send: async (_v, b) => {
                    const text = msg(); if (!text || !w) return;
                    (T[w] ??= []).push({ me: true, text, wait: true }); clear(); bump(w);
                    const aw = awayOf(env, w, PP);
                    if (aw) { api.toast(aw.sleep ? '자는 중이에요. 깨면 답장해요.' : `${aw.why} 중이에요.`); api.save(); api.redraw(); return; }
                    api.save(); api.redraw(); busy(null, '답장 기다리는 중…');
                    take(await api.ask(replyPrompt(), 300));
                    api.save(); api.redraw();
                },
                reply: async (_v, b) => { busy(b, '받는 중…'); take(await api.ask(replyPrompt(), 300)); api.save(); api.redraw(); },
                first: async () => {
                    busy(null, `${w}의 연락을 기다리는 중…`);
                    const raw = await api.ask(`[TASK] Do NOT continue the story and do not narrate. ${w}${about()} texts ${user} first, unprompted, right now. Write ONLY that text message, fitting ${w} and the moment.\n\n[What is known]\n${facts()}\n\n[The story so far, latest part]\n${story()}\n\n[Earlier texts]\n${memory(w, user, T[w] ?? [], cfg.recall) || '(none)'}\n\nShort, one text per line, at most 3 lines, in the language of the story. Output only the messages.`, 250);
                    take(raw); api.save(); api.redraw();
                },
                letter: async () => {
                    const text = msg(); if (!text || day == null) { api.toast('입력창에 편지에 쓸 말을 먼저 적어 주세요.'); return; }
                    const days = Math.max(1, Math.min(14, +(cfg.letterDays ?? 3)));
                    (T[w] ??= []).push({ me: true, text, letter: true }); clear();
                    busy(null, '부치는 중…');
                    const raw = await api.ask(`[TASK] Do NOT continue the story. ${user} sent ${w}${about()} a letter. Write ONLY ${w}'s reply letter, as ${w} would write it by hand: a few warm or fitting sentences, the same language as ${user}'s letter, no narration.\n\n[What is known]\n${facts()}\n\n[${user}'s letter]\n${text}\n\nOutput only the letter.`, 500);
                    const r = parseReply(raw);
                    if (r.lines.length) { T[w].push({ me: false, text: clip(String(raw).replace(TAG, '').trim(), 600), letter: true, arrive: day + days * 2 }); api.toast(`부쳤어요. 답장은 이야기 속 약 ${days * 2}일 뒤 도착해요.`); }
                    else api.toast('답장을 받지 못했어요.');
                    api.save(); api.redraw();
                },
                gift: (name) => {
                    if (name && api.fix('lost', name)) { (T[w] ??= []).push({ me: true, text: `🎁 ${name}`, att: '선물', wait: true }); st._panel = ''; api.toast(`${name}을(를) 보냈어요. 「답장 받기」를 눌러요.`); api.save(); api.redraw(); }
                },
                ask: async (kind) => {
                    busy(null, '보내는 중…');
                    (T[w] ??= []).push({ me: true, text: ASK_TEXT[kind], wait: true });
                    const r = take(await api.ask(replyPrompt(`${user} just ${kind === 'confess' ? 'confessed their feelings and asked to date' : 'proposed marriage'}. ${w} answers honestly, as ${w} feels right now. Add a last line [yes] if ${w} accepts or [no] if ${w} turns it down.`), 300));
                    if (r.answer === 'yes' && api.fix('tie', `${user}-${w}=${kind === 'confess' ? 'lovers' : 'engaged'}`)) api.toast(kind === 'confess' ? `💗 ${w}와(과) 연인이 됐어요` : `💍 ${w}와(과) 약혼했어요`);
                    else if (r.answer === 'no') api.toast(`${w}이(가) 거절했어요.`);
                    api.save(); api.redraw();
                },
                sum: async (_v, b) => {
                    busy(b, '요약 중…');
                    const raw = await api.ask(`[TASK] Do NOT continue the story. Summarize what ${user} and ${w} have talked about by text so far in ONE short Korean line (under 120 characters): key facts, plans, promises, mood. Output only that line.\n${PP.sum ? `Previous summary: ${PP.sum}\n` : ''}Texts (oldest first):\n${(T[w] ?? []).slice(-60).map((m) => `${m.me ? user : w}: ${one(m.text)}`).join('\n')}`, 200);
                    if (raw) PP.sum = clip(one(raw), 160);
                    api.save(); api.redraw();
                },
            };
            k.acts(el, handlers);
        }
    },
    css: `.mbx-list{padding:0}.mbx-row{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px;border:0;background:transparent;text-align:left}.mbx-row+.mbx-row{border-top:.5px solid var(--line)}.mbx-row:hover{background:var(--fill2)}.mbx-row .mb4-face{width:44px;height:44px;font-size:23px}.mbx-gface{background:color-mix(in srgb,#00b4d8 22%,transparent)!important}.mbx-row-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}.mbx-row-t b{font-weight:600}.mbx-row-t b i{font-style:normal;font-size:12px}.mbx-row-t small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mbx-new{flex:none;width:9px;height:9px;border-radius:50%;background:#ff3b30}
.mbx-sum{display:block;width:100%;margin:0 0 10px;padding:8px 12px;border:0;border-radius:12px;background:var(--fill2);text-align:left;font-size:12.5px!important;color:var(--sub)!important}
.mbx-away{margin:0 0 10px;padding:8px 12px;border-radius:12px;background:rgba(255,159,10,.14);font-size:12.5px}
.mbx-thread{display:flex;flex-direction:column;gap:5px;padding:4px 0 10px;min-height:120px}.mbx-b{display:flex;align-items:flex-end;gap:6px}.mbx-b.me{justify-content:flex-end}.mbx-av{width:28px!important;height:28px!important;font-size:15px!important}
.mbx-bubble{max-width:76%;padding:8px 12px;border-radius:18px;background:var(--card);box-shadow:0 .5px 0 var(--line);overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.45}.mbx-b.them .mbx-bubble{border-bottom-left-radius:6px}.mbx-b.me .mbx-bubble{background:#34c759;color:#fff;border-bottom-right-radius:6px;box-shadow:none}.mbx-bubble small{display:block;font-size:11px;opacity:.75;color:inherit}.mbx-bubble.letter{border-radius:6px;background:#fff7e6;color:#4a3b2a;font-family:serif}.mbx-b.me .mbx-bubble.letter{background:#e8f6ec;color:#234}.mbx-one{font-style:normal;font-size:11px;font-weight:800;color:#f5a623}
.mbx-retry{display:flex;align-items:center;gap:8px;padding:4px 0 0 34px;font-size:12.5px;color:var(--sub)}
.mbx-dock{position:sticky;bottom:-26px;display:flex;align-items:flex-end;gap:8px;margin:0 -16px;padding:8px 16px 12px;background:var(--glass);-webkit-backdrop-filter:blur(22px) saturate(1.6);backdrop-filter:blur(22px) saturate(1.6);border-top:.5px solid var(--line);z-index:2}.mb4-phone .mbx-in{flex:1;margin:0;min-height:38px;max-height:120px;resize:none;border-radius:19px!important;field-sizing:content}.mbx-go{border-radius:19px!important;min-height:38px}`,
};
