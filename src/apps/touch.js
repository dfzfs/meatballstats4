// 💌 A lover's touch: the ONE character who is the user's lover (or more) now and then secretly messes with the phone —
// renames themself in 📞 contacts, writes something on 📅 the calendar, sticks a note on the home screen, renames the
// phone. Decided in code (no reader key, no model call). The other screens read these marks (read-only) and show them.
// With «AI도 알게» on, the main model gets ONE line, once, so the lover can act on it; caught = one more line, once.
import { clip } from '../core/text.js';
import { esc, card, hint, acts, empty, pill, face, optList, optCard, optWire } from '../ui/kit.js';

const LOVER = /lover|couple|dating|engaged|married|연인|애인|사귀|약혼|부부/i, BREAK = /broke|ex-|former|separated|헤어|이별|파혼/i;
// Korean particles after a name: 이랑/랑, 이/가
const jong = (n) => { const c = String(n).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false; };
const fill = (t, n) => t.replace(/\{n\}이랑/g, `${n}${jong(n) ? '이랑' : '랑'}`).replace(/\{n\}이 /g, `${n}${jong(n) ? '이' : '가'} `).replace(/\{n\}/g, n);
const KINDS = {
    rename: { icon: '📞', name: '연락처 이름 바꾸기', say: (t) => `renamed themself in the user's phone contacts to "${t}"`,
        T: ['💕자기', '내꺼', '♡{n}♡', '우리 {n}', '세상에서 제일 소중한 사람', '{n} (남의 거 아님)', '최애', '밥 같이 먹을 사람', '보고 싶은 사람 1순위'] },
    cal: { icon: '📅', name: '달력에 몰래 쓰기', say: (t, d) => `wrote "${t}" on the user's phone calendar for story day ${d}`,
        T: ['{n}이랑 데이트 💕', '기념일 (잊으면 혼남)', '{n} 보고 싶은 날', '아무 날 아님. 그냥 표시함 ㅎ', '손잡는 날', '둘이 맛있는 거 먹는 날', '{n}한테 잘해 주는 날', '비밀 ♡'] },
    note: { icon: '📝', name: '홈 화면에 쪽지', say: (t) => `left a note on the user's phone home screen: "${t}"`,
        T: ['밥 챙겨 먹어. — {n}', '폰 비번 바꿨어. 농담 ㅋ — {n}', '보고 싶어서 몰래 썼어 — {n}', '오늘도 수고했어 ♡ — {n}', '이거 보면 바로 연락해 — {n}', '나 생각했지? — {n}'] },
    money: { icon: '💰', name: '지갑에 돈 넣어 두기', need: 'wallet', say: (t) => `slipped money into the user's wallet (${t})`, T: [''] },
    item: { icon: '🎁', name: '가방에 물건 넣어 두기', need: 'wallet', say: (t) => `slipped "${t}" into the user's bag`,
        T: ['손수건', '사탕 한 봉지', '머리끈', '핫팩', '둘이 찍은 사진', '작은 쪽지', '{n}의 겉옷', '반지 모양 젤리', '좋아하는 과자'] },
    promise: { icon: '📌', name: '약속 몰래 추가', need: 'todo', say: (t) => `quietly added a promise to the user's to-do list: "${t}"`,
        T: ['{n}이랑 밥 먹기', '{n}한테 먼저 연락하기', '{n}이랑 산책하기', '{n} 기다리게 하지 않기'] },
    title: { icon: '📱', name: '폰 이름 바꾸기', say: (t) => `renamed the user's phone to "${t}"`,
        T: ['{n}의 폰', '♡ {n} 전용', '{n} 생각 중', '{n} 꺼'] },
};
const D_T = Object.fromEntries(Object.entries(KINDS).filter(([, x]) => x.T.length > 1).map(([k, x]) => [k, x.T.map((t, i) => ({ id: `t${i}`, icon: '', name: t, ai: '' }))]));
// the phrases for one kind: the built-ins (edited / hidden) and the person's own; {n} = the lover's name
const phrases = (cfg, k) => { if (!D_T[k]) return KINDS[k].T; const L = optList(cfg, `t_${k}`, D_T[k]).map((x) => x.name).filter(Boolean); return L.length ? L : KINDS[k].T; };
const RATES = [[0.05, '드물게'], [0.1, '가끔'], [0.2, '자주']];
const COOL = 4;   // at least this many replies between two pranks

export function lovers(env) {
    const me = env.user;
    return Object.values(env.peek?.('bonds')?.pairs ?? {}).filter((p) => (p.a === me || p.b === me) && LOVER.test(p.tie ?? '') && !BREAK.test(p.tie ?? '')).map((p) => (p.a === me ? p.b : p.a));
}
const whoOf = (env) => { const L = lovers(env); return L.includes(env.store.who) ? env.store.who : L[0] ?? ''; };
const kindsOn = (env) => Object.keys(KINDS).filter((k) => env.cfg.kinds?.[k] !== false && (!KINDS[k].need || !!env.peek?.(KINDS[k].need)));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
// Do one prank now (code only). -> the log item or null
export function prank(env, kind = '') {
    const who = whoOf(env), st = env.store; if (!who) return null;
    const k = kind || rnd(kindsOn(env)); if (!KINDS[k]) return null;
    const day = env.peek?.('scene')?.day ?? null;
    let t = fill(rnd(phrases(env.cfg, k)), who);
    if (k === 'money') { const cash = Number(env.peek?.('wallet')?.cash) || 0, n = Math.max(10, Math.round((cash > 0 ? cash * (0.05 + Math.random() * 0.1) : 10 + Math.random() * 40) / 10) * 10); t = `+${n}`; }
    const item = { k, who, t, day, at: Date.now(), seen: false };
    // money, things and promises go through the owner app's own record, so its totals stay right and it shows there (💌)
    if (k === 'money' && !env.fix?.('cash', `${t} | 💌 ${who}이(가) 몰래 넣어 둠`)) return null;
    if (k === 'item' && !env.fix?.('got', `${t} | from ${who}`)) return null;
    if (k === 'promise') { const me = env.user || '나'; if (!env.fix?.('promise', `${me}>${who}=${t} 💌`)) return null; }
    if (k === 'rename') (st.names ??= {})[who] = t;
    else if (k === 'cal') { item.on = (day ?? 1) + 1 + Math.floor(Math.random() * 10); (st.cal ??= []).push({ day: item.on, text: t, who }); if (st.cal.length > 12) st.cal.shift(); }
    else if (k === 'note') st.note = { text: t, who };
    else if (k === 'title') st.title = t;
    (st.log ??= []).push(item); if (st.log.length > 30) st.log.shift();
    st.fresh = item; st.since = 0;
    return item;
}

export default {
    api: 1, id: 'touch', name: '연인의 손길', icon: '💌', color: '#ff5d8f', cost: 'zero',
    desc: '연인(한 명만)이 가끔 내 폰을 몰래 만져요. 연락처 이름 · 달력 · 홈 쪽지 · 폰 이름 · 지갑에 돈 · 가방에 물건 · 약속 추가. AI를 부르지 않아요.',
    note(_S, env) {
        const st = env.store, now = [], user = env.user || 'the user';
        if (st.caught && st.caught.at2 === env.last) now.push(`${user} has just found what ${st.caught.who} secretly did on their phone (${st.caught.who} ${KINDS[st.caught.k].say(st.caught.t, st.caught.on)}). Let ${st.caught.who} react to being caught, in character.`);
        else if (st.fresh && env.cfg.tell !== false) now.push(`Off the page, ${st.fresh.who} secretly ${KINDS[st.fresh.k].say(st.fresh.t, st.fresh.on)}. ${st.fresh.who} knows; ${user} may not have noticed yet. ${st.fresh.who} may act a little pleased with themself or wait to see if ${user} notices — a hint at most, never explained.`);
        return now.length ? { now } : null;
    },
    onReply(env) {
        const st = env.store, again = env.gen === 'swipe' || env.gen === 'regenerate';
        let ch = false;
        if (again) return false;
        if (st.fresh) { st.fresh = null; ch = true; }
        if (st.caught && (env.last ?? 0) > st.caught.at2) { st.caught = null; ch = true; }
        if (env.cfg.on === false || !whoOf(env) || !kindsOn(env).length) return ch;
        st.since = (st.since ?? COOL) + 1;
        const p = Number(env.cfg.rate) || 0.1;
        if (st.since > COOL && Math.random() < p) { prank(env); ch = true; }
        return ch;
    },
    hud: (_s, env) => ((env.store.log ?? []).some((x) => !x.seen) ? ['💌 몰래'] : []),
    widget(_s, env) { const x = (env.store.log ?? []).filter((y) => !y.seen).at(-1); return x ? `<div class="mb4-row"><span class="mb4-row-k">${KINDS[x.k].icon} ${esc(x.who)}</span><span class="mb4-row-v">${esc(clip(x.t, 40))}</span></div>` : ''; },
    widgetTitle: '누가 폰을 만졌어요',
    render(el, api) {
        const st = api.store, cfg = api.cfg, env = api.env, L = lovers(env), who = whoOf(env);
        cfg.kinds = cfg.kinds && typeof cfg.kinds === 'object' ? cfg.kinds : {};
        const log = (st.log ?? []).slice().reverse();
        for (const x of st.log ?? []) x.seen = true;   // opening this screen = noticed
        el.innerHTML = `${!env.peek('bonds') ? card('', '💞 관계를 켜야 누가 연인인지 알 수 있어요.', 'warn') : ''}
        ${who ? `<div class="mb4-hero mb4-center"><div class="mb4-hero-n">${face(who)}</div><div class="mb4-big">${esc(who)}</div><small>이 사람만 내 폰을 만져요</small></div>` : empty('💌', '아직 연인이 없어요', '💞 관계에서 연인 · 약혼 · 부부가 되면 시작돼요')}
        ${L.length > 1 ? card('누구로 할까요 (한 명만)', `<div class="mb4-chips">${L.map((n) => `<button class="mb4-opt${n === who ? ' on' : ''}" data-act="who" data-v="${esc(n)}">${face(n)} ${esc(n)}</button>`).join('')}</div>`) : ''}
        ${log.length ? card('몰래 한 것', log.slice(0, 12).map((x, n) => `<div class="mb4-row"><span class="mb4-row-k">${KINDS[x.k].icon}${x.day ? ` <small>${x.day}일째</small>` : ''}</span><span class="mb4-row-v">${esc(x.t)}${x.on ? ` <small>(${x.on}일째에)</small>` : ''}${x.undone ? ` ${pill('되돌림')}` : ''}${x.caught ? ` ${pill('들킴', 'love')}` : ''}</span></div>
            ${n === 0 && !x.undone ? `<div class="mb4-btnrow tight"><button class="mb4-btn ghost sm" data-act="caught" data-v="${(st.log ?? []).length - 1}" ${x.caught ? 'disabled' : ''}>😳 들켰다고 하기</button><button class="mb4-btn ghost sm" data-act="undo" data-v="${(st.log ?? []).length - 1}">↩ 되돌리기</button></div>` : ''}`).join('')) : ''}
        ${card('설정', `<label class="mb4-sw"><span><b>켜기</b></span><input type="checkbox" data-act="on" ${cfg.on !== false ? 'checked' : ''}><i></i></label>
            <div class="mb4-btnrow tight">${RATES.map(([v, n]) => `<button class="mb4-btn ${(Number(cfg.rate) || 0.1) === v ? '' : 'ghost '}sm" data-act="rate" data-v="${v}">${n}</button>`).join('')}</div>
            ${Object.entries(KINDS).map(([k, x]) => `<label class="mb4-sw"><span><b>${x.icon} ${x.name}</b></span><input type="checkbox" data-act="kind" data-v="${k}" ${cfg.kinds[k] !== false ? 'checked' : ''}><i></i></label>`).join('')}
            <label class="mb4-sw"><span><b>AI도 알게</b><small>몰래 한 걸 다음 답에서 연인이 한 번 알아요 (한 줄)</small></span><input type="checkbox" data-act="tell" ${cfg.tell !== false ? 'checked' : ''}><i></i></label>
            <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="now" ${who ? '' : 'disabled'}>💌 지금 한 번 해 보기</button></div>`)}
        <details class="mb4-card mb4-edcard"><summary>✏️ 몰래 하는 말 고치기 · 더하기 <small>{n} 자리에 연인 이름이 들어가요</small></summary>${Object.keys(D_T).map((k) => optCard(cfg, `t_${k}`, D_T[k], { title: `${KINDS[k].icon} ${KINDS[k].name}`, fields: ['name'] })).join('')}</details>
        ${hint('답이 올 때 코드가 가끔 주사위를 굴려 정해요(연달아 하지 않게 4답은 쉬어요). 바뀐 건 📞 연락 · 📅 달력 · 💰 지갑 · 📌 약속 · 홈 화면에 실제로 보이고, 💌 표시가 붙어요. 💰 · 🎁 · 📌은 그 앱이 켜져 있을 때만 해요.')}`;
        api.save();
        optWire(el, cfg, () => { api.save(); api.redraw(); });
        acts(el, {
            who: (n) => { st.who = n; api.save(); api.redraw(); },
            on: (_v, b) => { cfg.on = b.checked; api.save(); },
            rate: (v) => { cfg.rate = +v; api.save(); api.redraw(); },
            kind: (k, b) => { cfg.kinds[k] = b.checked; api.save(); },
            tell: (_v, b) => { cfg.tell = b.checked; api.save(); },
            now: () => { const x = prank(env); if (x) { x.seen = true; api.save(); api.redraw(); api.toast(`${KINDS[x.k].icon} ${x.t}`); } },
            caught: (i) => { const x = st.log[+i]; if (!x) return; x.caught = true; st.caught = { ...x, at2: env.last ?? 0 }; st.fresh = null; api.save(); api.redraw(); api.toast('😳 다음 답에서 반응해요.'); },
            undo: (i) => {
                const x = st.log[+i]; if (!x) return;
                if (x.k === 'rename' && st.names) delete st.names[x.who];
                else if (x.k === 'cal') st.cal = (st.cal ?? []).filter((c) => !(c.day === x.on && c.text === x.t));
                else if (x.k === 'note') st.note = null;
                else if (x.k === 'title') st.title = '';
                else if (x.k === 'money') api.fix('cash', `-${String(x.t).replace(/\D/g, '')} | 💌 되돌림`);
                else if (x.k === 'item') api.fix('lost', x.t);
                else if (x.k === 'promise') api.fix('done', `${env.user || '나'}>${x.who}=${x.t} 💌 — cancelled`);
                x.undone = true; if (st.fresh?.at === x.at) st.fresh = null; api.save(); api.redraw();
            },
        });
    },
};
