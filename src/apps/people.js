// 👥 People: everyone the story has introduced, with one line on who they are. The main model is reminded
// only about the people who are in the scene right now. Ported from the third generation's name dictionary
// (two spellings of one person are merged; one-letter differences are offered as "merge?") and the second
// generation's person sheet (how people address each other).
import { clip } from '../core/text.js';
import { resolve, lookalikes } from '../core/names.js';
import { cueOr, slow } from '../core/cadence.js';
import { esc, card, person, empty, hint, acts, pill, closeness, foldRest, byHeart, foldUnder, SHOW_AT } from '../ui/kit.js';

const split = (v) => { const i = v.indexOf('='); return i < 0 ? [v.trim(), ''] : [v.slice(0, i).trim(), v.slice(i + 1).trim()]; };

export default {
    api: 1,
    id: 'people',
    name: '인물',
    icon: '👥',
    color: '#4d908e',
    cost: 'low',
    desc: '이야기에 나온 사람들을 한 줄 소개와 함께 모아 두고, 지금 장면에 있는 사람만 AI에 알려 줘요.',
    keys: [
        { id: 'call', line: 'call: A>B=what A calls B (name, nickname, title)', quote: true },
        { id: 'npc', line: 'npc: Name=who they are, a few words (a new person, or something new or changed about a known one)', quote: true },
        { id: 'gone', line: 'gone: Name=left the story for good | dead', quote: true },
        // NEXT-3: third-generation keys restored as their own items (v3 core/keys.js, surface rules 11 · 13 · 16)
        { id: 'know', line: 'know: Name=secret · news · identity just learned, with names (whose, about whom)', when: cueOr(/learn|found out|realiz|discover|knew|know|told|secret|truth|news|identity|reveal|알게|알아|비밀|정체|소식/i, (S) => Object.keys(S?.knows ?? {}).length > 0),
            rules: ['"know" is only a secret, news or an identity someone just learned. Not small actions.'] },
        { id: 'lie', line: 'lie: A>B=what A hides from or lies to B   (found out: A>B=-what)', quote: true, when: cueOr(/lie|lied|liar|hid|hide|hidden|pretend|secret|cover|deceiv|false|fake|didn.t tell|거짓|숨기|속이|모른 척|비밀/i, (S) => Object.keys(S?.lies ?? {}).length > 0),
            rules: ['lie, owe and role only when the text makes them clear. Never guess.'] },
        { id: 'owe', line: 'owe: A>B=what A owes B (debt, life, a weakness held) (settled: -what)', when: cueOr(/owe|debt|lend|lent|borrow|repay|pay (you|him|her|them) back|favou?r|saved (my|your|his|her) life|in your debt|leverage|빚|갚|빌려|은혜|신세|약점/i, (S) => Object.keys(S?.owes ?? {}).length > 0),
            rules: ['lie, owe and role only when the text makes them clear. Never guess.'] },
        { id: 'role', line: 'role: Name=position or status (when it changes or is first revealed)', when: slow({ every: 6, cue: /captain|chief|lord|lady|king|queen|prince|princess|boss|head|director|officer|knight|doctor|professor|promot|appoint|title|rank|직위|직책|신분|승진|임명/i }),
            rules: ['lie, owe and role only when the text makes them clear. Never guess.'] },
        { id: 'alias', line: 'alias: Name=other name', when: slow({ every: 6, cue: /call(ed)? me|known as|real name|nickname|also called|goes by|이름|별명|본명/i }) },
        { id: 'seed', line: 'seed: Name=small lasting thing about them   (a like, dislike, habit, fear or wish, the first time the text states it; one line at most)', quote: true, when: slow({ every: 4, cue: /like|love|hate|can.t stand|always|never|habit|afraid|fear|scared|wish|dream|favou?rite|좋아|싫어|버릇|습관|무서|소원|늘|항상/i }),
            rules: ['seed is for small personal things said in passing, not for secrets, plans or plot facts.'] },
    ],
    rules: ['"npc" is for people only, never places or groups. "gone" is not for someone who merely leaves the scene.'],
    // everyone another app names (in the scene, what they wear, how close they are) also gets a place in the list,
    // so the list keeps up with the story even when no new «npc» line is written. Reading only: nothing new is asked.
    watch: ['with', 'wear', 'body', 'mark', 'carry', 'pos', 'touch', 'move', 'feel', 'tie', 'refuse', 'yield', 'press', 'aside', 'lead'],
    start: () => ({ list: {}, calls: {}, knows: {}, lies: {}, owes: {}, roles: {}, seeds: {} }),
    // the reader sometimes names the person's own character «User» / «you»: never a separate person in the list
    check: ({ k, v }, env = {}) => { const [n, rest] = split(v); if ((k === 'npc' || k === 'gone') && (/^(?:\{\{user\}\}|user|you|the user|player|protagonist)$/i.test(n.trim()) || (env.user && n.trim().toLowerCase() === String(env.user).toLowerCase()))) return false; if (k === 'call') return n.includes('>') && !!rest && rest.length <= 40; return n.length > 0 && n.length <= 40; },
    reduce(S, { k, v, i, q, watched }, env) {
        const alias = env?.store?.alias ?? {}, canon = (n) => resolve(Object.keys(S.list), n, alias) ?? n.trim();
        if (watched) {
            const me = String(env?.user ?? '').trim().toLowerCase();
            const ok = (n) => n && n.length <= 40 && !/^(?:\(?(?:none|nobody|no one|alone|empty)\)?|\{\{user\}\}|user|you|the user|me|나|너)$/i.test(n) && n.toLowerCase() !== me;
            const lhs = String(v).split('=')[0];
            const who = k === 'with' ? (String(v).trim().startsWith('-') ? [] : String(v).replace(/^\s*=/, '').split(/\s*[,，;/]\s*|\s+(?=[+-])/).filter((x) => !x.trim().startsWith('-')).map((x) => x.replace(/^\s*\+/, '').trim()))
                : k === 'tie' ? lhs.split(/\s*-\s*/) : lhs.split('>');
            for (const raw of who.map((x) => String(x).trim()).filter(ok)) {
                const name = canon(raw), P = (S.list[name] ??= { name, about: '', first: i, i, gone: '', seen: [] });
                P.i = Math.max(P.i ?? 0, i);
            }
            return;
        }
        S.calls ??= {};
        if (k === 'call') {
            const [lhs, rest] = split(v), [a, b] = lhs.split('>').map((x) => canon(x));
            if (a && b && a !== b) S.calls[`${a}>${b}`] = { v: clip(rest, 40), i };
            return;
        }
        for (const f of ['knows', 'lies', 'owes', 'roles', 'seeds']) S[f] ??= {};
        if (k === 'lie' || k === 'owe') {
            const [lhs, rest] = split(v), [a, b] = lhs.split('>').map((x) => canon(x)), off = /^[-−]/.test(rest), what = clip(rest.replace(/^[-−]\s*/, ''), 100);
            const box = k === 'lie' ? S.lies : S.owes, key = `${a}>${b}`;
            box[key] = (box[key] ?? []).filter((x) => x.v.toLowerCase() !== what.toLowerCase());
            if (off) { (box[key].done ??= []); } else box[key].push({ v: what, i, ...(q ? { q: clip(q, 120) } : {}) });
            if (!box[key].length) delete box[key];
            return;
        }
        if (k === 'know' || k === 'role' || k === 'alias' || k === 'seed') {
            const [raw2, rest] = split(v), who = canon(raw2), what = clip(rest, 100);
            if (k === 'alias') { const P = (S.list[who] ??= { name: who, about: '', first: i, i, gone: '', seen: [] }); if (what && !P.seen.includes(what)) P.seen.push(what); return; }
            if (k === 'role') { S.roles[who] = { v: what, i }; return; }
            const box = k === 'know' ? S.knows : S.seeds, L = (box[who] ??= []);
            if (!L.some((x) => x.v.toLowerCase() === what.toLowerCase())) L.push({ v: what, i, ...(q ? { q: clip(q, 120) } : {}) });
            if (L.length > 10) L.shift();
            return;
        }
        const [raw, rest] = split(v), name = canon(raw);
        const P = (S.list[name] ??= { name, about: '', first: i, i, gone: '', seen: [] });
        if (raw.trim() !== name && !P.seen.includes(raw.trim())) P.seen.push(raw.trim());   // other spellings, kept for the screen
        P.i = i;
        if (k === 'npc') {
            if (rest) { const a = clip(rest, 100); P.about = a; P.facts = [...(P.facts ?? []).filter((x) => x.toLowerCase() !== a.toLowerCase()), a].slice(-5); }
            P.gone = '';
        }
        else P.gone = clip(rest || 'gone', 40);
    },
    // 🗑 people the person removed by hand stay away until a newer reply names them again
    adjust(S, env) {
        for (const [n, at] of Object.entries(env.store?.hide ?? {})) {
            const P = S.list[n];
            if (!P || (P.i ?? -1) > at) continue;
            delete S.list[n];
            const has = (d) => d.split('>').includes(n);
            for (const f of ['calls', 'lies', 'owes']) for (const d of Object.keys(S[f] ?? {})) if (has(d)) delete S[f][d];
            for (const f of ['knows', 'seeds', 'roles']) if (S[f]) delete S[f][n];
        }
    },
    stateLines: (S) => { const L = Object.values(S.list).filter((p) => !p.gone); return [`known people: ${L.length ? L.map((p) => p.name).join(', ') : '(none recorded)'}`]; },
    note(S, env) {
        const here = env.peek('scene')?.with ?? null;
        const notes = env.store.notes ?? {};
        const pick = Object.values(S.list).filter((p) => !p.gone && (here ? here.includes(p.name) : env.last - p.i <= 6)).slice(0, 5);
        const state = pick.filter((p) => p.about || notes[p.name]).map((p) => `${p.name}: ${[p.about, notes[p.name]].filter(Boolean).join('; ')}.`);
        // how the people on stage address each other (kept, so a nickname does not drift back to a full name)
        const names = new Set([...pick.map((p) => p.name), env.user].filter(Boolean));
        const calls = Object.entries(S.calls ?? {}).filter(([d]) => d.split('>').every((n) => names.has(n))).slice(0, 4).map(([d, c]) => `${d.split('>')[0]} calls ${d.split('>')[1]} "${c.v}"`);
        if (calls.length) state.push(`How they address each other: ${calls.join('; ')}.`);
        // technique 5: only for people present now
        const on = (n) => names.has(n);
        for (const [n, r] of Object.entries(S.roles ?? {})) if (on(n)) state.push(`${n}'s position: ${r.v}.`);
        for (const [n, L] of Object.entries(S.seeds ?? {})) if (on(n) && L.length) state.push(`${n}: ${L.slice(-3).map((x) => x.v).join('; ')}.`);
        for (const [n, L] of Object.entries(S.knows ?? {})) if (on(n) && L.length) state.push(`${n} knows: ${L.slice(-3).map((x) => x.v).join('; ')}.`);
        for (const [d, L] of Object.entries(S.lies ?? {})) { const [a, b] = d.split('>'); if (on(a) && on(b) && L.length) state.push(`${a} is hiding from ${b}: ${L.map((x) => x.v).join('; ')} (${b} does not know).`); }
        for (const [d, L] of Object.entries(S.owes ?? {})) { const [a, b] = d.split('>'); if ((on(a) || on(b)) && L.length) state.push(`${a} owes ${b}: ${L.map((x) => x.v).join('; ')}.`); }
        const gone = Object.values(S.list).filter((p) => p.gone && env.last - p.i <= 20).map((p) => p.name);
        if (gone.length) state.push(`No longer in the story (do not bring them back as present): ${gone.join(', ')}.`);
        return state.length ? { state } : null;
    },
    chip: ({ k, v }) => ({ know: `💡 ${split(v)[0]} 알게 됨`, lie: `🤥 ${split(v)[0].replace('>', '→')} 숨김`, owe: `🧾 ${split(v)[0].replace('>', '→')} 빚`, role: `🎖 ${split(v)[0]} ${split(v)[1]}`, alias: `🏷 ${split(v)[0]} = ${split(v)[1]}`, seed: `🌱 ${split(v)[0]} ${split(v)[1]}` }[k]) ?? (k === 'call' ? `🗣 ${split(v)[0].replace('>', '→')} 「${split(v)[1]}」` : k === 'npc' ? `👤 ${split(v)[0]}` : `🕊 ${split(v)[0]}`),
    widget(S) {
        const L = Object.values(S.list).filter((p) => !p.gone).sort((a, b) => b.i - a.i).slice(0, 4);
        return L.length ? `<div class="mb4-people">${L.map((p) => person(p.name, p.about)).join('')}</div>` : '';
    },
    render(el, api) {
        const S = api.state(), st = api.store, here = api.env.peek('scene')?.with ?? [];
        st.notes ??= {};
        st.alias = st.alias && typeof st.alias === 'object' ? st.alias : {};
        const near = closeness(api.env.peek('bonds'), api.env.peek('heart'), api.env.user);
        const showAt = Number(api.env.peekStore?.('heart')?.showAt) || SHOW_AT;
        // only people who matter: in the scene now, or 💗 애정 at the bar (the rest folded); without 💗 the closest 8
        const listOf = (rows) => { const sp = byHeart(rows.map(([n]) => n), api.env.peek('heart'), api.env.user, here, showAt); if (!sp) return foldRest(rows.map(([, h]) => h)); const H = Object.fromEntries(rows); return foldUnder(sp.shown.map((n) => H[n]), sp.rest.map((n) => H[n]), showAt); };
        const L = Object.values(S.list).sort((a, b) => (here.includes(b.name) - here.includes(a.name)) || (near(b.name) - near(a.name)) || b.i - a.i);
        const calls = (n) => Object.entries(S.calls ?? {}).filter(([d]) => d.startsWith(`${n}>`) || d.endsWith(`>${n}`)).map(([d, c]) => `<span class="mb4-chip">${esc(d.replace('>', ' → '))} 「${esc(c.v)}」</span>`).join('');
        const merge = lookalikes(L.map((p) => p.name)).filter(([a, b]) => !st.alias[b.toLowerCase()] && !st.alias[a.toLowerCase()]);
        el.innerHTML = (merge.length ? card('🔀 같은 사람인가요?', merge.slice(0, 4).map(([a, b]) => `<div class="mb4-row"><span class="mb4-row-v">${esc(a)} · ${esc(b)}</span><button class="mb4-btn ghost sm" data-act="merge" data-v="${esc(`${b}|${a}`)}">하나로</button></div>`).join(''), 'warn') : '')
            + (L.length ? listOf(L.map((p) => [p.name, card('', `
            ${person(p.name, p.about || '아직 소개가 없어요', `${here.includes(p.name) ? pill('지금 여기', 'good') : ''}${p.gone ? pill('떠남', 'bad') : ''}`)}
            ${p.seen?.length ? `<p class="mb4-hint">다르게 적힌 이름: ${esc(p.seen.join(', '))}</p>` : ''}
            ${(p.facts ?? []).length > 1 ? `<div class="mb4-row"><span class="mb4-row-k">📜 전에 적힌 것</span><span class="mb4-row-v">${esc(p.facts.slice(0, -1).reverse().join(' · '))}</span></div>` : ''}
            ${Number.isFinite(api.env.last) && Number.isFinite(p.i) ? `<p class="mb4-hint">마지막으로 적힌 때: ${api.env.last - p.i <= 0 ? '방금 답' : `${api.env.last - p.i}메시지 전`}</p>` : ''}
            ${S.roles?.[p.name] ? `<div class="mb4-row"><span class="mb4-row-k">🎖 직위</span><span class="mb4-row-v">${esc(S.roles[p.name].v)}</span></div>` : ''}
            ${S.seeds?.[p.name]?.length ? `<div class="mb4-row"><span class="mb4-row-k">🌱 취향 · 버릇</span><span class="mb4-row-v">${esc(S.seeds[p.name].map((x) => x.v).join(' · '))}</span></div>` : ''}
            ${S.knows?.[p.name]?.length ? `<div class="mb4-row"><span class="mb4-row-k">💡 알게 된 것</span><span class="mb4-row-v">${esc(S.knows[p.name].map((x) => x.v).join(' · '))}</span></div>` : ''}
            ${Object.entries(S.lies ?? {}).filter(([d]) => d.startsWith(`${p.name}>`)).map(([d, L]) => `<div class="mb4-row"><span class="mb4-row-k">🤥 ${esc(d.split('>')[1])}에게 숨김</span><span class="mb4-row-v">${esc(L.map((x) => x.v).join(' · '))}</span></div>`).join('')}
            ${Object.entries(S.owes ?? {}).filter(([d]) => d.startsWith(`${p.name}>`)).map(([d, L]) => `<div class="mb4-row"><span class="mb4-row-k">🧾 ${esc(d.split('>')[1])}에게 빚 · 은혜</span><span class="mb4-row-v">${esc(L.map((x) => x.v).join(' · '))}</span></div>`).join('')}
            ${calls(p.name) ? `<div class="mb4-chips" style="margin:6px 0">${calls(p.name)}</div>` : ''}
            <input class="mb4-input" data-act="memo" data-v="${esc(p.name)}" maxlength="120" placeholder="내 메모 (AI도 같이 봐요)" value="${esc(st.notes[p.name] ?? '')}">
            <details class="mb4-card mb4-edcard" style="margin-top:8px"><summary>✏️ 직접 고치기</summary>
                <label class="mb4-label">소개<input class="mb4-input" data-pf="about" data-n="${esc(p.name)}" maxlength="100" value="${esc(p.about ?? '')}"></label>
                <label class="mb4-label">직위 · 신분<input class="mb4-input" data-pf="role" data-n="${esc(p.name)}" maxlength="60" value="${esc(S.roles?.[p.name]?.v ?? '')}"></label>
                <label class="mb4-label">취향 · 버릇 더하기<input class="mb4-input" data-pf="seed" data-n="${esc(p.name)}" maxlength="80" placeholder="예: 단 걸 싫어함"></label>
                <label class="mb4-label">다른 이름 더하기<input class="mb4-input" data-pf="alias" data-n="${esc(p.name)}" maxlength="40" placeholder="별명 · 본명"></label>
                <div class="mb4-btnrow"><input class="mb4-input" data-pf="callto" data-n="${esc(p.name)}" maxlength="40" placeholder="누구를"><input class="mb4-input" data-pf="callas" data-n="${esc(p.name)}" maxlength="40" placeholder="뭐라고 부르나"></div>
                <div class="mb4-btnrow"><button class="mb4-btn" data-act="pfix" data-v="${esc(p.name)}">고치기</button><button class="mb4-btn ghost" data-act="hide" data-v="${esc(p.name)}">🗑 지우기</button><button class="mb4-btn ghost" data-act="gone" data-v="${esc(p.name)}">${p.gone ? '↩ 돌아왔어요' : '👋 이야기에서 떠남'}</button></div>
            </details>`)])) : empty('👥', '아직 만난 사람이 없어요', '새 인물이 나오면 여기 생겨요'))
            + (Object.keys(st.hide ?? {}).length ? card('🗑 지운 사람', `<div class="mb4-chips">${Object.keys(st.hide).map((n) => `<button class="mb4-btn ghost sm" data-act="unhide" data-v="${esc(n)}">↩ ${esc(n)}</button>`).join('')}</div>${hint('누르면 되살아나요. 이야기에 다시 나와도 저절로 돌아와요.')}`) : '')
            + card('＋ 사람 더하기', `<div class="mb4-btnrow"><input class="mb4-input" data-f="nname" maxlength="40" placeholder="이름"><input class="mb4-input" data-f="nabout" maxlength="100" placeholder="어떤 사람"><button class="mb4-btn ghost" data-act="padd">넣기</button></div>`)
            + card('🔀 이름 합치기', `${Object.keys(st.alias).length ? Object.entries(st.alias).map(([k, v]) => `<div class="mb4-row"><span class="mb4-row-v">${esc(k)} → ${esc(v)}</span><button class="mb4-x" data-act="unalias" data-v="${esc(k)}" aria-label="풀기">✕</button></div>`).join('') : ''}
                <div class="mb4-btnrow"><input class="mb4-input" data-f="from" maxlength="40" placeholder="다른 이름 (예: 별명)"><input class="mb4-input" data-f="to" maxlength="40" placeholder="원래 이름"><button class="mb4-btn ghost" data-act="alias">합치기</button></div>`)
            + hint('소개는 AI 답에서 읽어 와요. 대소문자 · 조사 · 「간호사 벨」=「벨」처럼 같은 사람은 저절로 합쳐요. 한 글자만 다른 이름은 위에서 물어봐요.');
        const save = () => { api.save(); api.redraw(); };
        acts(el, {
            memo: (_v, inp) => { st.notes[inp.dataset.v] = inp.value.trim(); api.save(); },
            merge: (v) => { const [from, to] = v.split('|'); st.alias[from.toLowerCase()] = to; save(); },
            alias: () => { const from = (el.querySelector('[data-f="from"]').value ?? '').trim(), to = (el.querySelector('[data-f="to"]').value ?? '').trim(); if (from && to && from !== to) { st.alias[from.toLowerCase()] = to; save(); } },
            unalias: (k) => { delete st.alias[k]; save(); },
            hide: (n) => { (st.hide ??= {})[n] = Math.max(api.env.last ?? 0, S.list[n]?.i ?? 0); api.toast(`${n}을(를) 목록에서 지웠어요.`); save(); },
            unhide: (n) => { if (st.hide) delete st.hide[n]; save(); },
            pfix: (n) => {
                const g = (k) => String(el.querySelector(`[data-pf="${k}"][data-n="${CSS.escape(n)}"]`)?.value ?? '').trim(), P = S.list[n] ?? {};
                let did = 0;
                if (g('about') && g('about') !== (P.about ?? '')) did += api.fix('npc', `${n}=${g('about')}`) ? 1 : 0;
                if (g('role') && g('role') !== (S.roles?.[n]?.v ?? '')) did += api.fix('role', `${n}=${g('role')}`) ? 1 : 0;
                if (g('seed')) did += api.fix('seed', `${n}=${g('seed')}`) ? 1 : 0;
                if (g('alias')) did += api.fix('alias', `${n}=${g('alias')}`) ? 1 : 0;
                if (g('callto') && g('callas')) did += api.fix('call', `${n}>${g('callto')}=${g('callas')}`) ? 1 : 0;
                if (did) api.toast('고쳤어요.');
            },
            gone: (n) => { if (S.list[n]?.gone) api.fix('npc', `${n}=${S.list[n].about || 'back in the story'}`); else api.fix('gone', `${n}=left the story for good`); },
            padd: () => { const n = String(el.querySelector('[data-f="nname"]')?.value ?? '').trim(), a = String(el.querySelector('[data-f="nabout"]')?.value ?? '').trim(); if (n && a) api.fix('npc', `${n}=${a}`); else api.toast('이름과 어떤 사람인지 적어 주세요.'); },
        });
    },
};
