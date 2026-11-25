// 📒 Record: what was written down for each reply, newest first. Reads the shared ledger only: no key, no call
// (re-reading one reply is a call the person asks for by tapping).
// Ported from the third generation's ledger view and report, and the second generation's chip check and doctor:
// per reply "how it was judged" (kept lines with their quotes, dropped lines with the reason, hand corrections, which
// apps were listening), a self-check screen, and one copyable report with every secret masked.
import { cleanText, clip } from '../core/text.js';
import { esc, card, empty, hint, acts, pill } from '../ui/kit.js';

const WHY = { 'key-off': '그 키의 앱이 꺼져 있었음', 'no-quote': '인용이 답에 없음', 'app-refused': '앱이 받지 않음 (형식 · 범위)', form: '형식이 틀림', empty: '값이 비어 있음' };
const FAIL = { empty: '빈 대답', garbled: '깨진 대답', nokeys: '알아볼 줄이 없음' };
const SRC = { fill: '한 번에 읽기', gap: '모아 읽기', v3: '3세대에서 옮김', v2: '2세대에서 옮김', v1: '1세대에서 옮김' };

// Self-check rows: [{ lv: 'good'|'mid'|'bad', title, sub }] — what the second generation's doctor looked at, for this build.
export function checkRows(st, log) {
    const R = [], add = (lv, title, sub) => R.push({ lv, title, sub });
    add(st.paused ? 'mid' : 'good', st.paused ? '멈춤' : '켜짐', st.paused ? '지금은 쪽지도 읽기도 쉬어요' : `앱 ${st.apps.length}개가 켜져 있어요`);
    add(st.keys.length ? 'good' : 'mid', '답 읽기', st.keys.length ? `답마다 1번 읽어요 · 키 ${st.keys.length}개` : '읽을 키가 있는 앱이 없어요 (AI 호출 0)');
    const recent = log.slice(-12), read = recent.filter((e) => e.read), fail = recent.filter((e) => e.fail).length;
    if (recent.length) add(fail >= 3 ? 'bad' : fail ? 'mid' : 'good', '최근 12답', `읽음 ${read.length - fail} · 못 읽음 ${fail} · 아직 ${recent.length - read.length}`);
    if (st.unread > 3) add('mid', '안 읽은 답', `${st.unread}개 · 📒 맨 위 「한 번에 읽기」를 쓰면 3개씩 읽어요`);
    const drop = recent.flatMap((e) => e.D ?? []), noq = drop.filter((d) => d[1] === 'no-quote').length;
    if (drop.length) add(noq >= 4 ? 'mid' : 'good', '버린 줄', `최근 ${drop.length}줄${noq ? ` · 인용이 틀려서 ${noq}줄` : ''}${noq >= 4 ? ' · 읽는 AI를 더 똑똑한 모델로 바꾸면 줄어요' : ''}`);
    const scr = st.screened ?? [];
    if (scr.length) add('mid', '막은 쪽지 줄', `${scr.filter((x) => x.held).length}줄은 통째로 안 보냈고 ${scr.filter((x) => !x.held).length}줄은 낱말만 가리고 보냈어요 (${[...new Set(scr.map((x) => x.app))].join(' · ')} → ${[...new Set(scr.map((x) => x.by))].join(' · ')}이 막음)`);
    if (/^error/.test(st.status ?? '')) add('bad', '연결', `${st.status} · ⚙️ 설정에서 연결을 확인해 주세요`);
    else if (st.calls) add('good', '연결', `이번 세션 호출 ${st.calls}번 · 받은 줄 ${st.kept} · 버린 줄 ${st.dropped}`);
    if (st.promptChars > 6000) add('mid', '읽는 프롬프트', `${st.promptChars}자 · 앱을 줄이면 빨라져요`);
    return R;
}
// One text with everything needed to judge a chat. Guarded secrets never leave: lines that list them are masked.
export function report(st, log, chat, chips, facts) {
    const mask = (t) => String(t ?? '').split('\n').map((l) => (/^\s*-?\s*Guarded \[/.test(l) ? '(guarded secret — hidden)' : l)).join('\n');
    const out = [`# Meatball 4 report ${st.version ?? ''} · ${new Date().toISOString()}`, `apps: ${st.apps.join(', ')}`, `keys: ${st.keys.join(', ')}`,
        `paused: ${st.paused} · unread: ${st.unread} · calls: ${st.calls} · kept: ${st.kept} · dropped: ${st.dropped} · status: ${st.status || '-'}`, '',
        '## Note as sent to the main model', mask(facts) || '(nothing)', '', '## Last replies'];
    for (const e of log.slice(-15)) {
        out.push(`### #${e.i} ${clip(cleanText(chat[e.i]?.mes), 60)}${e.src ? ` [${e.src}]` : ''}${e.fail ? ` [failed: ${e.fail}]` : ''}`);
        for (const l of e.L) out.push(`- ${l[0]}: ${l[1]}${l[2] ? ` | "${clip(l[2], 80)}"` : ''}`);
        for (const l of e.fixed) out.push(`- (by hand) ${l[0]}: ${l[1]}`);
        for (const d of e.D ?? []) out.push(`- (dropped: ${d[1]}) ${d[0]}`);
        const c = chips(e);
        if (c.length) out.push(`  labels: ${c.map((x) => x.text).join(' · ')}`);
    }
    return mask(out.join('\n'));
}

export default {
    api: 1,
    id: 'record',
    name: '기록',
    icon: '📒',
    color: '#e9c46a',
    cost: 'zero',
    desc: '답마다 무엇이 적혔는지 한눈에 보고, 틀리게 읽은 답만 골라 다시 읽혀요.',
    css: `
.mb4-rec-drop { font-size: 12.5px; color: var(--sub); margin-top: 4px; }
.mb4-rec-drop s { color: var(--bad); }
.mb4-rec-chk { display: flex; gap: 8px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--line); }
.mb4-rec-chk i { font-style: normal; }
.mb4-rec-chk small { display: block; color: var(--sub); }
`,
    render(el, api) {
        const all = api.core.log(), chat = api.core.chat(), st = api.core.status?.() ?? { apps: [], keys: [], calls: 0, kept: 0, dropped: 0, unread: 0 };
        const tab = api.store._tab ?? 'log';
        const tabs = `<div class="mb4-btnrow tight" style="margin-bottom:10px">${[['log', '📒 답마다'], ['check', '🩺 점검'], ['copy', '📋 보고서']].map(([id, n]) => `<button class="mb4-btn ${tab === id ? '' : 'ghost '}sm" data-act="tab" data-v="${id}">${n}</button>`).join('')}</div>`;
        let body = '';
        if (tab === 'log') {
            const only = api.store._app ?? '', has = (e) => !only || api.core.chips(e).some((c) => c.app === only) || e.L.some((l) => api.core.ownerOf?.(l[0]) === only);
            const log = all.slice().reverse().filter(has).slice(0, 40), read = log.filter((e) => e.read).length;
            const owners = [...new Set(all.flatMap((e) => api.core.chips(e).map((c) => c.app)))];
            body = (owners.length > 1 ? `<div class="mb4-chips" style="margin-bottom:8px"><button class="mb4-opt${only ? '' : ' on'}" data-act="only" data-v="">전부</button>${owners.map((id) => `<button class="mb4-opt${only === id ? ' on' : ''}" data-act="only" data-v="${esc(id)}">${esc(id)}</button>`).join('')}</div>` : '') + (log.length ? `${card('', `<div class="mb4-row"><span class="mb4-row-v">읽은 답 <b>${read}</b> · 아직 안 읽은 답 <b>${log.length - read}</b></span></div>`)}
            ${log.map((e) => { const chips = api.core.chips(e); return card('', `
                <div class="mb4-rec-h"><b>#${e.i}</b><small>${esc(clip(cleanText(chat[e.i]?.mes), 46))}</small>${e.src ? pill(SRC[e.src] ?? e.src) : ''}${e.cont ? pill('이어 쓰기') : ''}</div>
                <div class="mb4-chips">${chips.length ? chips.map((c) => `<span class="mb4-chip">${esc(c.text)}</span>`).join('') : `<span class="mb4-hint">${e.fail ? `⚠ 읽지 못했어요 (${FAIL[e.fail] ?? e.fail})` : e.read ? '바뀐 게 없어요' : '아직 안 읽었어요'}</span>`}</div>
                ${e.read && (e.L.length || e.D?.length) ? `<details style="margin-top:6px"><summary class="mb4-hint">🔍 어떻게 읽었나</summary>
                    ${e.L.map((l) => `<div class="mb4-quote"><b>${esc(l[0])}</b> ${esc(l[1])} <small class="mb4-dim">→ ${esc(api.core.ownerOf?.(l[0]) || '꺼진 앱')}</small>${l[2] ? `<q>${esc(l[2])}</q>` : ''}</div>`).join('')}
                    ${(e.D ?? []).map((d) => `<div class="mb4-rec-drop"><s>${esc(d[0])}</s> — ${esc(WHY[d[1]] ?? d[1])}</div>`).join('')}
                    ${e.ks ? `<p class="mb4-hint">그때 듣던 키: ${esc(e.ks.split(',').join(' · '))}</p>` : ''}
                </details>` : ''}
                ${e.fixed.length ? `<div class="mb4-rec-drop">✋ 손으로 고침: ${e.fixed.map((l) => esc(`${l[0]}: ${l[1]}`)).join(' · ')}</div>` : ''}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="again" data-v="${e.i}">🔄 다시 읽기</button>${e.fixed.length ? `<button class="mb4-btn ghost sm" data-act="unfix" data-v="${e.i}">손으로 고친 것 ${e.fixed.length}개 되돌리기</button>` : ''}</div>`); }).join('')}
            ${hint('다시 읽기는 AI를 1번 불러요. 최근 40개까지 보여 줘요.')}`
                : empty('📒', only ? '이 앱이 적은 답이 없어요' : '아직 기록이 없어요', 'AI 답이 오면 여기 쌓여요'));
        } else if (tab === 'check') {
            const L = { good: '✅', mid: '🟡', bad: '❌' };
            body = card('🩺 자가 점검', checkRows(st, all).map((r) => `<div class="mb4-rec-chk"><i>${L[r.lv]}</i><span><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span></div>`).join('')) + hint('AI를 부르지 않고 지금 채팅만 살펴요.');
        } else {
            body = card('📋 보고서', `<p class="mb4-hint">켜진 앱 · 보낸 쪽지 · 최근 15답에서 읽은 줄과 버린 줄을 글 하나로 모아요. 비밀 내용은 가려져요.</p>
                <div class="mb4-btnrow"><button class="mb4-btn wide" data-act="copy">📋 복사하기</button></div><textarea class="mb4-input" rows="8" readonly data-f="rep"></textarea>`);
        }
        el.innerHTML = tabs + body;
        acts(el, {
            tab: (v) => { api.store._tab = v; api.redraw(); },
            only: (v) => { api.store._app = v; api.redraw(); },
            again: async (i, b) => { b.disabled = true; b.textContent = '읽는 중…'; await api.core.reread(+i); api.redraw(); },
            unfix: (i) => { api.core.unfix(+i); api.redraw(); },
            copy: async () => {
                const t = report(st, all, chat, api.core.chips, api.facts());
                const box = el.querySelector('[data-f="rep"]');
                if (box) box.value = t;
                try { await navigator.clipboard.writeText(t); api.toast('복사했어요.'); } catch (e) { box?.select(); api.toast('위 칸을 길게 눌러 복사해 주세요.'); }
            },
        });
    },
};
