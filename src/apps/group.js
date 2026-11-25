// 👥 Group room: the characters' own group chat. On a tap the model writes a few lines of them talking among
// themselves (one call per tap, never on its own). The person may drop a line in first. Kept per chat; told to the
// main model only if the person asks («이야기에 알리기»), once.
import { clip } from '../core/text.js';
import { esc, card, hint, acts, val, empty, face } from '../ui/kit.js';

const MOODS_BASE = [['', '평소처럼'], ['gossip', '뒷이야기'], ['plan', '작당 모의'], ['fight', '티격태격'], ['night', '새벽 감성']];
const MOOD_EN_BASE = { gossip: 'They gossip about what just happened.', plan: 'They are planning something together.', fight: 'They bicker — petty, in character, no real harm.', night: 'It is late; they are sleepy, honest and a little sentimental.' };
import { optList as _opt } from '../ui/kit.js';
const D_MOODS = MOODS_BASE.map(([id, name]) => ({ id: id || 'usual', icon: '', name, ai: MOOD_EN_BASE[id] ?? 'They talk as they normally would, about what is on their minds.' }));
let MOODS = MOODS_BASE, MOOD_EN = MOOD_EN_BASE;
const moodsOf = (cfg) => { const L = _opt(cfg, 'moods', D_MOODS); return [L.map((m) => [m.id === 'usual' ? '' : m.id, m.name]), Object.fromEntries(L.map((m) => [m.id === 'usual' ? '' : m.id, m.ai]))]; };
const everyone = (env) => [...new Set([...(env.peek?.('scene')?.with ?? []), ...Object.values(env.peek?.('people')?.list ?? {}).filter((p) => !p.gone).map((p) => p.name), env.char])].filter((n) => n && n !== env.user);
function parse(raw, members) {
    const out = [];
    for (const l of String(raw ?? '').split(/\r?\n/)) {
        const m = l.match(/^\s*[-*]?\s*\**([^:：*]{1,40})\**\s*[:：]\s*(.+)$/);
        if (!m) continue;
        const who = members.find((n) => n.toLowerCase() === m[1].trim().toLowerCase()) ?? m[1].trim();
        out.push({ who, t: m[2].replace(/^["“]|["”]$/g, '').trim() });
    }
    return out.slice(0, 12);
}

export default {
    api: 1, id: 'group', chat: true, name: '단체방', icon: '💬', color: '#00b4d8', cost: 'tap',
    desc: '인물들끼리의 단체 대화방. 누르면 자기들끼리 떠드는 몇 줄을 받아요. 내가 한마디 끼어들 수도 있어요.',
    note(_S, env) { const f = env.store.fresh; return f && env.store.tell ? { now: [`Off the page, in their group chat, this was just said — ${f}. The ones who took part know it; it may colour this reply without being quoted.`] } : null; },
    onReply(env) { if (env.store.fresh) { env.store.fresh = ''; return true; } return false; },
    hud: (_S, env) => (env.store.fresh && env.store.tell ? ['💬 단체방'] : []),
    widget: (_S, env) => (env.store.log ?? []).slice(-2).map((m) => `<div class="mb4-row"><span class="mb4-row-k">${esc(m.who)}</span><span class="mb4-row-v">${esc(clip(m.t, 50))}</span></div>`).join(''),
    widgetTitle: '단체방',
    render(el, api) {
        [MOODS, MOOD_EN] = moodsOf(api.cfg);
        const st = api.store, env = api.env, all = everyone(env);
        st.log = Array.isArray(st.log) ? st.log : [];
        st.own = Array.isArray(st.own) ? st.own : [];   // names typed in by hand (not from the story's list)
        st.in = (Array.isArray(st.in) ? st.in : all.slice(0, 4)).filter((n) => all.includes(n) || st.own.includes(n));
        let crowd = String(st.crowd ?? '').trim();
        const open = !!st.open, ready = open || st.in.length >= 1;
        const mood = MOODS.some((m) => m[0] === st.mood) ? st.mood : '';
        const who = st.in.length ? `${st.in.slice(0, 3).join(', ')}${st.in.length > 3 ? ` 외 ${st.in.length - 3}명` : ''}` : '';
        api.title(`💬 ${crowd || '단체방'}`);
        // ── panels from ⋯ (members · mood), shown above the room ──
        const panel = st._panel === 'who' ? card('👥 누가 떠드나요', `<div class="mb4-seg"><button class="${open ? '' : 'on'}" data-act="open" data-v="">🔒 고른 사람만</button><button class="${open ? 'on' : ''}" data-act="open" data-v="1">🌐 오픈</button></div>
                <input class="mb4-input" data-act="crowd" maxlength="80" style="margin-top:8px" placeholder="방 이름 · 어떤 무리인가요 (예: 기사단, 우리 반)" value="${esc(crowd)}">
                ${hint(open ? '고른 사람에 더해, 이 무리의 다른 사람들도 이름을 달고 끼어들어요. 아무도 안 골라도 돼요.' : '아래에서 고른 사람만 떠들어요.')}
                <div class="mb4-chips" style="margin-top:10px">${[...all, ...st.own.filter((n) => !all.includes(n))].map((n) => `<button class="mb4-opt${st.in.includes(n) ? ' on' : ''}" data-act="who" data-v="${esc(n)}">${face(n)} ${esc(n)}</button>`).join('')}</div>
                <input class="mb4-input" data-f="own" maxlength="120" placeholder="＋ 이름 적고 Enter (쉼표로 여럿)">
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="panel" data-v="">닫기</button></div>`)
            : st._panel === 'mood' ? card('🎭 분위기', `<div class="mb4-chips">${MOODS.map(([id, n]) => `<button class="mb4-opt${mood === id ? ' on' : ''}" data-act="mood" data-v="${id}">${n}</button>`).join('')}</div>
                ${api.kit.optCard(api.cfg, 'moods', D_MOODS, { title: '분위기 고치기 · 더하기', fields: ['name', 'ai'], aiLabel: '어떤 분위기로 떠드는지 (예: They are planning a surprise party.)' })}
                <div class="mb4-btnrow"><button class="mb4-btn ghost sm" data-act="panel" data-v="">닫기</button></div>`)
            : '';
        const head = `<button class="mbg-head" data-act="panel" data-v="who"><span>${open ? '🌐' : '🔒'}</span><b>${who ? esc(who) : open ? '아무나' : '아직 아무도 없어요'}${open && who ? ' + 그 밖의 사람들' : ''}</b><small>${MOODS.find((m) => m[0] === mood)?.[1] ?? ''} ›</small></button>`;
        el.innerHTML = `${panel}
            <div class="mbx-thread">${st.log.slice(-40).map((m) => (m.me
                ? `<div class="mbx-b me"><div class="mbx-bubble mbg-me">${esc(m.t)}</div></div>`
                : `<div class="mbx-b them"><span class="mb4-face mbx-av">${face(m.who)}</span><div class="mbg-col"><small class="mbg-n">${esc(m.who)}</small><div class="mbx-bubble">${esc(m.t)}</div></div></div>`)).join('') || `<p class="mb4-hint mb4-center">${ready ? '보내기를 누르면 떠들기 시작해요. 비워 두고 눌러도 돼요.' : '⋯에서 누가 떠들지 골라 주세요.'}</p>`}</div>
            <div class="mbx-dock"><textarea class="mb4-input mbx-in" data-f="msg" rows="1" placeholder="한마디 끼어들기 (비우면 그냥 떠들게)"></textarea><button class="mb4-btn mbx-go" data-act="go" ${ready ? '' : 'disabled'}>보내기</button></div>`;
        api.kit.editMore(el, api, [{ name: 'log', list: st.log, max: 30, label: (m) => (m.me ? '나' : m.who), get: (m) => m.t, set: (m, t) => { m.t = t; } }]);
        if (st._panel === 'mood') api.kit.optWire(el, api.cfg, () => { api.save(); api.redraw(); });
        api.menu([
            { icon: '👥', label: '누가 떠드나요', sub: `${open ? '🌐 오픈' : '🔒 고른 사람만'}${who ? ` · ${who}` : ''}`, act: () => { st._panel = 'who'; api.redraw(); } },
            { icon: '🎭', label: '분위기', sub: MOODS.find((m) => m[0] === mood)?.[1] ?? '', act: () => { st._panel = 'mood'; api.redraw(); } },
            { icon: st.tell ? '📣' : '🔕', label: st.tell ? '이야기에 알리기 끄기' : '이야기에 알리기', sub: '방금 나눈 말을 다음 답에서 본편 AI가 한 번 알아요', act: () => { st.tell = !st.tell; api.save(); api.redraw(); } },
            { icon: '🧹', label: '방 비우기', disabled: !st.log.length, act: () => { st.log = []; st.fresh = ''; api.save(); api.redraw(); } },
        ]);
        setTimeout(() => el.querySelector('.mbx-dock')?.scrollIntoView({ block: 'nearest' }), 0);
        const inp = el.querySelector('[data-f="msg"]');
        inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('[data-act="go"]')?.click(); } });
        el.querySelector('[data-f="own"]')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); acts2.own(); } });
        const acts2 = {
            panel: (v) => { st._panel = st._panel === v ? '' : v; api.redraw(); },
            who: (n) => { st.in = st.in.includes(n) ? st.in.filter((x) => x !== n) : [...st.in, n].slice(0, 8); api.save(); api.redraw(); },
            mood: (v) => { st.mood = v; api.save(); api.redraw(); },
            open: (v) => { st.open = !!v; api.save(); api.redraw(); },
            // no redraw here: the box may still have focus (redrawing under it fires a second change)
            crowd: (v) => { st.crowd = clip(String(v ?? '').trim(), 80); api.save(); const g = el.querySelector('[data-act="go"]'); if (g) g.disabled = !(st.open || st.in.length >= 1); },
            own: () => { const box = el.querySelector('[data-f="own"]'), L = String(box?.value ?? '').split(/[,，、]/).map((x) => x.trim().slice(0, 40)).filter((n) => n && n !== env.user); if (!L.length) return; for (const n of L) { if (!st.own.includes(n) && !all.includes(n)) st.own.push(n); if (!st.in.includes(n)) st.in = [...st.in, n].slice(0, 8); } box.value = ''; api.save(); api.redraw(); },
            go: async (_v, b) => {
                if (!(st.open || st.in.length)) return;
                const mine = val(el, '[data-f="msg"]');
                if (mine) st.log.push({ me: true, who: env.user || 'me', t: mine });
                b.disabled = true; b.textContent = '…';
                const P = env.peek('people')?.list ?? {};
                const raw = await api.ask(`[TASK] Do NOT continue the story and do not narrate. Write the next lines of a phone group chat${st.open && (crowd = String(st.crowd ?? '').trim()) ? ` — the group chat of ${crowd}` : ''}. ${st.in.length ? `Named members: ${st.in.map((n) => `${n}${P[n]?.about ? ` (${P[n].about})` : ''}`).join('; ')}.` : ''}${st.open ? ` Other members${crowd ? ` of ${crowd}` : ' of their circle'} chime in too: give them fitting names or chat handles, keep them minor and consistent with earlier lines.` : ' Only these members speak; nobody else is in the room.'}${mine ? ` ${env.user} is in the room too and just wrote the last line; they react to it.` : ` ${env.user} is not reading right now.`} ${MOOD_EN[mood] ?? 'They talk as they normally would, about what is on their minds.'}\n\n[What is known]\n${api.facts() || '(nothing recorded)'}\n\n[Latest part of the story]\n${clip(env.recent(1)[0] ?? '', 1500)}\n\n[Group chat so far]\n${st.log.slice(-12).map((m) => `${m.who}: ${m.t}`).join('\n') || '(empty)'}\n\nWrite 4 to 7 short chat lines, each exactly "Name: message", every voice distinct, in the language of the story. Nobody says what they could not know. Output only those lines.`, 1500);
                // a reply cut off by the length limit ends mid-sentence: its last line is dropped rather than shown broken
                let L = parse(raw, st.in);
                const tail = String(raw ?? '').trimEnd();
                if (L.length > 1 && tail.length > 600 && !/[.!?…~)\]"'”’」』。！？ㅋㅎ♡♥💕😂🤣👍]$|[\u{1F300}-\u{1FAFF}]$/u.test(tail)) L = L.slice(0, -1);
                if (L.length) { st.log.push(...L); if (st.log.length > 120) st.log.splice(0, st.log.length - 120); st.fresh = L.slice(-4).map((m) => `${m.who}: "${m.t}"`).join(' / '); }
                else api.toast('받지 못했어요. 잠시 뒤 다시 해 보세요.');
                api.save(); api.redraw();
            },
        };
        acts(el, acts2);
    },
    css: '.mbg-head{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 8px;padding:9px 12px;border:0;border-radius:12px;background:var(--fill);color:inherit;font:inherit;text-align:left;cursor:pointer}.mbg-head b{flex:1;min-width:0;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mbg-head small{color:var(--sub);font-size:12px;white-space:nowrap}.mbg-col{display:flex;flex-direction:column;align-items:flex-start;max-width:78%;min-width:0}.mbg-col .mbx-bubble{max-width:100%}.mbg-n{margin:0 0 2px 4px;font-size:11.5px;color:var(--sub)}.mbx-bubble.mbg-me{background:#00b4d8!important;color:#fff;border-bottom-right-radius:6px;box-shadow:none}' + '.mbx-thread{display:flex;flex-direction:column;gap:6px;padding:4px 0 10px;min-height:120px}.mbx-b{display:flex;align-items:flex-end;gap:6px}.mbx-b.me{justify-content:flex-end}.mbx-av{width:28px!important;height:28px!important;font-size:15px!important}.mbx-bubble{max-width:76%;padding:8px 12px;border-radius:18px;background:var(--card);box-shadow:0 .5px 0 var(--line);overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.45}.mbx-b.them .mbx-bubble{border-bottom-left-radius:6px}.mbx-dock{position:sticky;bottom:-26px;display:flex;align-items:flex-end;gap:8px;margin:0 -16px;padding:8px 16px 12px;background:var(--glass);-webkit-backdrop-filter:blur(22px) saturate(1.6);backdrop-filter:blur(22px) saturate(1.6);border-top:.5px solid var(--line);z-index:2}.mbx-dock .mbx-in{flex:1;resize:none;min-height:40px}',
};
