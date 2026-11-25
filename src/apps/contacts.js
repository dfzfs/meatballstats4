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
        const known = [...new Set([...(env.peek('scene')?.with ?? []), ...Object.keys(env.peek('people')?.list ?? {}), ...Object.keys(T)])].filter((n) => n && n !== env.user);
        st.who = known.includes(st.who) ? st.who : known[0] ?? '';
        const nick = (n) => env.peekStore?.('touch')?.names?.[n] ?? '';
        const nameOf = (n) => (nick(n) ? `${esc(nick(n))} <small>${esc(n)}</small>` : esc(n));
        const inCount = (n) => (T[n] ?? []).filter((m) => !m.me && (!m.letter || (env.peek('scene')?.day ?? -1) >= m.arrive)).length;
        if (st.who) per(st, st.who).seen = inCount(st.who);
        const who = st.who, L = T[who] ?? [], P = who ? per(st, who) : {}, away = who ? awayOf(env, who, P) : null, day = env.peek('scene')?.day;
        const bond = Object.values(env.peek('bonds')?.pairs ?? {}).find((x) => (x.a === who && x.b === env.user) || (x.b === who && x.a === env.user));
        const askKind = bond ? (WED.test(bond.tie) ? '' : LOVER.test(bond.tie) ? 'propose' : bond.lvl >= 2 ? 'confess' : '') : '';
        const W = env.peek('wallet');
        const shown = L.filter((m) => !m.letter || m.me || (day != null && day >= m.arrive)).slice(-14);
        const waiting = L.some((m) => m.me && m.wait);
        el.innerHTML = `${k.card('누구에게', `${known.length ? `<div class="mb4-chips">${known.map((n) => `<button class="mb4-opt${n === who ? ' on' : ''}" data-act="who" data-v="${esc(n)}">${k.face(n)} ${nameOf(n)}${per(st, n).dnd ? ' 🔕' : ''}${n !== who && inCount(n) > (per(st, n).seen ?? 0) ? ' 🔴' : ''}</button>`).join('')}</div>` : ''}<div class="mb4-btnrow"><input class="mb4-input" data-f="new" maxlength="40" placeholder="이름 직접 적기"><button class="mb4-btn ghost" data-act="add">추가</button></div>`)}
        ${who ? k.card(`${k.face(who)} ${nameOf(who)}${away ? ` <span class="mb4-pill">${away.sleep ? '😴 자는 중' : `🔕 ${esc(away.why)}`}</span>` : ''}`, `
            ${P.sum ? `<p class="mb4-hint">🧠 ${esc(P.sum)}</p>` : ''}
            <div class="mbx-thread">${shown.map((m) => `<div class="mbx-bubble ${m.me ? 'me' : ''}${m.letter ? ' letter' : ''}">${m.letter ? '✉️ ' : ''}${esc(m.text)}${m.att ? `<small>${esc(m.att)}</small>` : ''}${m.me && m.read ? '<small>읽음</small>' : ''}</div>`).join('') || k.hint('아직 주고받은 문자가 없어요.')}${L.some((m) => m.letter && !m.me && day != null && day < m.arrive) ? `<div class="mb4-hint">✉️ 답장이 오는 중이에요 (${Math.min(...L.filter((m) => m.letter && !m.me && day < m.arrive).map((m) => m.arrive)) - day}일 뒤)</div>` : ''}</div>
            <div class="mb4-btnrow"><input class="mb4-input" data-f="msg" maxlength="300" placeholder="${away ? '보내 두면 깼을 때 답장해요' : '문자 쓰기'}"><button class="mb4-btn" data-act="send">보내기</button></div>
            <div class="mb4-btnrow tight">
                ${waiting && !away ? '<button class="mb4-btn ghost sm" data-act="reply">💬 답장 받기</button>' : ''}
                <button class="mb4-btn ghost sm" data-act="first" ${P.dnd ? 'disabled' : ''}>📨 먼저 연락 오게</button>
                <button class="mb4-btn ghost sm" data-act="letter" ${day == null ? 'disabled title="🧭 장면이 켜져 있어야 날이 흘러요"' : ''}>✉️ 편지로</button>
                ${W ? '<button class="mb4-btn ghost sm" data-act="gift">🎁 선물</button>' : ''}
                ${askKind ? `<button class="mb4-btn ghost sm" data-act="ask" data-v="${askKind}">${askKind === 'confess' ? '💌 고백하기' : '💍 청혼하기'}</button>` : ''}
                <button class="mb4-btn ghost sm" data-act="dnd">${P.dnd ? '🔔 방해 금지 풀기' : '🔕 방해 금지'}</button>
                <button class="mb4-btn ghost sm" data-act="sum" ${L.length < 6 ? 'disabled' : ''}>🧠 한 줄 요약</button>
            </div>`) : k.empty('📞', '문자 보낼 사람이 없어요', '이름을 직접 적어 추가해 보세요')}
        ${k.card('', `<label class="mb4-sw"><span><b>다음 답에 알리기</b><small>주고받은 문자를 본편 AI가 한 번 알아요</small></span><input type="checkbox" data-act="tell" ${st.tell !== false ? 'checked' : ''}><i></i></label>
            <label class="mb4-sw"><span><b>연락이 끊길 때도 있게</b><small>밤엔 자고, 가끔 잠수도 타요</small></span><input type="checkbox" data-act="cut" ${cfg.cut !== false ? 'checked' : ''}><i></i></label>
            <div class="mb4-btnrow">${[['short', '짧게 기억'], ['mid', '보통'], ['long', '길게 기억']].map(([v, n]) => `<button class="mb4-btn ${(cfg.recall ?? 'mid') === v ? '' : 'ghost '}sm" data-act="recall" data-v="${v}">${n}</button>`).join('')}</div>`)}
        ${k.hint('보내기 · 답장 받기 · 먼저 연락 · 요약은 누를 때마다 AI를 1번 불러요. 자는 중에 보낸 문자는 깬 뒤 「답장 받기」를 누르면 와요.')}`;
        const box = el.querySelector('.mbx-thread'); if (box) box.scrollTop = box.scrollHeight;
        const facts = () => api.facts() || '(nothing recorded)';
        const about = () => { const a = env.peek('people')?.list?.[who]?.about ?? ''; return a ? ` (${a})` : ''; };
        // where the two stand (💞, read-only): texts keep the same warmth as the story — no sudden jumps either way
        const tone = bond ? `\n[Where they stand]\nRelationship: ${bond.tie || 'not named yet'}; how close they have physically got so far: ${bond.lvl ?? 0} of 5. Keep the warmth of the texts at exactly that level.\n` : '';
        const story = () => clip(env.recent(1)[0] ?? '', 1500);
        const replyPrompt = (extra = '') => `[TASK] Do NOT continue the story and do not narrate. Write ONLY ${who}'s text-message reply to ${user}'s latest texts, as ${who}${about()} would type it on a phone right now.\n\n[What is known]\n${facts()}\n${P.sum ? `Summary of their earlier texts: ${P.sum}\n` : ''}\n[The story so far, latest part]\n${story()}\n\n[Texts, oldest first]\n${memory(who, user, T[who] ?? [], cfg.recall)}\n${tone}${extra}\nShort, like real texts: one text per line, at most 3 lines, same language as the texts, no name tag, no quotes, no narration.\nOnly if the relationship is bad, ${who} is upset or busy, ${who} may not answer: then output exactly [읽씹] or [안읽음] and nothing else.${cfg.cut !== false ? `\nIf ${who} will be unreachable for a while after this (going to sleep, working, upset), add a last line [잠수: short reason | hours 1-12].` : ''}\nIf ${who} sends ${user} a gift or money in this reply, add a last line [선물: item] or [송금: number]; without that line nothing arrives.\nOutput only the messages and tags.`;
        const take = (raw, opts = {}) => {
            const r = parseReply(raw), mine = (T[who] ??= []).filter((m) => m.me && m.wait);
            for (const m of mine) { delete m.wait; m.read = !r.unread; }
            if (r.quiet) P.quiet = { why: r.quiet.why, until: nowMark(env) + (env.peek('scene') ? r.quiet.hours : r.quiet.hours * 2) };
            if (!r.lines.length) { api.toast(r.unread ? '안 읽었어요.' : r.seen ? '읽고 답이 없어요.' : '답장을 받지 못했어요.'); return r; }
            for (const t of r.lines) T[who].push({ me: false, text: t, ...(opts.letter ? { letter: true, arrive: opts.arrive } : {}) });
            if (r.gift && api.fix('got', `${r.gift} | from ${who}`)) T[who].at(-1).att = `🎁 ${r.gift}`;
            if (r.money && api.fix('cash', `+${r.money} | ${who}에게 받음`)) T[who].at(-1).att = `💸 ${r.money}`;
            if (!opts.letter) st.fresh = { who, me: mine.map((m) => m.text).join(' / ') || '(texted first)', them: r.lines.join(' / ') };
            if (T[who].length > 200) T[who].splice(0, T[who].length - 200);
            return r;
        };
        const busy = (b, t) => { b.disabled = true; b.textContent = t; };
        k.acts(el, {
            who: (n) => { st.who = n; api.save(); api.redraw(); },
            add: () => { const n = k.val(el, '[data-f="new"]'); if (n) { T[n] ??= []; st.who = n; api.save(); api.redraw(); } },
            tell: (_v, c) => { st.tell = c.checked; api.save(); },
            cut: (_v, c) => { cfg.cut = c.checked; api.save(); api.redraw(); },
            recall: (v) => { cfg.recall = v; api.save(); api.redraw(); },
            dnd: () => { P.dnd = !P.dnd; api.save(); api.redraw(); },
            send: async (_v, b) => {
                const text = k.val(el, '[data-f="msg"]'); if (!text || !who) return;
                (T[who] ??= []).push({ me: true, text, wait: true });
                if (away) { api.toast(away.sleep ? '자는 중이에요. 깨면 답장해요.' : `${away.why} 중이에요.`); api.save(); api.redraw(); return; }
                busy(b, '보내는 중…');
                take(await api.ask(replyPrompt(), 300));
                api.save(); api.redraw();
            },
            reply: async (_v, b) => { busy(b, '받는 중…'); take(await api.ask(replyPrompt(), 300)); api.save(); api.redraw(); },
            first: async (_v, b) => {
                busy(b, '기다리는 중…');
                const raw = await api.ask(`[TASK] Do NOT continue the story and do not narrate. ${who}${about()} texts ${user} first, unprompted, right now. Write ONLY that text message, fitting ${who} and the moment.\n\n[What is known]\n${facts()}\n\n[The story so far, latest part]\n${story()}\n\n[Earlier texts]\n${memory(who, user, T[who] ?? [], cfg.recall) || '(none)'}\n\nShort, one text per line, at most 3 lines, in the language of the story. Output only the messages.`, 250);
                take(raw); api.save(); api.redraw();
            },
            letter: async (_v, b) => {
                const text = k.val(el, '[data-f="msg"]'); if (!text || day == null) { api.toast('편지에 쓸 말을 적어 주세요.'); return; }
                const days = Math.max(1, Math.min(14, +(cfg.letterDays ?? 3)));
                (T[who] ??= []).push({ me: true, text, letter: true });
                busy(b, '부치는 중…');
                const raw = await api.ask(`[TASK] Do NOT continue the story. ${user} sent ${who}${about()} a letter. Write ONLY ${who}'s reply letter, as ${who} would write it by hand: a few warm or fitting sentences, the same language as ${user}'s letter, no narration.\n\n[What is known]\n${facts()}\n\n[${user}'s letter]\n${text}\n\nOutput only the letter.`, 500);
                const r = parseReply(raw);
                if (r.lines.length) { T[who].push({ me: false, text: clip(String(raw).replace(TAG, '').trim(), 600), letter: true, arrive: day + days * 2 }); api.toast(`부쳤어요. 답장은 이야기 속 약 ${days * 2}일 뒤 도착해요.`); }
                else api.toast('답장을 받지 못했어요.');
                api.save(); api.redraw();
            },
            gift: () => {
                const items = W?.items ?? []; if (!items.length) { api.toast('가방이 비었어요.'); return; }
                const pick = items.at(-1), name = typeof pick === 'string' ? pick : pick.name;
                if (api.fix('lost', name)) { (T[who] ??= []).push({ me: true, text: `🎁 ${name}`, att: '선물', wait: true }); api.toast(`${name}을(를) 보냈어요. 「답장 받기」를 눌러요.`); api.save(); api.redraw(); }
            },
            ask: async (kind, b) => {
                busy(b, '보내는 중…');
                (T[who] ??= []).push({ me: true, text: ASK_TEXT[kind], wait: true });
                const r = take(await api.ask(replyPrompt(`${user} just ${kind === 'confess' ? 'confessed their feelings and asked to date' : 'proposed marriage'}. ${who} answers honestly, as ${who} feels right now. Add a last line [yes] if ${who} accepts or [no] if ${who} turns it down.`), 300));
                if (r.answer === 'yes' && api.fix('tie', `${user}-${who}=${kind === 'confess' ? 'lovers' : 'engaged'}`)) api.toast(kind === 'confess' ? `💗 ${who}와(과) 연인이 됐어요` : `💍 ${who}와(과) 약혼했어요`);
                else if (r.answer === 'no') api.toast(`${who}이(가) 거절했어요.`);
                api.save(); api.redraw();
            },
            sum: async (_v, b) => {
                busy(b, '요약 중…');
                const raw = await api.ask(`[TASK] Do NOT continue the story. Summarize what ${user} and ${who} have talked about by text so far in ONE short Korean line (under 120 characters): key facts, plans, promises, mood. Output only that line.\n${P.sum ? `Previous summary: ${P.sum}\n` : ''}Texts (oldest first):\n${(T[who] ?? []).slice(-60).map((m) => `${m.me ? user : who}: ${one(m.text)}`).join('\n')}`, 200);
                if (raw) P.sum = clip(one(raw), 160);
                api.save(); api.redraw();
            },
        });
    },
    css: '.mbx-thread{display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto}.mbx-bubble{align-self:flex-start;max-width:82%;padding:7px 11px;border-radius:16px 16px 16px 4px;background:rgba(70,45,35,.08);overflow-wrap:anywhere}.mbx-bubble.me{align-self:flex-end;border-radius:16px 16px 4px 16px;background:#34c759;color:#fff}.mbx-bubble small{display:block;font-size:11px;opacity:.75}.mbx-bubble.letter{border-radius:6px;background:#fff7e6;color:#4a3b2a;font-family:serif}.mbx-bubble.letter.me{background:#e8f6ec;color:#234}',
};
