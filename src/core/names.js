// Names: when two spellings are the same person. Ported from the third generation (core/names.js).
// Same letters ignoring case, a known alias, a Korean particle stripped, or one name's words inside the other's
// ("Nurse Bell" = "Bell"). Names that differ by one letter are only offered as "merge?" on screen, never merged.
const isCJK = (n) => /[぀-ヿ一-鿿가-힣]/.test(n);
const PARTICLES = ['이가', '에게', '한테', '께서', '이는', '이를', '이의', '이', '가', '은', '는', '을', '를', '의', '도', '랑', '와', '과', '야', '아'];
export const bare = (name) => String(name ?? '').replace(/^[=+\-\s]+/, '').replace(/[\s.,;:]+$/, '').trim();
const tokens = (n) => n.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
// The canonical name for `name` among `known` (names already seen), with the person's own aliases first. null = new.
export function resolve(known, name, alias = {}) {
    const n = bare(name), low = n.toLowerCase();
    if (!n) return null;
    if (known.includes(n)) return n;
    const a = alias[low] ?? Object.entries(alias).find(([k]) => k.toLowerCase() === low)?.[1];
    if (a) return known.find((k) => k.toLowerCase() === String(a).toLowerCase()) ?? a;
    const ci = known.find((k) => k.toLowerCase() === low);
    if (ci) return ci;
    if (isCJK(n)) {
        for (const p of PARTICLES) if (n.endsWith(p) && n.length > p.length + 1) { const r = resolve(known, n.slice(0, -p.length), alias); if (r) return r; }
        return null;
    }
    const t = tokens(n);
    return (t.length && known.find((k) => { const kt = tokens(k); return kt.length && !isCJK(k) && (t.every((x) => kt.includes(x)) || kt.every((x) => t.includes(x))); })) || null;
}
// Pairs that differ by one letter (same length): "merge?" suggestions.
export function lookalikes(names) {
    const out = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const a = names[i], b = names[j];
        if (a.length === b.length && a.length > 2 && [...a].filter((ch, x) => ch !== b[x]).length === 1) out.push([a, b]);
    }
    return out;
}
