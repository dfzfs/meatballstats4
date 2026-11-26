// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };
import { cycleToday } from './calendar.js';
import { startMs } from '../core/clock.js';
import { plain, spendPlain, stamped, spendStamped, isReroll, sameReply } from '../core/once.js';
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
    if (env.cfg?.cut !== true) return null;   // off unless turned on (going quiet is dull)
    const sc = env.peek?.('scene');
    if (p.quiet && (sc ? sc.day * 24 + (sc.hrs ?? 0) : env.last ?? 0) < p.quiet.until) return { why: p.quiet.why || '잠수' };
    if (sc && ['night', 'midnight'].includes(sc.tod) && !(sc.with ?? []).includes(who)) return { why: '자는 시간', sleep: true };
    return null;
}
const nowMark = (env) => { const sc = env.peek?.('scene'); return sc ? sc.day * 24 + (sc.hrs ?? 0) : env.last ?? 0; };
const TAG = /[\[(【]\s*(읽씹|안\s*읽음|잠수|선물|송금|약속|위치|사진|영상|입력\s*중|스크린샷|캡처|차단\s*해제|차단|꺼짐|서비스\s*불가|yes|no)\s*[:：]?\s*([^\])】\n]*)[\])】]/gi;
// Reply text -> { lines, seen (left on read), unread, quiet: { why, hours }, gift, money, answer: 'yes'|'no'|'' }
function parseReply(raw) {
    const o = { lines: [], seen: false, unread: false, quiet: null, gift: '', money: 0, answer: '', promise: '', place: '', media: [], typed: false, shot: false, block: '', off: null };
    const s = String(raw ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
    for (const m of s.matchAll(TAG)) {
        const k = m[1].replace(/\s/g, '').toLowerCase(), v = m[2].trim();
        if (k === '읽씹') o.seen = true; else if (k === '안읽음') o.unread = true;
        else if (k === '잠수') { const [why, h] = v.split('|').map((x) => x.trim()); o.quiet = { why: clip(why, 30), hours: Math.max(1, Math.min(12, +String(h ?? '').replace(/\D/g, '') || 3)) }; }
        else if (k === '선물') o.gift = clip(v, 40); else if (k === '송금') o.money = Math.max(0, +v.replace(/[^\d]/g, '') || 0);
        else if (k === '입력중') o.typed = true; else if (k === '스크린샷' || k === '캡처') o.shot = true;
        else if (k === '차단해제') o.block = 'off'; else if (k === '차단') o.block = 'on';
        else if (k === '꺼짐' || k === '서비스불가') { const [why, h] = v.split('|').map((x) => x.trim()); o.off = { why: why || (k === '꺼짐' ? '전화가 꺼져 있어요' : '서비스 지역이 아니에요'), hours: Math.max(1, Math.min(24, +String(h ?? '').replace(/\D/g, '') || 3)) }; }
        else if (k === '약속') o.promise = v; else if (k === '위치') o.place = v;
        else if (k === '사진' || k === '영상') { if (v) o.media.push({ kind: k, v }); }
        else if (k === 'yes' || k === 'no') o.answer = k;
    }
    o.lines = s.replace(TAG, '').split('\n').map((l) => l.replace(/^["“]|["”]$/g, '').replace(/^[^:\n]{1,20}:\s*/, '').trim()).filter(Boolean);
    return o;
}
const ASK_TEXT = { confess: '있잖아… 나 너 좋아해. 우리 사귈래?', propose: '나랑… 결혼해 줄래?' };
const LOVER = /lover|couple|dating|engaged|married|연인|애인|사귀|약혼|부부/i, WED = /married|부부/i;

export default {
    _t: { memory, awayOf, parseReply },   // for tests only; not part of the app contract
    api: 1, id: 'contacts', chat: true, name: '연락', icon: '📞', color: '#34c759', cost: 'tap',
    desc: '이야기 속 인물에게 문자를 보내고 답장을 받아요. 주고받은 문자는 다음 답에 한 번 알려 줘요.',
    // Told to the main model once, by the next reply, then spent.
    note(_s, env) {
        const st = env.store, f = plain(st, 'fresh', env), now = [];
        if (f && st.tell !== false) now.push(f.letter ? `A letter from ${f.who} has reached ${env.user}: "${clip(f.them, 300)}". ${env.user} has read it.` : `Since the last reply, ${env.user} and ${f.who} exchanged text messages. ${env.user}: "${clip(f.me, 200)}" — ${f.who}: "${clip(f.them, 300)}". The characters know this happened.`);
        // letters that arrived with the story's days (no call: the reply was written when it was sent, and waits)
        const day = env.peek?.('scene')?.day;
        for (const [who, L] of Object.entries(st.threads ?? {})) for (const m of L) if (m.letter && !m.me && (!m.told || (isReroll(env) && typeof m.told === 'number' && sameReply(m.told, env))) && day != null && day >= m.arrive && st.tell !== false) now.push(`A letter from ${who} has arrived for ${env.user} today. It says: "${clip(m.text, 300)}".`);
        return now.length ? { now: now.slice(0, 2) } : null;
    },
    onReply(env) {
        const st = env.store, day = env.peek?.('scene')?.day;
        let ch = false;
        if (spendPlain(st, 'fresh', env)) ch = true;
        for (const L of Object.values(st.threads ?? {})) for (const m of L) if (m.letter && !m.me && !m.told && day != null && day >= m.arrive) { m.told = env.last ?? true; ch = true; }   // the reply it was told in (a reroll of it hears it again)
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
                <button class="mbx-row" data-act="group"><span class="mb4-face mbx-gface">💬</span><span class="mbx-row-t"><b>단체방${groupOn ? '' : ' <i>꺼짐</i>'}</b><small>${groupOn ? (gl ? `${esc(gl.who ?? '')}: ${esc(clip(one(String(gl.t ?? '')), 60))}` : '아직 대화가 없어요') : '누르면 켤 수 있어요'}</small></span></button>
                ${(() => { const at = Number(env.peekStore?.('heart')?.showAt) || k.SHOW_AT, sp = k.byHeart(known, env.peek('heart'), env.user, env.peek('scene')?.with ?? [], at, (n) => (T[n] ?? []).length > 0); return sp ? k.foldUnder(sp.shown.map(row), sp.rest.map(row), at) : k.foldRest(known.map(row)); })()}</div>
                ${known.length ? '' : k.hint('이야기에 인물이 나오면 여기 떠요. ⋯에서 직접 더할 수도 있어요.')}
                ${st._panel === 'new' ? `<div class="mb4-btnrow"><input class="mb4-input" data-f="new" maxlength="40" placeholder="누구에게 보낼까요"><button class="mb4-btn ghost" data-act="add">추가</button></div>` : ''}
                ${st._panel === 'cfg' ? settings() : ''}`;
            api.menu([
                { icon: '＋', label: '새 대화', sub: '목록에 없는 사람에게', act: () => { st._panel = st._panel === 'new' ? '' : 'new'; api.redraw(); setTimeout(() => el.querySelector('[data-f="new"]')?.focus(), 0); } },
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
        const W = env.peek('wallet'), unit = env.peekStore?.('wallet')?.unit ?? '';
        // 👤 the person on the other end, in one line (opens for more): what other apps already keep about them
        const lk = env.peek('look')?.who?.[who], hd = env.peek('heart')?.d?.[`${who}>${env.user}`], pp = env.peek('people')?.list?.[who];
        const profTop = [hd ? `💗 ${hd.a} · 🤝 ${hd.t}` : '', bond?.tie ? `💞 ${esc(bond.tie)}` : '', (env.peek('scene')?.with ?? []).includes(who) ? '👀 같이 있음' : '', lk?.carry?.length ? `🎒 ${lk.carry.length}` : ''].filter(Boolean).join(' · ');
        const profRows = [pp?.about ? ['👥', esc(pp.about)] : null, lk?.wear ? ['👕', esc(lk.wear)] : null, lk?.carry?.length ? ['🎒', lk.carry.map(esc).join(', ')] : null, lk?.body ? ['🩹', esc(lk.body)] : null, hd ? ['💗', `애정 ${hd.a} · 신뢰 ${hd.t}${hd.j >= 30 ? ' · 🔥 질투' : ''}`] : null, bond ? ['💞', [bond.tie, `가까움 ${bond.lvl ?? 0}/5`].filter(Boolean).map(esc).join(' · ')] : null].filter(Boolean);
        const prof = profRows.length ? `<details class="mbx-prof"><summary>${profTop || '👤 정보'}</summary>${profRows.map(([ic, t]) => `<div><span>${ic}</span><span>${t}</span></div>`).join('')}</details>` : '';
        const idx = L.map((m, i) => [m, i]).filter(([m]) => visible(m)).slice(-30);
        const waiting = L.some((m) => m.me && m.wait);
        const coming = L.filter((m) => m.letter && !m.me && day != null && day < m.arrive);
        const panel = st._panel === 'sum' ? k.card('🧠 한 줄 요약', `<textarea class="mb4-input" rows="2" data-f="sum" placeholder="오래된 일도 기억하게 한 줄로 적어 두세요">${esc(P.sum ?? '')}</textarea><div class="mb4-btnrow"><button class="mb4-btn sm" data-act="sumSave">저장</button><button class="mb4-btn ghost sm" data-act="sum" ${L.length < 6 ? 'disabled' : ''}>🪄 AI로 요약 (1회)</button><button class="mb4-btn ghost sm" data-act="panel" data-v="">닫기</button></div>`)
            : st._panel === 'gift' ? k.card('🎁 무엇을 줄까요?', (W?.items ?? []).length ? `<div class="mb4-chips">${W.items.map((x) => { const n = typeof x === 'string' ? x : x?.name; return n ? `<button class="mb4-opt" data-act="gift" data-v="${esc(n)}">${esc(n)}</button>` : ''; }).join('')}</div>` : k.hint('가방이 비었어요.'))
            : st._panel === 'att' ? `<div class="mbx-att">${[['pay', '💸', '송금'], ['gift', '🎁', '선물'], ['promise', '📌', '약속'], ['loc', '📍', '위치'], ['pic', '📷', '사진'], ['vid', '🎬', '영상']].map(([v, ic, n]) => `<button data-act="panel" data-v="${v}"><i>${ic}</i><small>${n}</small></button>`).join('')}</div>`
            : st._panel === 'pay' ? k.card('💸 송금', `${W ? `<p class="mb4-hint">내 돈: ${Number(W.cash ?? 0).toLocaleString('en-US')}${esc(unit)}</p>` : k.hint('💰 지갑이 꺼져 있으면 돈이 실제로 빠지지 않아요.')}<div class="mb4-btnrow"><input class="mb4-input" data-f="pay" inputmode="numeric" placeholder="얼마"><button class="mb4-btn" data-act="pay">보내기</button></div>`)
            : st._panel === 'promise' ? k.card('📌 약속', `<input class="mb4-input" data-f="prom" placeholder="무엇을 · 언제 (예: 금요일에 같이 장 보기)"><div class="mb4-btnrow"><button class="mb4-btn" data-act="prom" data-v="me">내가 할게</button><button class="mb4-btn ghost" data-act="prom" data-v="them">해 달라고</button></div>`)
            : st._panel === 'loc' ? k.card('📍 위치 보내기', `<div class="mb4-btnrow"><input class="mb4-input" data-f="loc" value="${esc(env.peek('scene')?.loc ?? '')}" placeholder="어디"><button class="mb4-btn" data-act="loc">보내기</button></div>`)
            : st._panel === 'pic' || st._panel === 'vid' ? k.card(st._panel === 'pic' ? '📷 사진 보내기' : '🎬 영상 보내기', `<textarea class="mb4-input" rows="2" data-f="media" placeholder="어떤 ${st._panel === 'pic' ? '사진' : '영상'}인지 글로 (예: 창밖 노을)"></textarea><div class="mb4-btnrow"><button class="mb4-btn" data-act="media" data-v="${st._panel}">보내기</button></div>`)
            : st._panel === 'rule' ? k.card(`📝 ${esc(who)}에게만 지시`, `<textarea class="mb4-input" rows="3" data-f="rule" placeholder="예: 존댓말로, 장난스럽게, 내 컨디션을 먼저 물어봐">${esc(P.rule ?? '')}</textarea><div class="mb4-btnrow"><button class="mb4-btn sm" data-act="ruleSave">저장</button><button class="mb4-btn ghost sm" data-act="panel" data-v="">닫기</button></div>`)
            : st._panel === 'cfg' ? settings() : '';
        el.innerHTML = `${prof}${P.sum ? `<button class="mbx-sum" data-act="panel" data-v="sum">🧠 ${esc(P.sum)}</button>` : ''}
            ${away ? `<div class="mbx-away">${away.sleep ? '😴 자는 시간이에요. 보내 두면 깬 뒤 「답장 받기」로 받아요.' : `💤 ${esc(away.why)} — 지금은 연락이 안 돼요.`}</div>` : ''}
            ${['sum', 'cfg', 'rule'].includes(st._panel) ? panel : ''}
            <div class="mbx-thread">${idx.map(([m]) => m.sys ? `<p class="mbx-sys">${esc(m.text)}</p>` : `<div class="mbx-b ${m.me ? 'me' : 'them'}">${m.fail ? '<em class="mbx-fail">!</em>' : ''}${m.me ? (m.wait && !m.read ? '<em class="mbx-one">1</em>' : '') : `<span class="mb4-face mbx-av">${k.face(who)}</span>`}<div class="mbx-bubble${m.letter ? ' letter' : ''}">${m.letter ? '✉️ ' : ''}${esc(m.text)}${m.att ? `<small>${esc(m.att)}</small>` : ''}</div></div>`).join('') || `<p class="mb4-hint mb4-center">${esc(who)}에게 첫 문자를 보내 보세요.</p>`}
                ${st._typing === who ? `<div class="mbx-b them"><span class="mb4-face mbx-av">${k.face(who)}</span><div class="mbx-bubble mbx-typing"><i></i><i></i><i></i></div></div>` : ''}
                ${P.blocked ? '<p class="mbx-sys">🚫 차단된 상태예요. 보내도 전해지지 않아요.</p>' : P.off && nowMark(env) < P.off.until ? `<p class="mbx-sys">📵 ${esc(P.off.why)}</p>` : ''}
                ${coming.length ? `<p class="mb4-hint mb4-center">✉️ 답장 편지가 오는 중 (${Math.min(...coming.map((m) => m.arrive)) - day}일 뒤)</p>` : ''}
                ${waiting && !away ? `<div class="mbx-retry"><span>${P.note === 'seen' ? '읽고 답이 없어요.' : P.note === 'unread' ? '아직 안 읽었어요.' : '아직 답장이 없어요.'}</span><button class="mb4-btn ghost sm" data-act="reply">답장 받기</button></div>` : ''}</div>
            ${['sum', 'cfg', 'rule'].includes(st._panel) ? '' : panel}<div class="mbx-dock"><button class="mb4-btn ghost mbx-plus${st._panel === 'att' ? ' on' : ''}" data-act="panel" data-v="att" aria-label="첨부">${st._panel === 'att' ? '✕' : '＋'}</button><textarea class="mb4-input mbx-in" data-f="msg" rows="1" placeholder="${away ? '보내 두면 깼을 때 답장해요' : '문자 보내기'}">${esc(st._draft?.[who] ?? '')}</textarea><button class="mb4-btn mbx-go" data-act="send">보내기</button></div>
            ${edit([...(P.sum != null ? [{ name: 'sum', i: 0, label: '🧠 한 줄 요약', value: P.sum, rows: 2 }] : []), ...idx.map(([m, i]) => ({ name: 'msg', i, label: `${m.me ? '나' : who}${m.letter ? ' · 편지' : ''}`, value: m.text, rows: 2 }))])}`;
        api.menu([
            { icon: '📨', label: '먼저 연락 오게', sub: 'AI 1회', disabled: !!P.dnd, act: () => run('first') },
            { icon: '✉️', label: '편지로 보내기', sub: day == null ? '🧭 장면이 켜져 있어야 날이 흘러요' : '입력창에 쓴 글을 편지로 · AI 1회', disabled: day == null, act: () => run('letter') },
            ...(W ? [{ icon: '🎁', label: '선물 보내기', sub: '가방에서 골라요', act: () => { st._panel = 'gift'; api.redraw(); } }] : []),
            ...(askKind ? [{ icon: askKind === 'confess' ? '💌' : '💍', label: askKind === 'confess' ? '문자로 고백하기' : '문자로 청혼하기', sub: 'AI 1회', act: () => run('ask', askKind) }] : []),
            { icon: P.dnd ? '🔔' : '🔕', label: P.dnd ? '방해 금지 풀기' : '방해 금지', sub: '켜면 먼저 연락하지 않아요', act: () => { P.dnd = !P.dnd; api.save(); api.redraw(); } },
            { icon: '🧠', label: '한 줄 요약', sub: P.sum ? '보기 · 고치기' : '적어 두면 오래된 일도 기억해요', act: () => { st._panel = 'sum'; api.redraw(); } },
            { icon: '📝', label: '이 사람에게만 지시', sub: P.rule ? P.rule : '말투 · 하지 말 것 · 챙길 것', act: () => { st._panel = 'rule'; api.redraw(); } },
            ...(P.blocked ? [{ icon: '✅', label: '차단이 풀렸어요', sub: '이야기 속에서 풀렸을 때', act: () => { delete P.blocked; api.save(); api.redraw(); } }] : []),
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
                <label class="mb4-sw"><span><b>연락이 끊길 때도 있게</b><small>밤엔 자고, 가끔 잠수도 타요</small></span><input type="checkbox" data-act="cut" ${cfg.cut === true ? 'checked' : ''}><i></i></label>
                <label class="mb4-label" style="margin:8px 0 6px">기억 분량</label><div class="mb4-seg">${[['short', '짧게'], ['mid', '보통'], ['long', '길게']].map(([v, n]) => `<button class="${(cfg.recall ?? 'mid') === v ? 'on' : ''}" data-act="recall" data-v="${v}">${n}</button>`).join('')}</div>
                <label class="mb4-label" style="margin:10px 0 6px">📝 문자 지시 (모든 사람)</label><textarea class="mb4-input" rows="3" data-f="crule" placeholder="예: 이모티콘 많이, 생리 중이면 챙겨 주기, 다정하게">${esc(cfg.rule ?? '')}</textarea><div class="mb4-btnrow"><button class="mb4-btn sm" data-act="cruleSave">저장</button></div>
                ${k.hint('보내기 · 답장 받기 · 먼저 연락 · 요약은 누를 때마다 AI를 1번 불러요. 그 밖엔 0이에요. 호감 · 생리 주기 · 다가오는 달력 일정은 켜져 있으면 저절로 알려 줘요.')}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="panel" data-v="">닫기</button></div>`);
        }
        var handlers;
        function wire() {
            const facts = () => api.facts() || '(nothing recorded)';
            const about = () => { const a = env.peek('people')?.list?.[st.who]?.about ?? ''; return a ? ` (${a})` : ''; };
            const w = st.who, PP = w ? per(st, w) : {};
            const bd = w ? Object.values(env.peek('bonds')?.pairs ?? {}).find((x) => (x.a === w && x.b === env.user) || (x.b === w && x.a === env.user)) : null;
            const PP_rule = (n) => String(per(st, n).rule ?? '').trim();
            const hdW = w ? env.peek('heart')?.d?.[`${w}>${user}`] : null, cal = env.peekStore?.('calendar') ?? {}, scD = env.peek('scene')?.day;
            const cyc = cal.cycle?.on && scD != null ? (() => { const c = cycleToday(cal, env.peek('scene')); return c ? `${user} is on their period (day ${c}).` : ''; })() : '';
            const soon = Array.isArray(cal.marks) && cal.start ? cal.marks.map((m) => ({ m, d: Math.round((Date.parse(`${m.date}T00:00:00Z`) - startMs(cal.start)) / 86400000) + 1 - (scD ?? 1) })).filter((x) => x.d >= 0 && x.d <= 7).map((x) => `${x.m.label} ${x.d === 0 ? 'today' : `in ${x.d} day(s)`}`) : [];
            const aware = [hdW ? `How ${w} feels about ${user} (0-100): affection ${hdW.a}, trust ${hdW.t}${hdW.j >= 30 ? ', jealous' : ''}. Let it show in the texts.` : '', cyc, soon.length ? `Dates coming up: ${soon.join('; ')}.` : '',
                cfg.rule ? `How texts should go (from ${user}): ${cfg.rule}` : '', w && PP_rule(w) ? `For ${w} in particular: ${PP_rule(w)}` : ''].filter(Boolean);
            const tone = (bd ? `\n[Where they stand]\nRelationship: ${bd.tie || 'not named yet'}; how close they have physically got so far: ${bd.lvl ?? 0} of 5. Keep the warmth of the texts at exactly that level.\n` : '') + (aware.length ? `\n[Also keep in mind]\n${aware.join('\n')}\n` : '');
            const story = () => clip(env.recent(1)[0] ?? '', 1500);
            const replyPrompt = (extra = '') => `[TASK] Do NOT continue the story and do not narrate. Write ONLY ${w}'s text-message reply to ${user}'s latest texts, as ${w}${about()} would type it on a phone right now.\n\n[What is known]\n${facts()}\n${PP.sum ? `Summary of their earlier texts: ${PP.sum}\n` : ''}\n[The story so far, latest part]\n${story()}\n\n[Texts, oldest first]\n${memory(w, user, T[w] ?? [], cfg.recall)}\n${tone}${extra}\nShort, like real texts: one text per line (usually 1 to 3), same language as the texts, no name tag, no quotes, no narration.${cfg.cut === true ? `\nOnly if the relationship is truly broken, ${w} may not answer: then output exactly [읽씹] or [안읽음] and nothing else.` : ''}${cfg.cut === true ? `\nIf ${w} will be unreachable for a while after this (going to sleep, working, upset), add a last line [잠수: short reason | hours 1-12].` : ''}\nIf ${w} sends ${user} a gift or money in this reply, add a last line [선물: item] or [송금: number]; without that line nothing arrives.\nIf ${w} makes a promise or plan with ${user}, add [약속: what, when]. If ${w} shares where they are, add [위치: place]. If ${w} sends a photo or a video, add [사진: what it shows] or [영상: what it shows] (described in words).\n\nStay consistent with ${w}'s own earlier texts in this chat: read them first. Keep the same mood unless ${user}'s latest text gives a clear reason to change it — no sudden mood swings out of nowhere. Never contradict or undo what ${w} just said (e.g. asking what ${user} is doing, then snapping «go to sleep», then asking «sleepy?»). Each text follows from the one before. Texting manners: a real back-and-forth. Never brush ${user} off: no «go to sleep», «I'm busy», «whatever», «forget it», «do what you want», «later» or one-word cold replies to get out of talking — even when ${w} is upset, ${w} stays and shows it with substance (says what is bothering them, teases, sulks, argues, asks back). When ${w} texts first, open with something specific (what they are doing, something they saw, a reason), not a bare «are you asleep? / what are you doing?». Do NOT nag, lecture, scold, threaten or give orders; do NOT announce coming over or tell ${user} to open the door / wait up; do NOT end, cut short or walk away from the conversation (no «go to sleep», «talk later», «I'm hanging up») unless ${user} ends it. Answer what ${user} said and leave room to keep talking.\nStatus tags, only when they truly happen: [입력중] (${w} started typing, then stopped and sent nothing), [스크린샷] (${w} screenshotted the chat), [차단] / [차단해제] (${w} blocks / unblocks ${user}), [꺼짐: why | hours] or [서비스불가: why | hours] (the phone cannot be reached).\nOutput only the messages and tags.`;
            const take = (raw, opts = {}) => {
                const r = parseReply(raw), mine = (T[w] ??= []).filter((m) => m.me && m.wait);
                for (const m of mine) { if (r.lines.length) delete m.wait; m.read = !r.unread; }
                PP.note = r.unread ? 'unread' : r.seen ? 'seen' : '';
                const sys = (t) => (T[w] ??= []).push({ me: false, sys: true, text: t });
                if (r.block === 'on') { PP.blocked = true; sys(`🚫 ${w}님이 차단했어요`); } else if (r.block === 'off') { delete PP.blocked; sys(`✅ ${w}님이 차단을 풀었어요`); }
                if (r.off) { PP.off = { why: r.off.why, until: nowMark(env) + (env.peek('scene') ? r.off.hours : r.off.hours * 2) }; sys(`📵 ${r.off.why}`); }
                if (r.typed) sys(`✍️ ${w}님이 입력하다 멈췄어요`);
                if (r.quiet) PP.quiet = { why: r.quiet.why, until: nowMark(env) + (env.peek('scene') ? r.quiet.hours : r.quiet.hours * 2) };
                if (!r.lines.length) { api.toast(r.unread ? '안 읽었어요.' : r.seen ? '읽고 답이 없어요.' : '답장을 받지 못했어요.'); return r; }
                for (const t of r.lines) T[w].push({ me: false, text: t, ...(opts.letter ? { letter: true, arrive: opts.arrive } : {}) });
                if (r.gift && api.fix('got', `${r.gift} | from ${w}`)) T[w].at(-1).att = `🎁 ${r.gift}`;
                if (r.money && api.fix('cash', `+${r.money} | ${w}에게 받음`)) T[w].at(-1).att = `💸 ${r.money}`;
                if (r.gift) api.fix('carry', `${w}=-${r.gift}`);   // it leaves their hands
                for (const x of r.media) T[w].push({ me: false, text: `${x.kind === '사진' ? '📷' : '🎬'} ${x.v}`, media: x.kind });
                if (r.place) T[w].push({ me: false, text: `📍 ${r.place}`, media: '위치' });
                if (r.promise) { T[w].push({ me: false, text: `📌 ${r.promise}`, media: '약속' }); api.fix('promise', `${w}>${user}=${r.promise}`); }
                if (r.shot) sys(`📸 ${w}님이 대화를 캡처했어요`);
                if (!opts.letter) st.fresh = { who: w, me: mine.map((m) => m.text).join(' / ') || '(texted first)', them: r.lines.join(' / ') };
                if (T[w].length > 200) T[w].splice(0, T[w].length - 200);
                bump(w);
                return r;
            };
            // 「입력 중…」 while the reply is being written
            const call = async (prompt) => { st._typing = w; api.redraw(); try { return await api.ask(prompt); } finally { st._typing = ''; } };
            const busy = (b, t) => { if (b) { b.disabled = true; b.textContent = t; } api.toast(t); };
            const msg = () => k.val(el, '[data-f="msg"]');
            const clear = () => { if (st._draft) delete st._draft[w]; };
            handlers = {
                open: (n) => { st.who = n; st._panel = ''; api.save(); api.redraw(); },
                group: () => api.go('page:contacts:group'),
                add: () => { const n = k.val(el, '[data-f="new"]'); if (n) { T[n] ??= []; bump(n); st.who = n; api.save(); api.redraw(); } },
                panel: (v) => { st._panel = st._panel === v ? '' : v; api.redraw(); },
                tell: (_v, c) => { st.tell = c.checked; api.save(); },
                cut: (_v, c) => { cfg.cut = c.checked; api.save(); api.redraw(); },
                recall: (v) => { cfg.recall = v; api.save(); api.redraw(); },
                sumSave: () => { const t = k.val(el, '[data-f="sum"]'); if (t) PP.sum = t; else delete PP.sum; st._panel = ''; api.save(); api.redraw(); },
                send: async (_v, b) => {
                    const text = msg(); if (!text || !w) return;
                    (T[w] ??= []).push({ me: true, text, wait: true }); clear(); bump(w);
                    if (PP.blocked || (PP.off && nowMark(env) < PP.off.until)) { T[w].at(-1).fail = true; delete T[w].at(-1).wait; api.toast(PP.blocked ? '차단돼서 보내지지 않았어요.' : PP.off.why); api.save(); api.redraw(); return; }
                    const aw = awayOf(env, w, PP);
                    if (aw) { api.toast(aw.sleep ? '자는 중이에요. 깨면 답장해요.' : `${aw.why} 중이에요.`); api.save(); api.redraw(); return; }
                    api.save(); api.redraw(); busy(null, '답장 기다리는 중…');
                    take(await call(replyPrompt()));
                    api.save(); api.redraw();
                },
                reply: async (_v, b) => { busy(b, '받는 중…'); take(await call(replyPrompt())); api.save(); api.redraw(); },
                first: async () => {
                    busy(null, `${w}의 연락을 기다리는 중…`);
                    const raw = await call(`[TASK] Do NOT continue the story and do not narrate. ${w}${about()} texts ${user} first, unprompted, right now. Write ONLY that text message, fitting ${w} and the moment.\n\n[What is known]\n${facts()}\n\n[The story so far, latest part]\n${story()}\n\n[Earlier texts]\n${memory(w, user, T[w] ?? [], cfg.recall) || '(none)'}\n${tone}\nStay consistent with ${w}'s own earlier texts in this chat: read them first. Keep the same mood unless ${user}'s latest text gives a clear reason to change it — no sudden mood swings out of nowhere. Never contradict or undo what ${w} just said (e.g. asking what ${user} is doing, then snapping «go to sleep», then asking «sleepy?»). Each text follows from the one before. Texting manners: a real back-and-forth. Never brush ${user} off: no «go to sleep», «I'm busy», «whatever», «forget it», «do what you want», «later» or one-word cold replies to get out of talking — even when ${w} is upset, ${w} stays and shows it with substance (says what is bothering them, teases, sulks, argues, asks back). When ${w} texts first, open with something specific (what they are doing, something they saw, a reason), not a bare «are you asleep? / what are you doing?». Do NOT nag, lecture, scold, threaten or give orders; do NOT announce coming over or tell ${user} to open the door / wait up; do NOT end, cut short or walk away from the conversation (no «go to sleep», «talk later», «I'm hanging up») unless ${user} ends it. Answer what ${user} said and leave room to keep talking.\nShort, one text per line (usually 1 to 3), in the language of the story. Output only the messages.`, 250);
                    take(raw); api.save(); api.redraw();
                },
                letter: async () => {
                    const text = msg(); if (!text || day == null) { api.toast('입력창에 편지에 쓸 말을 먼저 적어 주세요.'); return; }
                    const days = Math.max(1, Math.min(14, +(cfg.letterDays ?? 3)));
                    (T[w] ??= []).push({ me: true, text, letter: true }); clear();
                    busy(null, '부치는 중…');
                    const raw = await api.ask(`[TASK] Do NOT continue the story. ${user} sent ${w}${about()} a letter. Write ONLY ${w}'s reply letter, as ${w} would write it by hand: a few warm or fitting sentences, the same language as ${user}'s letter, no narration.\n\n[What is known]\n${facts()}\n\n[${user}'s letter]\n${text}\n\nOutput only the letter.`, 500);
                    const r = parseReply(raw);
                    if (r.lines.length) { T[w].push({ me: false, text: String(raw).replace(TAG, '').trim(), letter: true, arrive: day + days * 2 }); api.toast(`부쳤어요. 답장은 이야기 속 약 ${days * 2}일 뒤 도착해요.`); }
                    else api.toast('답장을 받지 못했어요.');
                    api.save(); api.redraw();
                },
                ruleSave: () => { const t = k.val(el, '[data-f="rule"]'); if (t) PP.rule = t; else delete PP.rule; st._panel = ''; api.save(); api.redraw(); },
                cruleSave: () => { const t = k.val(el, '[data-f="crule"]'); if (t) cfg.rule = t; else delete cfg.rule; api.toast('저장했어요.'); api.save(); },
                pay: () => {
                    const n = Math.round(+String(k.val(el, '[data-f="pay"]')).replace(/[^\d]/g, '')); if (!n) return;
                    if (W && n > (W.cash ?? 0)) { api.toast('돈이 모자라요.'); return; }
                    if (W && !api.fix('cash', `-${n} | ${w}에게 송금`)) return;
                    (T[w] ??= []).push({ me: true, text: `💸 ${n.toLocaleString('en-US')}${unit} 보냄`, media: '송금', wait: true }); st._panel = ''; api.save(); api.redraw();
                },
                prom: (who2) => {
                    const t = k.val(el, '[data-f="prom"]'); if (!t) return;
                    api.fix('promise', who2 === 'me' ? `${user}>${w}=${t}` : `${w}>${user}=${t}`);
                    (T[w] ??= []).push({ me: true, text: `📌 ${who2 === 'me' ? '내가 할게' : '해 줘'}: ${t}`, media: '약속', wait: true }); st._panel = ''; api.save(); api.redraw();
                },
                loc: () => { const t = k.val(el, '[data-f="loc"]'); if (!t) return; (T[w] ??= []).push({ me: true, text: `📍 ${t}`, media: '위치', wait: true }); st._panel = ''; api.save(); api.redraw(); },
                media: (kind) => { const t = k.val(el, '[data-f="media"]'); if (!t) return; (T[w] ??= []).push({ me: true, text: `${kind === 'pic' ? '📷 (사진)' : '🎬 (영상)'} ${t}`, media: kind === 'pic' ? '사진' : '영상', wait: true }); st._panel = ''; api.save(); api.redraw(); },
                gift: (name) => {
                    if (name && api.fix('lost', name)) { api.fix('carry', `${w}=${name}`); (T[w] ??= []).push({ me: true, text: `🎁 ${name}`, att: '선물', wait: true }); st._panel = ''; api.toast(`${name}을(를) 보냈어요. 「답장 받기」를 눌러요.`); api.save(); api.redraw(); }
                },
                ask: async (kind) => {
                    busy(null, '보내는 중…');
                    (T[w] ??= []).push({ me: true, text: ASK_TEXT[kind], wait: true });
                    const r = take(await call(replyPrompt(`${user} just ${kind === 'confess' ? 'confessed their feelings and asked to date' : 'proposed marriage'}. ${w} answers honestly, as ${w} feels right now. Add a last line [yes] if ${w} accepts or [no] if ${w} turns it down.`), 300));
                    if (r.answer === 'yes' && api.fix('tie', `${user}-${w}=${kind === 'confess' ? 'lovers' : 'engaged'}`)) api.toast(kind === 'confess' ? `💗 ${w}와(과) 연인이 됐어요` : `💍 ${w}와(과) 약혼했어요`);
                    else if (r.answer === 'no') api.toast(`${w}이(가) 거절했어요.`);
                    api.save(); api.redraw();
                },
                sum: async (_v, b) => {
                    busy(b, '요약 중…');
                    const raw = await api.ask(`[TASK] Do NOT continue the story. Summarize what ${user} and ${w} have talked about by text so far in ONE short Korean line (under 120 characters): key facts, plans, promises, mood. Output only that line.\n${PP.sum ? `Previous summary: ${PP.sum}\n` : ''}Texts (oldest first):\n${(T[w] ?? []).slice(-60).map((m) => `${m.me ? user : w}: ${one(m.text)}`).join('\n')}`, 200);
                    if (raw) PP.sum = one(raw);
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
.mbx-dock{position:sticky;bottom:-26px;display:flex;align-items:flex-end;gap:8px;margin:0 -16px;padding:8px 16px 12px;background:var(--glass);-webkit-backdrop-filter:blur(22px) saturate(1.6);backdrop-filter:blur(22px) saturate(1.6);border-top:.5px solid var(--line);z-index:2}.mb4-phone .mbx-in{flex:1;margin:0;min-height:38px;max-height:120px;resize:none;border-radius:19px!important;field-sizing:content}.mbx-go{border-radius:19px!important;min-height:38px}.mbx-plus{flex:none;width:40px;height:40px;padding:0;border-radius:50%;font-size:20px;line-height:1}.mbx-att{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:0 0 8px}.mbx-att button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0;border:0;border-radius:14px;background:var(--fill);color:inherit;font:inherit;cursor:pointer}.mbx-att i{font-style:normal;font-size:20px}.mbx-att small{font-size:11px;color:var(--sub)}.mbx-prof{margin:0 0 8px;padding:8px 12px;border-radius:12px;background:var(--fill);font-size:13px}.mbx-prof summary{cursor:pointer;color:var(--sub);list-style:none}.mbx-prof summary::-webkit-details-marker{display:none}.mbx-prof div{display:flex;gap:8px;margin-top:6px}.mbx-prof div span:first-child{flex:none}.mbx-sys{align-self:center;margin:4px auto;padding:3px 10px;border-radius:10px;background:var(--fill);font-size:12px;color:var(--sub);text-align:center;width:fit-content;max-width:90%}.mbx-fail{font-style:normal;font-weight:800;color:#ff3b30;margin-right:2px}.mbx-typing{display:flex;gap:4px;padding:12px 14px}.mbx-typing i{width:7px;height:7px;border-radius:50%;background:var(--sub);opacity:.4;animation:mbxdot 1.2s infinite}.mbx-typing i:nth-child(2){animation-delay:.2s}.mbx-typing i:nth-child(3){animation-delay:.4s}@keyframes mbxdot{0%,60%,100%{opacity:.25;transform:none}30%{opacity:.9;transform:translateY(-3px)}}`,
};
