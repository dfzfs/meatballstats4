// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };

// 💭 Inner voice: on a tap, what one character in the scene is thinking right now. For the person's eyes only:
// it is never sent to the main model, so it cannot leak into the story.
// Ported from the first generation's inner-voice tab: besides the characters, watchers outside the story (a devoted fan,
// an anti-fan, the "co-author", a bystander, a live chat, the little cells in the user character's head), a tone, and
// a way to show it (plain, emoji, kaomoji). One call per tap.
const WATCH = {
    fan: { icon: '💖', name: '열성팬', p: 'a devoted superfan watching this story who screams, ships and over-invests' },
    anti: { icon: '👎', name: '안티팬', p: 'an anti-fan who only watches to nitpick and sneer' },
    writer: { icon: '✍️', name: '공동작가', p: 'the co-author who believes they are writing this whole chat: foreshadowing, regrets, next-episode teasers' },
    by: { icon: '👀', name: '주변인', p: 'a random ordinary bystander physically near the scene (a passer-by, a clerk, a cat on a wall)' },
    chat: { icon: '💬', name: '실시간 채팅', p: 'several viewers in a live-stream chat reacting at once (short lines, laughter, spam, jokes)' },
};
const CELLS = {
    jjogae: ['😏', '쪼개세포', 'always snickering while making backhanded remarks'], yok: ['🤬', '욕세포', 'swears first and thinks later, angry at the situation'],
    woo: ['🌧️', '우울세포', 'gloomy and defeatist, sighs a lot'], sul: ['💓', '설렘세포', 'melts over the tiniest thing'], bul: ['😰', '불안세포', 'instantly imagines the worst case'],
    isung: ['🤓', '이성세포', 'the cold logical one who analyses and scolds the others'], mukbo: ['🍙', '먹보세포', 'only cares about food'], noi: ['🌀', '뇌절세포', 'jumps to wild delusional conclusions'],
};
const TONES = [['plain', '그대로', ''], ['soft', '다정하게', 'Gentle and warm.'], ['snark', '시니컬하게', 'Dry and sarcastic.'], ['drama', '과몰입', 'Over the top, dramatic.']];
const FMT = [['text', '글'], ['emoji', '이모지 섞기'], ['kao', '카모지 섞기']];
// the same lists in the shape the person can edit (rename, re-describe, hide, add their own)
const D_WATCH = Object.entries(WATCH).map(([id, w]) => ({ id, icon: w.icon, name: w.name, ai: w.p }));
const D_CELLS = Object.entries(CELLS).map(([id, c]) => ({ id, icon: c[0], name: c[1], ai: c[2] }));
const D_TONES = TONES.map(([id, name, ai]) => ({ id, icon: '', name, ai }));
const D_FMT = [{ id: 'text', icon: '', name: '글', ai: '' }, { id: 'emoji', icon: '', name: '이모지 섞기', ai: 'Sprinkle a few emoji.' }, { id: 'kao', icon: '', name: '카모지 섞기', ai: 'Sprinkle a few kaomoji like (｡•́︿•̀｡) or (≧▽≦).' }];

export default {
    api: 1, id: 'mind', name: '속마음', icon: '💭', color: '#a78bfa', cost: 'tap',
    desc: '누르면 지금 장면 속 인물의 속마음을 살짝 보여 줘요. 나만 보고, 본편 AI에는 안 가요.',
    widget: (_s, env) => { const m = (env.store.list ?? []).at(-1); return m ? `<div class="mb4-row"><span class="mb4-row-k">${esc(m.who)}</span><span class="mb4-row-v">${esc(clip(m.text, 70))}</span></div>` : ''; },
    render(el, api) {
        const st = api.store, cfg = api.cfg, k = api.kit, env = api.env;
        st.list = Array.isArray(st.list) ? st.list : [];
        const W = k.optList(cfg, 'watch', D_WATCH), C = k.optList(cfg, 'cells', D_CELLS), T = k.optList(cfg, 'tones', D_TONES), F = k.optList(cfg, 'fmt', D_FMT);
        cfg.cells = cfg.cells && typeof cfg.cells === 'object' ? cfg.cells : { jjogae: true, sul: true, bul: true };
        const cast = [...new Set([...(env.peek('scene')?.with ?? []), env.char].filter((n) => n && n !== env.user))];
        const mode = st.mode === 'watch' ? 'watch' : 'cast';
        st.who = mode === 'cast' ? (cast.includes(st.who) ? st.who : cast[0] ?? '') : (W.some((w) => w.id === st.who) || st.who === 'cells' ? st.who : W[0]?.id ?? 'cells');
        const tone = T.find((t) => t.id === cfg.tone) ?? T[0] ?? { id: '', ai: '' }, fmt = F.find((f) => f.id === cfg.fmt) ?? F[0] ?? { id: '', ai: '' };
        const chip = (act, it, on) => `<button class="mb4-opt${on ? ' on' : ''}" data-act="${act}" data-v="${esc(it.id)}">${it.icon ? `${it.icon} ` : ''}${esc(it.name)}</button>`;
        el.innerHTML = `<div class="mb4-btnrow tight" style="margin-bottom:8px"><button class="mb4-btn ${mode === 'cast' ? '' : 'ghost '}sm" data-act="mode" data-v="cast">🎭 인물</button><button class="mb4-btn ${mode === 'watch' ? '' : 'ghost '}sm" data-act="mode" data-v="watch">👀 관전자</button></div>
        ${k.card(mode === 'cast' ? '누구의 속마음' : '누가 볼까', mode === 'cast' ? (cast.length ? `<div class="mb4-chips">${cast.map((n) => `<button class="mb4-opt${n === st.who ? ' on' : ''}" data-act="who" data-v="${esc(n)}">${k.face(n)} ${esc(n)}</button>`).join('')}</div>` : k.hint('장면에 있는 사람이 없어요.'))
            : `<div class="mb4-chips">${W.map((w) => chip('who', w, st.who === w.id)).join('')}<button class="mb4-opt${st.who === 'cells' ? ' on' : ''}" data-act="who" data-v="cells">🧠 세포들</button></div>
              ${st.who === 'cells' ? `<div class="mb4-chips" style="margin-top:6px">${C.map((c) => `<button class="mb4-btn ${cfg.cells[c.id] ? '' : 'ghost '}sm" data-act="cell" data-v="${esc(c.id)}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>` : ''}`)}
        ${k.card('', `<div class="mb4-chips">${T.map((t) => chip('tone', t, tone.id === t.id)).join('')}</div><div class="mb4-chips" style="margin-top:6px">${F.map((f) => chip('fmt', f, fmt.id === f.id)).join('')}</div>`)}
        <button class="mb4-btn wide" data-act="get" ${st.who ? '' : 'disabled'}>💭 ${mode === 'cast' ? '속마음 보기' : '한마디 듣기'} (AI 1회)</button>
        ${(() => { const ws = [...new Set(st.list.map((m) => m.who))]; return ws.length > 1 ? `<div class="mb4-chips" style="margin:8px 0"><button class="mb4-opt${st.see ? '' : ' on'}" data-act="see" data-v="">모두</button>${ws.map((w) => `<button class="mb4-opt${st.see === w ? ' on' : ''}" data-act="see" data-v="${esc(w)}">${esc(w)} <small>${st.list.filter((m) => m.who === w).length}</small></button>`).join('')}</div>` : ''; })()}
        ${st.list.map((m, i) => [m, i]).filter(([m]) => !st.see || m.who === st.see).reverse().slice(0, st.see ? 30 : 6).map(([m, i]) => `<div class="mb4-card"><div class="mb4-quote"><b>${m.icon ?? k.face(m.who)} ${esc(m.who)}</b><q style="white-space:pre-wrap">${esc(m.text)}</q></div>${k.editCard([{ name: 'line', i, label: '내용', value: m.text, rows: 3 }])}</div>`).join('')}
        ${k.optCard(cfg, 'watch', D_WATCH, { title: '관전자' })}
        ${k.optCard(cfg, 'cells', D_CELLS, { title: '세포들' })}
        ${k.optCard(cfg, 'tones', D_TONES, { title: '말투', fields: ['name', 'ai'], aiLabel: '어떤 말투인지 (예: Short and blunt.)' })}
        ${k.optCard(cfg, 'fmt', D_FMT, { title: '형식', fields: ['name', 'ai'], aiLabel: '어떻게 꾸밀지 (예: End every line with a cat sound.)' })}
        ${k.hint('속마음 · 관전자 한마디는 저장만 되고 본편 AI에는 보내지 않아요. 맨 밑 「✏️ 고치기」를 누르면 관전자 · 세포 · 말투 · 형식을 바꾸거나 새로 만들 수 있어요.')}`;
        k.optWire(el, cfg, () => { api.save(); api.redraw(); });
        k.editors(el, { line: { save: (i, t) => { if (st.list[i] && t) st.list[i].text = t; }, del: (i) => { st.list.splice(i, 1); } } }, () => { api.save(); api.redraw(); });
        k.acts(el, {
            see: (v) => { st.see = v; api.save(); api.redraw(); },
            mode: (v) => { st.mode = v; st.who = ''; api.save(); api.redraw(); },
            who: (n) => { st.who = n; api.save(); api.redraw(); },
            cell: (id) => { cfg.cells[id] = !cfg.cells[id]; api.save(); api.redraw(); },
            tone: (v) => { cfg.tone = v; api.save(); api.redraw(); },
            fmt: (v) => { cfg.fmt = v; api.save(); api.redraw(); },
            get: async (_v, b) => {
                b.disabled = true; b.textContent = '들여다보는 중…';
                const style = [tone.ai, fmt.ai].filter(Boolean).join(' ');
                const base = `\n\n[What is known]\n${api.facts() || '(nothing recorded)'}\n\n[Latest part of the story]\n${clip(env.recent(1)[0] ?? '', 2000)}\n\nWrite in the same language as the story.${style ? ` ${style}` : ''}`;
                let prompt, who = st.who, icon = '';
                if (mode === 'cast') prompt = `In an ongoing story, write what ${who} is privately thinking at this exact moment: two or three sentences, first person, honest, in their own voice. It must agree with what they just said and did.${base} Output only the thoughts.`;
                else if (who === 'cells') { const on = C.filter((c) => cfg.cells[c.id]).slice(0, 4); prompt = `Little brain cells living inside ${env.user}'s head react to what just happened to ${env.user}. Pick one or two of them: ${on.map((c) => `${c.name} (${c.ai})`).join('; ') || 'any'}. Each says one short line in character.${base} Format: Name: line. Output only those lines.`; icon = '🧠'; who = '세포들'; }
                else { const w = W.find((x) => x.id === who); if (!w) return; prompt = `This watcher of the story — ${w.ai} — reacts to what just happened in one or two short lines, in character.${base} Output only the reaction.`; icon = w.icon; who = w.name; }
                const answer = await api.ask(prompt, 260);
                if (answer) { st.list.push({ who, icon, text: answer.replace(/^["“*]+|["”*]+$/g, '').trim() }); if (st.list.length > 30) st.list.shift(); } else api.toast('보지 못했어요. 잠시 뒤 다시 해 보세요.');
                api.save(); api.redraw();
            },
        });
    },
};
