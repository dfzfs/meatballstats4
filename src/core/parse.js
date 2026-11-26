// Reads the classifier's answer line by line and keeps only lines that pass every check.
import { quoteOk } from './text.js';

// The reader sometimes names the person's own character by how the story addresses them («당신», «you», «User»).
// In a name place that is the person's character; in «with» (who else is present) it is left out.
const NO_NAMES = new Set(['time', 'date', 'loc', 'weather', 'mood', 'gist', 'near', 'cash', 'got', 'lost', 'stat', 'tag', 'my', 'leak', 'broke', 'ate', 'slept', 'washed', 'done']);
const ME = /^(?:당신|너|그대|자네|you|the user|user|\{\{user\}\}|player|protagonist)$/i;
export function meToUser(k, v, user) {
    if (!user || NO_NAMES.has(k)) return v;
    const fix = (s) => s.split(/(\s*[>&,+]\s*|-)/).map((t) => (ME.test(t.trim()) ? t.replace(t.trim(), user) : t)).join('');
    if (k === 'with') {
        const m = String(v).match(/^(\s*=?\s*)(.*)$/s);
        const kept = m[2].split(/\s*[,，、]\s*/).filter((n) => !ME.test(n.replace(/^[+-]\s*/, '').trim()) && n.replace(/^[+-]\s*/, '').trim().toLowerCase() !== String(user).toLowerCase());
        if (!kept.length) return /=/.test(m[1]) ? '=none' : null;   // «+당신» alone says nothing about anyone else
        return `${m[1]}${kept.join(', ')}`;
    }
    const i = String(v).indexOf('=');
    return i < 0 ? fix(String(v)) : fix(String(v).slice(0, i)) + String(v).slice(i);
}

// 'key: value | "quote"' lines between <mb> and </mb>. Anything else is reported in `dropped`.
export function parseAnswer(answer) {
    const lines = [], dropped = [];
    const body = String(answer ?? '').replace(/^[\s\S]*?<mb>/i, '').replace(/<\/mb>[\s\S]*$/i, '');
    for (const raw of body.split(/\r?\n/)) {
        let t = raw.trim().replace(/^[-*•]\s*/, ''), n = null;
        const num = t.match(/^[«\[(]?#\s*(\d+)[»\])]?\s*[:.)]?\s*/);          // "#12 key: value" when several replies were read at once
        if (num) { n = +num[1]; t = t.slice(num[0].length).trim(); }
        if (!t || /^none$/i.test(t)) continue;
        const m = t.match(/^([a-zA-Z]+)\s*[:：]\s*(.+)$/);
        if (!m) { dropped.push({ raw: t, why: 'form' }); continue; }
        let v = m[2].trim(), q = '';
        const qm = v.match(/\s*\|\s*["“]([^"”]{2,})["”]?\s*$/);
        if (qm) { q = qm[1].trim(); v = v.slice(0, qm.index).trim(); }
        if (!v) { dropped.push({ raw: t, why: 'empty' }); continue; }
        lines.push(n == null ? { k: m[1].toLowerCase(), v, q } : { k: m[1].toLowerCase(), v, q, n });
    }
    return { lines, dropped, none: !lines.length && /none/i.test(body) };
}

// null = usable. Otherwise why the answer cannot be used at all.
export function brokenKind(answer) {
    const s = String(answer ?? '').trim();
    if (!s) return 'empty';
    if (/^(<mb>)?\s*none\s*(<\/mb>)?$/i.test(s)) return null;
    const ns = s.replace(/\s/g, '');
    if (/(.)\1{9,}/u.test(ns) && new Set(ns).size < 8) return 'garbled';
    const p = parseAnswer(s);
    return p.lines.length || p.none ? null : 'nokeys';
}

// Parsed lines -> kept records. A line survives only if its key is active, its quote (when required)
// is really in the text, and the owning app accepts it.
// `reply` (optional): the reply's own words without the person's message, for apps that must tell the two apart.
export function validate(parsed, { reg, text, reply = null, envOf = () => ({}) }) {
    const kept = [], dropped = [...parsed.dropped];
    for (const ln of parsed.lines) {
        const app = reg.ownerOf(ln.k);
        try { ln.v = meToUser(ln.k, ln.v, envOf(reg.ownerOf(ln.k)?.id)?.user ?? ''); } catch (e) { /* keep as written */ }
        if (ln.v == null) continue;
        const raw = `${ln.k}: ${ln.v}`;
        if (!app) { dropped.push({ raw, why: 'key-off', ...(ln.n != null ? { n: ln.n } : {}) }); continue; }
        const kd = app.keys.find((k) => k.id === ln.k);
        if (kd.quote && !quoteOk(ln.q, text)) { dropped.push({ raw, why: 'no-quote', ...(ln.n != null ? { n: ln.n } : {}) }); continue; }
        let ok = true;
        try { if (app.check) ok = app.check({ k: ln.k, v: ln.v, q: ln.q }, { ...envOf(app.id), text, ...(reply != null ? { reply } : {}) }) !== false; } catch (e) { ok = false; }
        if (!ok) { dropped.push({ raw, why: 'app-refused', ...(ln.n != null ? { n: ln.n } : {}) }); continue; }
        const rec = ln.q ? [ln.k, ln.v, ln.q] : [ln.k, ln.v];
        if (ln.n != null) rec.n = ln.n;
        kept.push(rec);
    }
    return { kept, dropped };
}
