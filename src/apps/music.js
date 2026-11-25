// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };

// 🎵 Music: on a tap, the model suggests one real song that fits the scene. Nothing is sent to the main model.
// The search link opens only when the person taps it.
// Ported from the second generation's music and "a line" apps: a taste the person sets (country, genre) so the pick does
// not drift to one style, a choice of where ▶ opens, and 📜 a single line (a quote, a lyric-free verse of one's own) that
// fits the scene. One call per tap.
const PLAYERS = [['youtube', 'YouTube', (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`], ['ytmusic', 'YT Music', (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`], ['spotify', 'Spotify', (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`], ['melon', '멜론', (q) => `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(q)}`]];
const linkOf = (cfg, q) => (PLAYERS.find((p) => p[0] === cfg.player) ?? PLAYERS[0])[2](q);

export default {
    api: 1, id: 'music', name: '추천 음악', icon: '🎵', color: '#ff8fab', cost: 'tap',
    desc: '누르면 지금 장면에 어울리는 실제 곡을 하나 골라 줘요.',
    widget: (_s, env) => { const s = (env.store.list ?? []).at(-1); return s ? `<div class="mb4-row"><span class="mb4-row-k">🎵</span><span class="mb4-row-v"><b>${esc(s.title)}</b><br><small>${esc(s.why)}</small></span></div>` : ''; },
    render(el, api) {
        const st = api.store, cfg = api.cfg, k = api.kit;
        st.list = Array.isArray(st.list) ? st.list : [];
        st.lines = Array.isArray(st.lines) ? st.lines : [];
        const now = st.list.at(-1), line = st.lines.at(-1);
        el.innerHTML = `${now ? `<div class="mb4-hero"><small>지금 장면에 어울리는 곡</small><div class="mb4-big">🎵 ${esc(now.title)}</div><p>${esc(now.why)}</p><div class="mb4-btnrow"><a class="mb4-btn" target="_blank" rel="noopener noreferrer" href="${esc(linkOf(cfg, now.title))}">▶ 찾아 듣기</a><button class="mb4-btn ghost" data-act="fav">${(st.fav ?? []).includes(now.title) ? '💖 모아 둠' : '🤍 모아 두기'}</button></div></div>` : k.empty('🎵', '아직 고른 곡이 없어요', '버튼을 누르면 장면을 보고 한 곡 골라요')}
        <button class="mb4-btn wide" data-act="get">🎵 ${now ? '다른 곡' : '곡 고르기'} (AI 1회)</button>
        ${k.card('📜 한 구절', `${line ? `<div class="mb4-quote"><q>${esc(line.t)}</q>${line.src ? `<small class="mb4-dim">— ${esc(line.src)}</small>` : ''}</div>` : k.hint('장면에 어울리는 한 구절을 골라 줘요.')}<div class="mb4-btnrow"><button class="mb4-btn ghost" data-act="line">📜 ${line ? '다른 구절' : '구절 받기'} (AI 1회)</button></div>`)}
        ${k.card('내 취향', `<input class="mb4-input" data-act="set" data-k="taste" maxlength="60" placeholder="예: 시티팝, 90년대 영국 록, 피아노 곡 (비우면 장면에 맞게)" value="${esc(cfg.taste ?? '')}">
            <div class="mb4-chips" style="margin-top:6px">${PLAYERS.map(([id, n]) => `<button class="mb4-opt${(cfg.player ?? 'youtube') === id ? ' on' : ''}" data-act="player" data-v="${id}">▶ ${n}</button>`).join('')}</div>`)}
        ${(st.fav ?? []).length ? k.card('💖 모아 둔 곡', st.fav.slice().reverse().map((t) => `<div class="mb4-row"><span class="mb4-row-v">${esc(t)}</span><a class="mb4-link" target="_blank" rel="noopener noreferrer" href="${esc(linkOf(cfg, t))}">▶</a></div>`).join('')) : ''}
        ${st.list.length > 1 ? k.card('지난 곡', st.list.slice(0, -1).reverse().slice(0, 8).map((s) => `<div class="mb4-row"><span class="mb4-row-v">${esc(s.title)}</span><a class="mb4-link" target="_blank" rel="noopener noreferrer" href="${esc(linkOf(cfg, s.title))}">▶</a></div>`).join('')) : ''}
        ${k.hint('「찾아 듣기」는 새 창에서 검색을 열어요. 곡 정보는 AI가 고른 것이라 틀릴 수 있어요.')}`;
        api.kit.editMore(el, api, [
            { name: 'song', list: st.list, label: (x) => '🎵 곡 | 어울리는 이유', get: (x) => `${x.title} | ${x.why ?? ''}`, set: (x, t) => { const [a, b] = api.kit.two(t); x.title = a; x.why = b; } },
            { name: 'line', list: st.lines, label: () => '📜 구절 | 출처', get: (x) => `${x.t} | ${x.src ?? ''}`, set: (x, t) => { const [a, b] = api.kit.two(t); x.t = a; x.src = b; } },
            { name: 'fav', list: st.fav ?? [], label: () => '💖 모아 둔 곡' },
        ]);
        k.acts(el, {
            set: (_v, inp) => { cfg[inp.dataset.k] = inp.value.trim(); api.save(); },
            fav: () => { st.fav = Array.isArray(st.fav) ? st.fav : []; const t = now?.title; if (!t) return; st.fav = st.fav.includes(t) ? st.fav.filter((x) => x !== t) : [...st.fav, t].slice(-40); api.save(); api.redraw(); },
            player: (v) => { cfg.player = v; api.save(); api.redraw(); },
            get: async (_v, b) => {
                b.disabled = true; b.textContent = '고르는 중…';
                const sc = api.env.peek('scene'), feel = [sc?.mood, sc?.weather, sc?.tod].filter(Boolean).join(', ');
                const answer = await api.ask(`Suggest one real, existing song that fits the mood of this scene.${feel ? ` Mood, weather and time recorded for it: ${feel}.` : ''}${(st.fav ?? []).length ? ` Songs the listener kept before (taste hint, do not repeat): ${st.fav.slice(-5).join('; ')}.` : ''}${cfg.taste ? ` The listener likes: ${cfg.taste}.` : ' Pick the country and genre from the scene itself (its era, setting and mood); do not default to one style.'}\n\n[Scene]\n${clip(api.env.recent(1)[0] ?? '', 1800)}\n\n[Already suggested, do not repeat]\n${st.list.map((s) => s.title).join('; ') || '(none)'}\n\nAnswer on one line, exactly: Title — Artist | one short sentence on why it fits (in the same language as the scene).`, 120);
                const m = answer.split(/\r?\n/).find((l) => l.includes('|'))?.split('|');
                if (m?.[0]?.trim()) { st.list.push({ title: clip(m[0].replace(/^[-*"“\s]+|["”\s]+$/g, ''), 100), why: clip(m.slice(1).join('|'), 160) }); if (st.list.length > 20) st.list.shift(); } else api.toast('곡을 고르지 못했어요. 잠시 뒤 다시 해 보세요.');
                api.save(); api.redraw();
            },
            line: async (_v, b) => {
                b.disabled = true; b.textContent = '고르는 중…';
                const answer = await api.ask(`Give one short line that fits the mood of this scene: a well-known saying, a line from a public-domain poem or book (written before 1929), or an original line of your own. Never song lyrics.\n\n[Scene]\n${clip(api.env.recent(1)[0] ?? '', 1500)}\n\nAnswer on one line: the line | its source (or "original"). In the same language as the scene.`, 120);
                const m = answer.split(/\r?\n/).find((l) => l.trim())?.split('|');
                if (m?.[0]?.trim()) { st.lines.push({ t: clip(m[0].replace(/^["“\s]+|["”\s]+$/g, ''), 200), src: clip(m[1] ?? '', 60) }); if (st.lines.length > 20) st.lines.shift(); } else api.toast('구절을 받지 못했어요.');
                api.save(); api.redraw();
            },
        });
    },
};
