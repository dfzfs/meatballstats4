// 🍀 Today's luck — ONE source for every app that cares (🎲 dice, 🎯 choices, 🔮 fortune). Code only, no model call.
// Story day = same luck all day. Strongest source wins: a fortune drawn today (🔮) > the day's luck roll (🎲) > the
// quiet luck of the day itself (flavour only: it never moves a roll).
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// one good and one bad kind of act per story day
export const ACTS = [
    { k: 'talk', good: '먼저 말을 걸면', bad: '말을 아낄 것', re: /말|인사|묻|물어|부르|대화|talk|ask|tell/i },
    { k: 'buy', good: '물건을 사면', bad: '지갑 조심', re: /사다|산다|사 |구매|주세요|buy|pay/i },
    { k: 'rest', good: '푹 쉬면', bad: '게으름 조심', re: /쉬|잠|눕|휴식|rest|sleep/i },
    { k: 'move', good: '밖으로 나가면', bad: '먼 길 조심', re: /가자|간다|이동|향하|나가|go |leave|walk/i },
    { k: 'gift', good: '선물을 건네면', bad: '선물은 다음에', re: /선물|건네|gift|give/i },
    { k: 'bold', good: '과감하게 나서면', bad: '다툼 조심', re: /싸우|덤비|맞서|공격|뛰어|과감|fight|attack|charge/i },
    { k: 'quiet', good: '한발 물러서면', bad: '피하지 말 것', re: /거절|피하|물러|숨|도망|참|avoid|hide|refuse/i },
];
// 🔮 fortune cards, by index (kept in step with fortune.js CARDS): stars, name
export const FORTUNE_STARS = [[5, '대길'], [4, '길'], [3, '평'], [2, '흉'], [1, '대흉'], [4, '인연'], [4, '재물'], [4, '발견']];

// -> null (no 🧭 scene: no story day) | { day, stars 1-5, tier 'great'|'awful'|'', src 'fortune'|'dice'|'day', name, n (roll bonus −2..+2), good, bad, why }
// self: the calling app's id — its own store is read directly (peekStore never hands an app its own store).
export function todayLuck(env, self = '') {
    const day = env?.peek?.('scene')?.day;
    if (day == null) return null;
    const store = (id) => (id === self ? env.store : env.peekStore?.(id)) ?? null;
    const h = (k) => fnv(`${env.char ?? ''}:${day}:${k}`);
    const good = ACTS[h('g') % ACTS.length];
    let bad = ACTS[h('b') % ACTS.length]; if (bad.k === good.k) bad = ACTS[(ACTS.indexOf(good) + 3) % ACTS.length];
    let stars = 1 + (h('s') % 5), tier = '', src = 'day', name = '';
    const D = store('dice');
    if (D?.luck?.day === day && D.luck.d) { const r = D.luck.d; stars = Math.max(1, Math.ceil(r / 4)); tier = r === 20 ? 'great' : r === 1 ? 'awful' : ''; src = 'dice'; name = `🎲 ${r}`; }
    const F = store('fortune');
    if (F?.day === day && FORTUNE_STARS[F.card]) { [stars, name] = FORTUNE_STARS[F.card]; tier = stars === 5 ? 'great' : stars === 1 ? 'awful' : ''; src = 'fortune'; name = `🔮 ${name}`; }
    const n = src === 'day' ? 0 : tier === 'great' ? 2 : tier === 'awful' ? -2 : stars >= 4 ? 1 : stars <= 2 ? -1 : 0;
    const why = `🍀 오늘 운 ${'★'.repeat(stars)}${name ? ` (${name})` : ''}`;
    return { day, stars, tier, src, name, n, good, bad, why };
}
// Does an action fit today? +1 / −1 / 0
export const fitToday = (L, label) => (!L ? 0 : Math.sign((L.good.re.test(label) ? 1 : 0) - (L.bad.re.test(label) ? 1 : 0)));
