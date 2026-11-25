// 🌐 Screen translation — the logic only (no host, no page). The host side is src/st/tr.js.
//
// Union of the three generations (DESIGN T):
//   v2 extra/tr.js + trgate.js + base/gloss.js — engines free / ai / off, only what is shown, glossary first,
//      only text that needs it, per-category switches, collect briefly then one batch at a time, cache per chat,
//      hand-corrected = locked, two misses = keep the original, error = stop + 1 min cool-down.
//   v3 st/tr.js — names masked before sending and put back as the glossary writes them, a batch whose line count
//      does not match is never paired wrongly, ~3,500 characters per request.
//   v1 translate.js — fixed words (weekdays, months, time of day, weather) answered from a built-in table with no
//      request, cut-off text («…») matched by its beginning, mixed text split at separators, abbreviation-only text
//      skipped, «clear» keeps hand corrections, «tidy» drops entries no longer on screen, a size cap.
// Translation never touches stored state, the main prompt or the chat text: it only rewrites text nodes of our own
// screens, from a dictionary kept in this chat's Meatball data.

export const CATS = [
    // [switch key, category, label, what it covers]   — defaults follow v2 (places and names: glossary recommended)
    ['sent', '문장', '소개 · 관계 한 줄 · 비밀 · 메모 같은 긴 글', true],
    ['phrase', '단어 · 짧은 구절', '상태 · 날씨 · 기분 · 취향 같은 짧은 말', true],
    ['place', '장소 이름', '지금 장소 · 지나온 곳', false],
    ['name', '고유 명칭', '사람 · 물건 이름', false],
    ['unit', '숫자 · 단위', '돈 단위 같은 것', false],
].map(([c, label, sub, on]) => ({ c, label, sub, on }));
export const ENGINES = { off: '끔', free: '무료 · 빠름 (실리태번 기본 번역)', ai: '제대로 (AI 연결)' };
export const DEFAULTS = { mode: 'off', lang: 'ko', profile: '', cats: Object.fromEntries(CATS.map((x) => [x.c, x.on])), glossary: [] };
export const LANGS = { ko: '한국어', ja: '日本語', 'zh-CN': '中文(简体)', 'zh-TW': '中文(繁體)', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', ru: 'Русский', vi: 'Tiếng Việt', th: 'ไทย', id: 'Bahasa Indonesia' };

export const MAX_DICT = 2000, BATCH_N = 80, BATCH_CH = 3500, WAIT = 700, COOL = 60000, MAX_LEN = 400;

// ── settings (stored inside Meatball's own settings; missing pieces filled) ──
export function trCfg(c) {
    const t = (c.tr ??= {});
    for (const [k, v] of Object.entries(DEFAULTS)) if (t[k] === undefined) t[k] = structuredClone(v);
    for (const x of CATS) if (t.cats[x.c] === undefined) t.cats[x.c] = x.on;
    if (!ENGINES[t.mode]) t.mode = 'off';
    return t;
}
export const modeOf = (c) => (c?.tr && (c.tr.mode === 'free' || c.tr.mode === 'ai') ? c.tr.mode : 'off');

// ── does this text need translating? (v2 needs + v1 abbreviation rule; target-aware) ──
const HANGUL = /[가-힣]/g, LATIN_ETC = /[A-Za-z぀-ヿ㐀-鿿Ѐ-ӿ]/g;
export function needs(s, lang = 'ko') {
    s = String(s ?? '').trim();
    if (!s || s.length > MAX_LEN) return false;
    if (/:\/\/|www\./i.test(s)) return false;                                   // URLs
    if (!/[A-Za-z]{2}|[぀-ヿ㐀-鿿]/.test(s)) return false;      // nothing foreign to turn
    if (lang === 'ko') {
        const ko = (s.match(HANGUL) ?? []).length, fo = (s.match(LATIN_ETC) ?? []).length;
        if (ko >= fo) return false;                                             // already mostly Korean
    } else if (lang === 'en' && !/[぀-ヿ㐀-鿿가-힣Ѐ-ӿ]/.test(s)) return false;
    if (/\d/.test(s) && /^[\s\d.,:+\-−%/×x~()]*[A-Za-z]{1,4}[\s\d.,]*$/.test(s)) return false;   // 18ms · 3km · 632 tok
    if (/^[\s\d.,:+\-−%/×~()#|·]*(?:[A-Z]{1,5}|d\d+)(?:[\s\d.,:+\-−%/×~()#|·]+(?:[A-Z]{1,5}|d\d+))*[\s\d.,:+\-−%/×~()#|·]*$/.test(s)) return false;   // HP +25 · STR -1 · d20
    return true;
}

// ── category of a shown text: an explicit mark wins, else known names/places, else by shape ──
export function category(s, { mark = '', names = null, places = null } = {}) {
    if (mark && CATS.some((x) => x.c === mark)) return mark;
    const t = String(s ?? '').trim();
    if (names?.has?.(t)) return 'name';
    if (places?.has?.(t)) return 'place';
    if (/^[\d.,\s]*[A-Z][a-z]{1,10}$/.test(t) && /\d/.test(t)) return 'unit';
    const words = t.split(/\s+/).filter(Boolean).length;
    return words >= 6 || /[.!?…]["'”’)]?$/.test(t) ? 'sent' : 'phrase';
}

// ── glossary (v2 gloss.js): this chat's entries first, then every chat's; whole words only at Latin edges ──
const okTerm = (t) => typeof t === 'string' && !!t.trim() && t.length <= 60 && !/[\r\n<>]/.test(t);
export const fold = (t) => String(t ?? '').toLowerCase().replace(/[\s\-‐‑–—_·・]+/g, ' ').trim();
export const GLOSS_MAX = 200;
export function glossList(chatList = [], allList = []) {
    const seen = new Set(), out = [];
    for (const g of [...(chatList ?? []), ...(allList ?? [])]) {
        if (!okTerm(g?.from) || !okTerm(g?.to)) continue;
        const k = fold(g.from); if (!k || seen.has(k)) continue;
        seen.add(k); out.push({ from: g.from.trim(), to: g.to.trim() });
        if (out.length >= GLOSS_MAX) break;
    }
    return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isW = (ch) => /[A-Za-z0-9]/.test(ch ?? '');
const patternOf = (from) => from.trim().split(/[\s\-‐‑–—_·・]+/).filter(Boolean).map(esc).join('[\\s\\-‐‑–—_·・]+');
const edgeOk = (from, s, at, len) => !((isW(from[0]) && isW(s[at - 1])) || (isW(from.slice(-1)) && isW(s[at + len])));
const reCache = new Map();
function matcher(L) {
    const key = L.map((g) => `${g.from}\u0001${g.to}`).join('\u0002');
    if (reCache.has(key)) return reCache.get(key);
    const list = [...L].sort((a, b) => b.from.length - a.from.length);   // longer first («Sky Tower» before «Sky»)
    let re = null;
    try { re = list.length ? new RegExp(list.map((g) => `(${patternOf(g.from)})`).join('|'), 'gi') : null; } catch (e) { re = null; }
    const m = { re, list };
    if (reCache.size > 20) reCache.clear();
    reCache.set(key, m);
    return m;
}
// Apply the glossary to one text in a single pass (a replaced word is never replaced again).
export function glossText(t, L) {
    if (!L?.length || !t) return t;
    const { re, list } = matcher(L); if (!re) return t;
    const s = String(t);
    return s.replace(re, (...m) => {
        const at = m[list.length + 1], k = m.slice(1, list.length + 1).findIndex((x) => x != null);
        return k >= 0 && edgeOk(list[k].from, s, at, m[0].length) ? list[k].to : m[0];
    });
}
// Only the terms that occur in this text (so a long glossary never makes a request bigger).
export function glossIn(text, L) {
    const s = String(text ?? ''); if (!L?.length || !s) return [];
    return L.filter((g) => { let re; try { re = new RegExp(patternOf(g.from), 'gi'); } catch (e) { return false; } for (let m; (m = re.exec(s));) { if (edgeOk(g.from, s, m.index, m[0].length)) return true; if (!m[0]) re.lastIndex++; } return false; });
}
// v3: names are hidden behind tokens before a machine translator sees them («Grace» must not become a word) and put
// back as the glossary writes them. A result that lost or gained a token is not used.
export function maskTerms(text, L) {
    const map = [], s0 = String(text ?? '');
    if (!L?.length) return { s: s0, map };
    const { re, list } = matcher(L); if (!re) return { s: s0, map };
    const s = s0.replace(re, (...m) => {
        const at = m[list.length + 1], k = m.slice(1, list.length + 1).findIndex((x) => x != null);
        if (k < 0 || !edgeOk(list[k].from, s0, at, m[0].length)) return m[0];
        const tok = `ZQN${map.length}Q`; map.push([tok, list[k].to]); return tok;
    });
    return { s, map };
}
const TOK = /ZQN\s*(\d+)\s*Q/gi;
export function unmaskTerms(s, map) {
    const fixed = String(s ?? '').replace(TOK, 'ZQN$1Q');
    if ((fixed.match(/ZQN\d+Q/g) ?? []).length !== map.length) return null;
    return map.reduce((t, [tok, to]) => t.split(tok).join(to), fixed);
}

// ── v1: words that are always the same are answered from a table, never sent ──
const FIXED = {
    ko: {
        monday: '월요일', tuesday: '화요일', wednesday: '수요일', thursday: '목요일', friday: '금요일', saturday: '토요일', sunday: '일요일',
        mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
        january: '1월', february: '2월', march: '3월', april: '4월', may: '5월', june: '6월', july: '7월', august: '8월', september: '9월', october: '10월', november: '11월', december: '12월',
        dawn: '새벽', morning: '아침', noon: '낮', afternoon: '오후', evening: '저녁', night: '밤', midnight: '한밤',
        spring: '봄', summer: '여름', autumn: '가을', fall: '가을', winter: '겨울',
        sunny: '맑음', clear: '맑음', cloudy: '흐림', overcast: '흐림', rain: '비', rainy: '비', drizzle: '이슬비', storm: '폭풍', snow: '눈', snowy: '눈', fog: '안개', foggy: '안개', windy: '바람', hot: '더움', cold: '추움', humid: '습함',
    },
};
export const fixedWord = (s, lang = 'ko') => FIXED[lang]?.[String(s ?? '').trim().toLowerCase()] ?? '';

// ── the dictionary: { source: { t, c, k? (1 = corrected by hand), at? } } kept per chat ──
export class Dict {
    constructor(obj) { this.D = obj && typeof obj === 'object' ? obj : {}; this.rev = 0; }
    get(s) { return this.D[s] ?? null; }
    has(s) { return Object.hasOwn(this.D, s); }
    put(src, t, c = 'phrase', lock = false) {
        const old = this.D[src];
        if (old?.k && !lock) return false;                              // a hand correction is never overwritten
        delete this.D[src]; this.D[src] = { t, c, ...(lock ? { k: 1 } : {}) }; this.rev++;
        const keys = Object.keys(this.D);
        for (let i = 0; keys.length - i > MAX_DICT && i < keys.length; i++) if (!this.D[keys[i]].k) { delete this.D[keys[i]]; }
        return true;
    }
    drop(src) { if (!this.has(src)) return false; delete this.D[src]; this.rev++; return true; }
    // «다시 번역»: one entry (even a locked one), one category or everything — locked entries only one at a time
    redo({ src = null, cat = null } = {}) {
        const out = [];
        for (const [s, e] of Object.entries(this.D)) {
            if (src != null ? s !== src : (e.k || (cat && e.c !== cat))) continue;
            delete this.D[s]; out.push([s, e.c]);
        }
        if (out.length) this.rev++;
        return out;
    }
    // v1 «전체 삭제»: empties the dictionary but keeps hand corrections
    clear() { let n = 0; for (const [s, e] of Object.entries(this.D)) if (!e.k) { delete this.D[s]; n++; } if (n) this.rev++; return n; }
    // v1 «정리»: drop what is no longer on any screen (hand corrections stay)
    prune(alive) { let n = 0; for (const [s, e] of Object.entries(this.D)) if (!e.k && !alive.has(s)) { delete this.D[s]; n++; } if (n) this.rev++; return n; }
    get size() { return Object.keys(this.D).length; }
    entries() { return Object.entries(this.D); }
}

// ── turn one shown text into its translation, from the dictionary only (never asks) ──
const SEP = /(\s*(?:→|—|\||·|:|\n)\s*)/;
export function lookup(text, dict, L = [], lang = 'ko') {
    const raw = String(text ?? ''), s = raw.trim();
    if (!s) return raw;
    const hit = dict.get(s);
    if (hit?.t) return raw.replace(s, hit.t);
    const fw = fixedWord(s, lang); if (fw) return raw.replace(s, fw);
    const g = glossText(s, L); if (g !== s && !needs(g, lang)) return raw.replace(s, g);      // fully covered by the glossary
    if (s.endsWith('…') && s.length > 4) {                                                       // v1/v2: cut-off text
        const head = s.slice(0, -1);
        const k = Object.keys(dict.D).find((x) => x.startsWith(head));
        if (k && dict.D[k].t && dict.D[k].t !== k) return raw.replace(s, `${dict.D[k].t.slice(0, Math.max(4, s.length - 1))}…`);
    }
    if (SEP.test(s)) {                                                                           // v1: mixed text, piece by piece
        const parts = s.split(SEP);
        if (parts.length > 1) {
            let changed = false;
            const out = parts.map((p, n) => { if (n % 2) return p; const q = lookup(p, dict, L, lang); if (q !== p) changed = true; return q; });
            if (changed) return raw.replace(s, out.join(''));
        }
    }
    return g !== s ? raw.replace(s, g) : raw;
}
// The pieces of a shown text that still need a request (whole text, else its separated pieces)
export function wants(text, dict, L = [], lang = 'ko') {
    const s = String(text ?? '').trim();
    if (!s || dict.has(s) || fixedWord(s, lang)) return [];
    const g = glossText(s, L);
    if (!needs(s, lang) || !needs(g, lang)) {
        if (SEP.test(s)) return s.split(SEP).filter((p, n) => !(n % 2)).flatMap((p) => (p.trim() && p.trim() !== s ? wants(p, dict, L, lang) : []));
        return [];
    }
    if (SEP.test(s)) {
        const pieces = s.split(SEP).filter((p, n) => !(n % 2)).map((p) => p.trim()).filter((p) => p && p !== s);
        // a piece already known, or a long text: go piece by piece (v1); else the whole text reads better
        if (s.length > 60 || pieces.some((p) => dict.has(p) || fixedWord(p, lang) || !needs(p, lang))) return pieces.flatMap((p) => wants(p, dict, L, lang));
    }
    return [s];
}

// ── [[n]] packing: answers are matched by number, so a missing line never pairs two wrong texts ──
export const pack = (texts) => texts.map((t, i) => `[[${i + 1}]] ${String(t).replace(/\s*\n\s*/g, ' ')}`).join('\n');
export function unpack(text, n) {
    const out = new Array(n).fill(''), re = /\[\[\s*(\d+)\s*\]\]\s*([\s\S]*?)(?=\[\[\s*\d+\s*\]\]|$)/g;
    for (let m; (m = re.exec(String(text ?? '')));) { const k = Number(m[1]) - 1; if (k >= 0 && k < n && !out[k]) out[k] = m[2].replace(/\s+/g, ' ').trim(); }
    return out;
}
export const aiSystem = (lang, terms) => `You translate short UI texts of a roleplay status screen into natural, concise ${LANGS[lang] ?? lang}. `
    + 'Keep every [[n]] marker and output exactly one line per marker, nothing else. Keep numbers and units as they are. '
    + 'Proper names: keep the original spelling unless the glossary gives another form. Keep every ZQN0Q-style token exactly as it is.'
    + (terms.length ? ` Glossary (always use the right side): ${terms.map((g) => `${g.from}=${g.to}`).join(', ')}` : '');

// ── the queue: collect briefly, then one batch at a time; one request in flight; cool down after an error ──
// io: { send(texts, {terms, lang}) -> Promise<string[]>, now(), setTimeout, clearTimeout, notice(msg), saved(), changed() }
export class Translator {
    constructor({ dict, io, settings }) {
        this.dict = dict; this.io = io; this.settings = settings;   // settings() -> { mode, lang, cats, gloss: [] }
        this.pending = new Map(); this.missed = new Map();
        this.busy = false; this.timer = null; this.coolUntil = 0; this.told = false;
        this.stats = { calls: 0, items: 0, ms: 0, lastError: '', skipped: 0 };
    }
    on() { const m = this.settings().mode; return m === 'free' || m === 'ai'; }
    // texts: [{ s, c }] seen on screen right now. Only what is new, switched on and needs it is queued.
    scan(texts) {
        if (!this.on()) return 0;
        const { cats = {}, gloss = [], lang = 'ko' } = this.settings();
        let n = 0;
        for (const { s, c } of texts) {
            if (!cats[c]) continue;
            for (const piece of wants(s, this.dict, gloss, lang)) {
                if (this.pending.has(piece) || this.dict.has(piece)) continue;
                this.pending.set(piece, c); n++;
            }
        }
        if (this.pending.size) this.schedule(WAIT);
        return n;
    }
    schedule(ms) { this.io.clearTimeout(this.timer); this.timer = this.io.setTimeout(() => this.run(), Math.max(0, ms)); }
    async run() {
        if (this.busy || !this.pending.size || !this.on()) return;
        const now = this.io.now();
        if (now < this.coolUntil) { this.schedule(this.coolUntil - now + 50); return; }
        const { gloss = [], lang = 'ko', mode } = this.settings();
        const batch = []; let ch = 0;
        for (const [s, c] of this.pending) {
            const g = mode === 'ai' ? glossText(s, gloss) : s;
            const m = mode === 'ai' ? { s: g, map: [] } : maskTerms(s, gloss);
            if (batch.length >= BATCH_N || (batch.length && ch + m.s.length > BATCH_CH)) break;
            batch.push({ s, c, send: m.s, map: m.map }); ch += m.s.length + 8;
        }
        this.busy = true; this.io.changed?.();
        const t0 = this.io.now(), dictAt = this.dict;
        try {
            const terms = glossIn(batch.map((b) => b.s).join('\n'), gloss);
            const got = await this.io.send(batch.map((b) => b.send), { terms, lang, mode });
            if (this.dict !== dictAt) return;                                       // the chat changed meanwhile
            batch.forEach((b, k) => {
                this.pending.delete(b.s);
                let t = String(got?.[k] ?? '').trim();
                if (t && b.map.length) t = unmaskTerms(t, b.map) ?? '';
                if (t) { this.dict.put(b.s, glossText(t, gloss).slice(0, MAX_LEN), b.c); this.missed.delete(b.s); }
                else {
                    const miss = (this.missed.get(b.s) ?? 0) + 1; this.missed.set(b.s, miss);
                    if (miss >= 2) this.dict.put(b.s, b.s, b.c); else this.pending.set(b.s, b.c);   // twice missing: keep the original, never ask again
                }
            });
            Object.assign(this.stats, { calls: this.stats.calls + 1, items: this.stats.items + batch.length, ms: Math.round(this.io.now() - t0), lastError: '' });
            this.told = false;
            this.io.saved?.();
        } catch (e) {
            const msg = String(e?.message ?? e).slice(0, 200);
            this.stats.lastError = msg; this.coolUntil = this.io.now() + COOL;
            if (!this.told) { this.told = true; this.io.notice?.('번역이 안 돼요. 1분 쉬었다가 다시 해 볼게요.'); }   // one notice only
        } finally {
            this.busy = false; this.io.changed?.();
            if (this.pending.size) this.schedule(this.io.now() < this.coolUntil ? this.coolUntil - this.io.now() + 50 : 0);
        }
    }
    redo(opts) { const back = this.dict.redo(opts); for (const [s, c] of back) { this.missed.delete(s); this.pending.set(s, c); } if (back.length) { this.schedule(50); this.io.saved?.(); } return back.length; }
    stop() { this.io.clearTimeout(this.timer); this.pending.clear(); }
}
