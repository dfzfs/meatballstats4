// 👕 Look: what each person is wearing and what shape they are in, so clothes and injuries do not reset.
// Ported from the third generation's look reading: lasting marks (a scar, a tattoo) that never reset, and what each
// person carries (the second generation's person sheet kept items per person).
import { clip } from '../core/text.js';
import { resolve } from '../core/names.js';

// seating/position: only while two or more people share a place (fails open when the scene app is off)
const shared = (_S, env) => { const w = env?.peek?.('scene')?.with; return !Array.isArray(w) || w.length >= 1; };
import { esc, card, person, empty, hint, row } from '../ui/kit.js';

const split = (v) => { const i = v.indexOf('='); return i < 0 ? null : [v.slice(0, i).trim(), v.slice(i + 1).trim()]; };
const HEALED = /^(healed|fine|recovered|sober|rested)\b/i;

export default {
    api: 1,
    id: 'look',
    name: '차림새',
    icon: '👕',
    color: '#577590',
    cost: 'low',
    desc: '누가 뭘 입고 있는지, 어디를 다쳤는지 기억해서 다음 답에서 옷이나 상처가 멋대로 바뀌지 않게 해요.',
    keys: [
        { id: 'wear', line: 'wear: Name=what they wear now (when described or changed)' },
        { id: 'body', line: 'body: Name=hurt|drunk|exhausted|sick + a few words, or Name=healed' },
        { id: 'mark', line: 'mark: Name=a lasting mark (scar, tattoo, burn), first time shown', quote: true },
        { id: 'carry', line: 'carry: Name=thing kept on them, or Name=-thing when gone' },
        { id: 'pos', line: 'pos: Name=a few words (sitting|standing|lying, left/right of whom, how close)', when: shared },
    ],
    start: () => ({ who: {} }),
    check: ({ v }) => { const s = split(v); return !!s && s[0].length > 0 && s[0].length <= 40 && s[1].length > 0; },
    reduce(S, { k, v, i }, env) {
        const [raw0, rest] = split(v), raw = env?.user && /^(?:\{\{user\}\}|user|you|the user|player|protagonist)$/i.test(raw0.trim()) ? env.user : raw0, name = resolve(Object.keys(S.who), raw) ?? raw.trim();
        const P = (S.who[name] ??= { name, wear: '', body: '', marks: [], carry: [], pos: '', i });
        P.marks ??= []; P.carry ??= [];
        P.i = i;
        if (k === 'pos') P.pos = clip(rest, 80);
        else if (k === 'wear') P.wear = clip(rest, 120);
        else if (k === 'body') P.body = HEALED.test(rest) ? '' : clip(rest, 80);
        else if (k === 'mark') { const m = clip(rest, 60); if (!P.marks.some((x) => x.toLowerCase() === m.toLowerCase())) P.marks.push(m); if (P.marks.length > 6) P.marks.shift(); }
        else if (k === 'carry') {
            const off = /^[-−]/.test(rest), t = clip(rest.replace(/^[-−]\s*/, ''), 40), low = t.toLowerCase();
            P.carry = P.carry.filter((x) => !(x.toLowerCase() === low || x.toLowerCase().includes(low) || low.includes(x.toLowerCase())));
            if (!off) { P.carry.push(t); if (P.carry.length > 8) P.carry.shift(); }
        }
    },
    stateLines: (S) => Object.values(S.who).slice(-6).flatMap((p) => [p.wear ? `wear: ${p.name}=${p.wear}` : '', p.body ? `body: ${p.name}=${p.body}` : '', p.marks?.length ? `marks: ${p.name}=${p.marks.join(', ')}` : '', p.carry?.length ? `carry: ${p.name}=${p.carry.join(', ')}` : '', p.pos ? `pos: ${p.name}=${p.pos}` : '']),
    note(S, env) {
        const here = env.peek('scene')?.with ?? null;
        const pick = Object.values(S.who).filter((p) => (p.wear || p.body || p.marks?.length || p.carry?.length || p.pos) && (here ? here.includes(p.name) || p.name === env.user : env.last - p.i <= 10)).slice(0, 5);
        return pick.length ? { state: pick.map((p) => `${p.name}${p.wear ? ` is wearing ${p.wear}` : ''}${p.wear && p.body ? ';' : ''}${p.body ? ` condition: ${p.body}` : ''}${p.marks?.length ? `${p.wear || p.body ? ';' : ''} lasting marks: ${p.marks.join(', ')}` : ''}${p.carry?.length ? `${p.wear || p.body || p.marks?.length ? ';' : ''} carries: ${p.carry.join(', ')}` : ''}${p.pos ? `; position: ${p.pos}` : ''}. Keep this unless the story changes it.`) } : null;
    },
    chip: ({ k, v }) => { const s = split(v) ?? ['', '']; return k === 'pos' ? `🪑 ${s[0]} ${s[1]}` : k === 'wear' ? `👕 ${s[0]} 옷` : k === 'mark' ? `✒ ${s[0]} 흔적` : k === 'carry' ? `🎒 ${s[0]} ${s[1]}` : `🩹 ${s[0]} ${HEALED.test(s[1]) ? '나음' : '몸 상태'}`; },
    widget(S) {
        const L = Object.values(S.who).filter((p) => p.body).slice(0, 3);
        return L.map((p) => `<div class="mb4-row"><span class="mb4-row-k">🩹 ${esc(p.name)}</span><span class="mb4-row-v">${esc(p.body)}</span></div>`).join('');
    },
    widgetTitle: '몸 상태',
    render(el, api) {
        const L = Object.values(api.state().who).sort((a, b) => b.i - a.i);
        el.innerHTML = L.length ? L.map((p) => card('', `${person(p.name)}${row('👕', '옷', esc(p.wear || '아직 몰라요'))}${row('🩹', '몸', esc(p.body || '괜찮아요'))}${p.marks?.length ? row('✒', '흔적', esc(p.marks.join(', '))) : ''}${p.carry?.length ? row('🎒', '지닌 것', esc(p.carry.join(', '))) : ''}${p.pos ? row('🪑', '자리 · 자세', esc(p.pos)) : ''}`)).join('') + hint('옷이나 몸 상태가 글에 나오면 저절로 바뀌어요.')
            : empty('👕', '아직 적힌 차림새가 없어요', '옷이나 상처가 묘사되면 여기 쌓여요');
    },
};
