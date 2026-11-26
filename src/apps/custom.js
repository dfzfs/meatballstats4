// 🧩 My own fields: the person names things they want kept track of (a number or a few words) and says in one line
// what each means. Load design: ONE reader key for all of them («my»), listed only while at least one field exists,
// with the field list travelling as that key's rule — and a field marked «가끔만» is asked only every few replies.
import { clip } from '../core/text.js';
import { slow } from '../core/cadence.js';
import { esc, card, hint, acts, val, empty, bar, pill } from '../ui/kit.js';

const MAX = 8;
const fields = (env) => (Array.isArray(env?.store?.fields) ? env.store.fields : []);
const find = (env, name) => { const n = String(name).trim().toLowerCase(); return fields(env).find((f) => f.name.toLowerCase() === n || f.en?.toLowerCase() === n); };
const due = slow({ every: 4 });
// the fields worth asking about in this reply (a slow field waits for its turn)
const asked = (S, env) => fields(env).filter((f) => f.on !== false && (!f.slow || due(S, env)));
const numOf = (f, cur, v) => { const t = String(v).trim(), m = t.match(/^([+-])\s*(\d+(?:\.\d+)?)$/); const n = m ? (Number(cur) || 0) + (m[1] === '-' ? -1 : 1) * +m[2] : parseFloat(t); return Number.isFinite(n) ? Math.max(f.min ?? 0, Math.min(f.max ?? 100, Math.round(n))) : null; };

export default {
    api: 1, id: 'custom', name: '내 칸', icon: '🧩', color: '#5e60ce', cost: 'low',
    desc: '내가 정한 것을 따로 적게 해요(예: 명성, 마나, 수상함, 오늘의 기분). 칸을 만들 때만 읽기에 한 줄이 늘어요.',
    keys: [{ id: 'my', line: 'my: FieldName=new value   (only the fields listed in the rules; numbers as a new number or +n / -n)', when: (S, env) => asked(S, env).length > 0,
        rules: (env) => { const L = fields(env).filter((f) => f.on !== false); return L.length ? [`"my" fields — write a line only when the text clearly changes one: ${L.map((f) => `${f.en || f.name} (${f.type === 'num' ? `number ${f.min ?? 0}-${f.max ?? 100}` : 'a few words'}: ${f.what || 'as named'})`).join('; ')}.`] : []; } }],
    start: (env) => ({ v: Object.fromEntries(fields(env).map((f) => [f.name, f.type === 'num' ? Number(f.start ?? 0) : String(f.start ?? '')])), log: [] }),
    check({ v }, env) { const i = String(v).indexOf('='); if (i < 0) return false; const f = find(env, v.slice(0, i)); return !!f && (f.type !== 'num' || numOf(f, 0, v.slice(i + 1)) !== null); },
    reduce(S, { v, i }, env) {
        const at = String(v).indexOf('='), f = find(env, v.slice(0, at)); if (!f) return;
        const raw = v.slice(at + 1).trim(), old = S.v[f.name];
        S.v[f.name] = f.type === 'num' ? numOf(f, old, raw) ?? old : clip(raw, 80);
        if (S.v[f.name] !== old) { S.log.push({ n: f.name, from: old, to: S.v[f.name], i }); if (S.log.length > 30) S.log.shift(); }
    },
    stateLines: (S, env) => { const L = fields(env).filter((f) => f.on !== false); return L.length ? [`my: ${L.map((f) => `${f.en || f.name}=${S.v[f.name] ?? ''}`).join(', ')}`] : []; },
    note(S, env) {
        const L = fields(env).filter((f) => f.on !== false && f.tell !== false && S.v[f.name] !== undefined && S.v[f.name] !== '');
        return L.length ? { state: [`Tracked by the user: ${L.map((f) => `${f.en || f.name}${f.what ? ` (${f.what})` : ''} = ${S.v[f.name]}${f.type === 'num' ? `/${f.max ?? 100}` : ''}`).join('; ')}. Keep the story consistent with these; do not state the numbers.`] } : null;
    },
    hud: (S, env) => fields(env).filter((f) => f.on !== false && f.hud).slice(0, 2).map((f) => `${f.icon || '🧩'} ${S.v[f.name] ?? ''}`),
    chip: ({ v }) => `🧩 ${clip(String(v).replace('=', ' '), 22)}`,
    widget: (S, env) => fields(env).filter((f) => f.on !== false).slice(0, 4).map((f) => (f.type === 'num' ? `<div class="mb4-gauge"><span>${f.icon || '🧩'} ${esc(f.name)}</span><span class="mb4-meter"><i class="mid" style="width:${Math.round(((S.v[f.name] ?? 0) - (f.min ?? 0)) / Math.max(1, (f.max ?? 100) - (f.min ?? 0)) * 100)}%"></i></span><b>${S.v[f.name] ?? 0}</b></div>` : `<div class="mb4-row"><span class="mb4-row-k">${f.icon || '🧩'} ${esc(f.name)}</span><span class="mb4-row-v">${esc(S.v[f.name] ?? '')}</span></div>`)).join(''),
    widgetTitle: '내 칸',
    render(el, api) {
        const S = api.state(), st = api.store, env = api.env;
        st.fields = Array.isArray(st.fields) ? st.fields : [];
        const F = st.fields;
        el.innerHTML = `${F.length ? F.map((f, n) => card(`${f.icon || '🧩'} ${esc(f.name)} ${f.on === false ? pill('쉼', 'bad') : ''}${f.slow ? pill('가끔만') : ''}`, `
            ${f.type === 'num' ? `<div class="mb4-gauges one"><div class="mb4-gauge"><span>${f.min ?? 0}–${f.max ?? 100}</span>${bar(((S.v[f.name] ?? 0) - (f.min ?? 0)) / Math.max(1, (f.max ?? 100) - (f.min ?? 0)) * 100, 'mid')}<b>${S.v[f.name] ?? 0}</b></div></div>` : `<p>${esc(S.v[f.name] || '아직 없어요')}</p>`}
            <small class="mb4-dim">${esc(f.what || '')}</small>
            <div class="mb4-btnrow tight"><input class="mb4-input" data-f="v${n}" placeholder="${f.type === 'num' ? '새 숫자 또는 +5 / -3' : '새 값'}" maxlength="80"><button class="mb4-btn ghost sm" data-act="fix" data-v="${n}">고치기</button></div>
            <div class="mb4-btnrow tight"><button class="mb4-btn ${f.slow ? '' : 'ghost '}sm" data-act="flag" data-v="${n}|slow">🐢 가끔만 묻기</button><button class="mb4-btn ${f.tell !== false ? '' : 'ghost '}sm" data-act="flag" data-v="${n}|tell">🤖 AI에 알리기</button><button class="mb4-btn ${f.hud ? '' : 'ghost '}sm" data-act="flag" data-v="${n}|hud">📌 상태 줄에</button><button class="mb4-btn ${f.on === false ? '' : 'ghost '}sm" data-act="flag" data-v="${n}|on">${f.on === false ? '▶ 다시' : '⏸ 쉬기'}</button><button class="mb4-x" data-act="del" data-v="${n}" aria-label="지우기">✕</button></div>`)).join('') : empty('🧩', '아직 만든 칸이 없어요', '아래에서 이름과 뜻을 적어 만들어 보세요')}
        ${F.length < MAX ? card('칸 만들기', `<div class="mb4-btnrow"><input class="mb4-input" data-f="icon" maxlength="2" placeholder="🙂" style="max-width:56px"><input class="mb4-input" data-f="name" maxlength="20" placeholder="이름 (예: 명성)"></div>
            <input class="mb4-input" data-f="en" maxlength="20" placeholder="영어 이름 (예: fame) — 영어 이야기면 적어 주세요" style="margin-top:6px">
            <input class="mb4-input" data-f="what" maxlength="100" placeholder="무엇인지 한 줄, 영어면 더 잘 읽어요 (예: how well known she is in town)" style="margin-top:6px">
            <div class="mb4-btnrow"><select class="mb4-input" data-f="type"><option value="num">숫자</option><option value="text">글 (몇 낱말)</option></select><input class="mb4-input" data-f="start" maxlength="20" placeholder="처음 값"><input class="mb4-input mb4-short" data-f="min" type="number" placeholder="최소 0"><input class="mb4-input mb4-short" data-f="max" type="number" placeholder="최대 100"><button class="mb4-btn" data-act="add">만들기</button></div>`) : ''}
        ${S.log.length ? card('최근 바뀐 것', S.log.slice(-6).reverse().map((x) => `<div class="mb4-row"><span class="mb4-row-k">${esc(x.n)}</span><span class="mb4-row-v">${esc(String(x.from ?? ''))} → <b>${esc(String(x.to))}</b></span></div>`).join('')) : ''}
        ${hint(`칸은 ${MAX}개까지. 칸이 하나라도 있으면 답을 읽을 때 한 줄을 더 물어요(칸이 여러 개여도 한 줄). 「가끔만」은 네 번에 한 번만 물어요.`)}`;
        acts(el, {
            add: () => {
                const name = val(el, '[data-f="name"]'); if (!name || F.some((f) => f.name === name)) { api.toast('이름을 적어 주세요 (같은 이름은 안 돼요).'); return; }
                const type = val(el, '[data-f="type"]') === 'text' ? 'text' : 'num', start = val(el, '[data-f="start"]');
                F.push({ name: clip(name, 20), en: clip(val(el, '[data-f="en"]').replace(/[^A-Za-z ]/g, ''), 20), icon: val(el, '[data-f="icon"]'), what: clip(val(el, '[data-f="what"]'), 100), type, start: type === 'num' ? Number(start) || 0 : start, ...(() => { const lo = Number(val(el, '[data-f="min"]')), hi = Number(val(el, '[data-f="max"]')), mn = val(el, '[data-f="min"]') !== '' && Number.isFinite(lo) ? lo : 0, mx = val(el, '[data-f="max"]') !== '' && Number.isFinite(hi) && hi > mn ? hi : Math.max(mn + 1, 100); return { min: mn, max: mx }; })(), on: true });
                api.save(); api.redraw();
            },
            del: (n) => { F.splice(+n, 1); api.save(); api.redraw(); },
            flag: (v) => { const [n, k] = v.split('|'), f = F[+n]; if (k === 'on') f.on = f.on === false; else if (k === 'tell') f.tell = f.tell === false; else f[k] = !f[k]; api.save(); api.redraw(); },
            fix: (n) => { const f = F[+n], t = val(el, `[data-f="v${n}"]`); if (t) api.fix('my', `${f.en || f.name}=${t}`); },
        });
    },
};
