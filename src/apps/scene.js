// 🧭 Scene: when, where, who is present, weather. Small and common, so it lives in the core and loads only when on.
import { clip } from '../core/text.js';
import { skipInMessage } from '../core/skip.js';
import { applyTime, anchoredDate, dayKo } from '../core/clock.js';
import { newCal, parseTime, applyDate, readDate, FUZZY_NOM, V } from '../core/v3time.js';

// v3 ledger1 setDate: a date may jump far ahead only when this reply also said a long time passed
function setDate(S, p, force, i) {
    const cal = S.cal, r = applyDate(cal, p, force, S.longI === i ? 275 : 120);
    if (r !== 'kept' && cal.doy != null && !cal.fz) {
        const off = cal.n - cal.an;
        // a year the text names counts even when the date itself was already right (v3 kept years per reply instead)
        if (p.y != null) cal.y = p.y - Math.floor((cal.doy + off) / 365);
        // a full date with its weekday («November 17, 1525 (Saturday)»): the story's weekday from here on
        if (p.d != null && p.wd != null) cal.wd = ((p.wd - off) % 7 + 7) % 7;
    }
    return r;
}
// the scene's own fields follow the engine: day (1-based), the vague stretch
function sync(S) {
    const cal = S.cal;
    S.day = cal.n + 1;
    S.vague = !!cal.fz; S.fz = cal.fz ? { from: cal.fz.from + 1, unit: cal.fz.unit } : null;
    if (!cal.fz && cal.doy != null) S.anchor = { day: S.day, date: 'cal' };   // older code checks that a date is known
}
import { cueOr, slow } from '../core/cadence.js';
import { esc, row, card, person, hint, acts, val, TOD, TOD_KO, room } from '../ui/kit.js';

const names = (v) => String(v).split(/[,，、]/).map((x) => x.trim()).filter((x) => x && x.length <= 40);

export default {
    api: 1,
    id: 'scene',
    name: '장면',
    icon: '🧭',
    color: '#3a8ee6',
    cost: 'low',
    desc: '지금 언제 · 어디서 · 누구와 무슨 일인지 한눈에 요약해 두고, AI가 헷갈리지 않게 알려 줘요.',
    keys: [
        { id: 'time', line: 'time: +20min / +3h / +2d / +?d +?w +?mo (count unknown) and/or dawn|morning|noon|afternoon|evening|night|midnight' },
        { id: 'date', line: 'date: a date, weekday or season the text names' },
        { id: 'loc', line: 'loc: big place > smaller place > room' },
        { id: 'with', line: 'with: =Name, Name (all present) or +Name / -Name or =none' },
        { id: 'weather', line: 'weather: a word or two' },
        // NEXT-3: third-generation keys restored (v3 core/keys.js: near · mood)
        { id: 'near', line: 'near: Place — beside|above|below|inside|across|end of: Place', quote: true, when: cueOr(/beside|next to|above|below|under|inside|across|opposite|end of|upstairs|downstairs|behind|in front of|옆|위층|아래층|안쪽|맞은편|끝|건너편|뒤편/i, (S) => Object.keys(S?.near ?? {}).length > 0) },
        { id: 'mood', line: 'mood: a few words' },
        // A rolling summary («요약 느낌»): rides on the same reading, asked only every third exchange, kept as a timeline on screen.
        { id: 'gist', line: 'gist: one plain sentence — what is going on in the story right now (who is doing what, and why it matters)', when: slow({ every: 3, also: (S) => !S?.gist }) },
    ],
    rules: [
        '"with" = only people physically present at the end; vague time passed = +?d, never an invented number.',
    ],
    start: () => ({ gist: '', gists: [], near: {}, mood: '', day: 1, hrs: 0, tod: '', date: '', anchor: null, cal: newCal(), loc: '', with: [], weather: '', vague: false, fz: null, trail: [] }),
    check: ({ k, v }) => (k === 'loc' || k === 'date' || k === 'weather' ? v.length <= 120 : true),
    reduce(S, { k, v, i }) {
        if (k === 'near') { const m = String(v).match(/^(.+?)\s*[—–-]\s*(.+)$/); if (m) (S.near ??= {})[clip(m[1].trim(), 60)] = clip(m[2].trim(), 80); return; }
        if (k === 'mood') { S.mood = clip(v, 60); return; }
        if (k === 'gist') { S.gist = clip(v, 220); (S.gists ??= []).push({ v: S.gist, day: S.day, i }); if (S.gists.length > 40) S.gists.shift(); return; }
        if (k === 'time') {
            // time of day, hours and «night → morning» as before; the day count and the date follow the third generation's engine
            const cal = (S.cal ??= newCal()), was = S.day, t = parseTime(v, V);
            applyTime(S, v); S.todI = i;
            if (t.fuzzy || S.fz && !cal.fz) {
                const nom = FUZZY_NOM[t.fuzzy || S.fz?.unit] || FUZZY_NOM.d, RANK = { d: 0, w: 1, mo: 2, y: 3 }, u = t.fuzzy || S.fz?.unit || 'd';
                if (!cal.fz) cal.fz = { from: cal.n, unit: u, nom };
                else { cal.fz.nom += nom; if ((RANK[u] ?? 0) > (RANK[cal.fz.unit] ?? 0)) cal.fz.unit = u; }
                cal.n += nom;
            } else cal.n += Math.max(0, S.day - was);
            if ((t.days || 0) >= 30 || t.fuzzy === 'mo' || t.fuzzy === 'y') S.longI = i;   // a long skip lets a date jump far ahead
            if (t.date) setDate(S, t.date, false, i);
            sync(S);
        } else if (k === 'date') {
            // «!» in front: the person wrote it (✏️ 고치기) — it wins over the count
            const force = String(v).startsWith('!'), d = clip(String(v).replace(/^!\s*/, ''), 60), p = readDate(d);
            if (!p) return;                                   // nothing readable («spring»): kept as it was
            S.cal ??= newCal();
            const r = setDate(S, p, force, i);
            if (r !== 'kept') S.date = d;
            sync(S);
        }
        else if (k === 'weather') S.weather = clip(v, 40);
        else if (k === 'loc') {
            S.loc = clip(v, 120);
            if (S.trail.at(-1)?.loc !== S.loc) { S.trail.push({ loc: S.loc, day: S.day, i }); if (S.trail.length > 20) S.trail.shift(); }
        } else if (k === 'with') {
            const t = String(v).trim();
            // "nobody else": the reader writes it many ways ("(none)", "none", "=nobody", "alone") — seen live
            if (/^=?\s*\(?\s*(?:none|nobody|no one|alone|empty|-)?\s*\)?\s*$/i.test(t)) S.with = [];
            else if (t.startsWith('=')) S.with = names(t.slice(1)).filter((n) => !/^\(?(?:none|nobody|no one)\)?$/i.test(n)).slice(0, 12);
            else for (const part of t.split(/\s*[;/]\s*|\s+(?=[+-])/)) {
                const n = part.slice(1).trim();
                if (part.startsWith('+') && n && !S.with.includes(n)) S.with.push(n);
                if (part.startsWith('-')) S.with = S.with.filter((x) => x !== n);
            }
        }
    },
    stateLines: (S) => [
        `time: day ${S.day}${S.tod ? `, ${S.tod}` : ''}${S.date ? ` (${S.date})` : ''}`,
        S.loc ? `loc: ${S.loc}` : '',
        `with: ${S.with.length ? S.with.join(', ') : '(nobody recorded)'}`,
        S.weather ? `weather: ${S.weather}` : '',
        S.mood ? `mood: ${S.mood}` : '',
        S.gist ? `gist: ${S.gist}` : '',
        ...Object.entries(S.near ?? {}).slice(-4).map(([a, b]) => `near: ${a} — ${b}`),
    ],
    note(S, env) {
        const counted = !S.date && !S.vague && S.anchor?.date ? (() => { const t = anchoredDate(S); return t == null ? `${S.day - S.anchor.day} days after ${S.anchor.date}` : new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' }); })() : '';
        const when = [S.vague ? 'some time later' : `day ${S.day} of the story`, S.date || counted, S.tod].filter(Boolean).join(', ');
        const facts = [S.loc ? `Place: ${S.loc}.` : '', S.with.length ? `Present: ${S.with.join(', ')}.` : '', S.weather ? `Weather: ${S.weather}.` : '', S.mood ? `Mood: ${S.mood}.` : '', ...Object.entries(S.near ?? {}).filter(([a]) => S.loc.includes(a)).slice(0, 3).map(([a, b]) => `${a}: ${b}.`)].filter(Boolean).join(' ');
        const has = S.loc || S.with.length || S.day > 1 || S.tod || S.date;
        // a time skip written in the person's own message: what is recorded is the state BEFORE the gap
        // (only while the reply to that message is still to be written, or is being written again — once it is there, the gap is behind us)
        const due = env?.pending !== false || env?.gen === 'swipe' || env?.gen === 'regenerate';
        const skip = env?.cfg?.skips === false || !due ? null : skipInMessage(env?.lastUser?.() ?? '');
        if (skip) {
            const now = [`Time skip: ${skip.text || 'as far as the user asks'}. This reply opens after that gap — its very first sentence is already there, with the new time (and the place, if it changed) made plain. The previous scene is over: do not finish it or answer its last line. What happened in between gets one passing line at most.`];
            return { state: has ? [`Before the time skip (past; this reply does not start here — time of day, place, clothes and mood may all have changed): ${when}. ${facts}`.trim()] : [], now };
        }
        const recap = env?.cfg?.recap && (S.gists ?? []).length > 1 ? [`Story so far, oldest first: ${S.gists.slice(-4, -1).map((g) => g.v).join(' → ')}`] : [];
        return has ? { state: [`Now: ${when}${S.vague ? ' (exact count unknown)' : ''}. ${facts}`.trim(), ...recap] } : null;
    },
    hud: (S, env) => { const d = S.date || dayKo(S, S.day, env?.peekStore?.('calendar')?.start); const t = [d ? `📆 ${d}` : '', S.tod ? `🕰 ${TOD_KO[S.tod]}` : ''].filter(Boolean).join(' · '); return [t, S.loc ? `📍 ${room(S.loc)}` : '']; },
    chip({ k, v }) {
        if (k === 'time') return `🕰 ${v.replace(/\b(dawn|morning|noon|afternoon|evening|night|midnight)\b/g, (w) => TOD_KO[w])}`;
        if (k === 'loc') return `📍 ${room(v)}`;
        if (k === 'with') return `👥 ${v.replace(/^=/, '').replace(/^\(?\s*(?:none|nobody|no one|alone)\s*\)?$/i, '아무도 없음')}`;
        if (k === 'weather') return `⛅ ${v}`;
        if (k === 'mood') return `🌫 ${v}`;
        if (k === 'gist') return '📝 요약';
        if (k === 'near') return `🧭 ${v}`;
        return `📆 ${v}`;
    },
    widget: (S) => (S.with.length ? `<div class="mb4-people">${S.with.slice(0, 6).map((n) => person(n)).join('')}</div>` : ''),
    widgetTitle: '같이 있는 사람',
    render(el, api) {
        const S = api.state(), G = S.gists ?? [];
        el.innerHTML = `<div class="mb4-hero mb4-sum"><small>지금 이야기는</small><p class="mb4-sum-t">${esc(S.gist || '아직 요약이 없어요. 답이 몇 번 오가면 한 줄로 적어 둬요.')}</p><div class="mb4-hero-m">${[(S.date || dayKo(S, S.day, api.env.peekStore?.('calendar')?.start)) ? `📆 ${esc(S.date || dayKo(S, S.day, api.env.peekStore?.('calendar')?.start))}` : '', S.tod ? `🕰 ${TOD_KO[S.tod]}` : '', S.loc ? `📍 ${esc(room(S.loc))}` : '', S.with.length ? `👥 ${S.with.map(esc).join(', ')}` : '👤 혼자', S.weather ? `⛅ ${esc(S.weather)}` : '', S.mood ? `🌫 ${esc(S.mood)}` : ''].filter(Boolean).join('<i>·</i>')}</div></div>
        ${G.length > 1 ? card('📜 이야기 흐름', `<ol class="mb4-trail">${G.slice(-12).reverse().map((g) => `<li><b>${esc(g.v)}</b>${dayKo(S, g.day, api.env.peekStore?.('calendar')?.start) ? `<small>${dayKo(S, g.day, api.env.peekStore?.('calendar')?.start)}</small>` : ''}</li>`).join('')}</ol>`) : ''}
        ${card('', `
            ${row('📆', '날', `${esc(S.date || dayKo(S, S.day, api.env.peekStore?.('calendar')?.start) || '아직 몰라요')}${S.vague ? ' · 며칠인지 흐림' : ''}`)}
            ${row('🕰', '때', esc(TOD_KO[S.tod] ?? '아직 몰라요'))}
            ${row('📍', '장소', esc(S.loc || '아직 몰라요'))}
            ${row('⛅', '날씨', esc(S.weather || '아직 몰라요'))}
            ${row('🌫', '분위기', esc(S.mood || '아직 몰라요'))}`)}
        ${Object.keys(S.near ?? {}).length ? card('장소끼리 위치', Object.entries(S.near).map(([a, b]) => row('🧭', a, esc(b))).join('')) : ''}
        ${card('같이 있는 사람', S.with.length ? `<div class="mb4-people">${S.with.map((n) => person(n, '', `<button class="mb4-x" data-act="out" data-v="${esc(n)}" aria-label="빼기">✕</button>`)).join('')}</div>` : hint('지금은 혼자예요.'))}
        ${card('지나온 곳', S.trail.length ? `<ol class="mb4-trail">${S.trail.slice(-8).reverse().map((t) => `<li><b>${esc(room(t.loc))}</b><small>${[dayKo(S, t.day, api.env.peekStore?.('calendar')?.start), esc(t.loc)].filter(Boolean).join(' · ')}</small></li>`).join('')}</ol>` : hint('장소가 바뀌면 여기 쌓여요.'))}
        <details class="mb4-card mb4-edcard"><summary>✏️ 틀린 곳 직접 고치기</summary>
            <label class="mb4-label">장소<input class="mb4-input" data-f="loc" maxlength="120" placeholder="큰 곳 > 작은 곳 > 방" value="${esc(S.loc)}"></label>
            <label class="mb4-label">때<select class="mb4-input" data-f="tod"><option value="">그대로</option>${TOD.map((t) => `<option value="${t}" ${t === S.tod ? 'selected' : ''}>${TOD_KO[t]}</option>`).join('')}</select></label>
            <label class="mb4-label">며칠째 (앞으로만 넘길 수 있어요)<input class="mb4-input mb4-short" data-f="day" type="number" min="${S.day}" max="${S.day + 3650}" value="${S.day}"></label>
            <label class="mb4-label">날짜 · 요일 · 계절<input class="mb4-input" data-f="date" maxlength="60" placeholder="예: 3월 2일 월요일" value="${esc(S.date)}"></label>
            <label class="mb4-label">날씨<input class="mb4-input" data-f="weather" maxlength="60" value="${esc(S.weather)}"></label>
            <label class="mb4-label">분위기 · 기분<input class="mb4-input" data-f="mood" maxlength="60" value="${esc(S.mood ?? '')}"></label>
            <label class="mb4-label">같이 있는 사람 (쉼표로)<input class="mb4-input" data-f="with" value="${esc(S.with.join(', '))}"></label>
            <label class="mb4-label">요약 한 줄<input class="mb4-input" data-f="gist" maxlength="220" value="${esc(S.gist)}"></label>
            <div class="mb4-btnrow"><button class="mb4-btn" data-act="save">고치기</button><button class="mb4-btn ghost" data-act="day">하루 넘기기</button></div>
            ${hint('고친 값은 마지막 답에 붙어요. 그 답을 다시 뽑으면 같이 사라져요.')}
        </details>
        <label class="mb4-sw"><span><b>요약을 AI에게도 알려 주기</b><small>지난 흐름 세 줄을 쪽지에 넣어요. 긴 이야기에서 앞일을 덜 잊어요. 끄면 화면에만 보여요.</small></span><input type="checkbox" data-act="recap" ${api.cfg.recap ? 'checked' : ''}><i></i></label>
        <label class="mb4-sw"><span><b>내 글의 시간 건너뛰기 알아보기</b><small>내 메시지에 「다음 날」 「일주일 뒤」가 있으면 답이 그 뒤에서 시작하게 해요.</small></span><input type="checkbox" data-act="skips" ${api.cfg.skips !== false ? 'checked' : ''}><i></i></label>`;
        acts(el, {
            out: (n) => { api.fix('with', `-${n}`); },
            recap: (_v, b) => { api.cfg.recap = b.checked; api.save(); },
            skips: (_v, b) => { api.cfg.skips = b.checked; api.save(); },
            day: () => { api.fix('time', '+1d morning'); },
            save: () => {
                const loc = val(el, '[data-f="loc"]'), tod = val(el, '[data-f="tod"]'), w = val(el, '[data-f="with"]');
                if (loc && loc !== S.loc) api.fix('loc', loc);
                if (tod && tod !== S.tod) api.fix('time', tod);
                if (w !== S.with.join(', ')) api.fix('with', `=${w}`);
                const dn = Math.round(Number(val(el, '[data-f="day"]'))); if (Number.isFinite(dn) && dn > S.day) api.fix('time', `+${Math.min(dn - S.day, 3650)}d`);
                for (const f of ['date', 'weather', 'mood']) { const x = val(el, `[data-f="${f}"]`); if (x && x !== (S[f] ?? '')) api.fix(f, f === 'date' ? `!${x}` : x); }
                const g = val(el, '[data-f="gist"]'); if (g && g !== S.gist) api.fix('gist', g);
                api.toast('고쳤어요.');
            },
        });
    },
};
