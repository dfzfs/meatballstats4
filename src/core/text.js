// Text helpers shared by the core and the apps. Knows nothing about the host application.

// Story text only: reasoning blocks and markup are not part of what was written.
export function cleanText(s) {
    return String(s ?? '')
        .replace(/<(think|thinking|reasoning|details)\b[\s\S]*?<\/\1>/gi, '')
        .replace(/<\/?[a-z][^>]*>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function fnv(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
}
export const hash = fnv;
// A short id that stays the same for the same words (case, quotes and spacing ignored): prefix + 5 letters.
export const shortId = (prefix, s) => `${prefix}${fnv(String(s ?? '').toLowerCase().replace(/[“”"'‘’「」『』]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 5)}`;

// A reply is identified by what it says, never by its position or swipe number. Swiping back to an old
// version finds its old record; editing a reply makes it a new one; other tools may reorder the chat freely.
export const fingerprint = (m) => `${fnv(String(m?.name ?? ''))}.${fnv(String(m?.mes ?? ''))}.${String(m?.mes ?? '').length}`;

// Messages that are part of the story. System notices and hidden messages are skipped.
export const isReply = (m) => !!m && !m.is_user && !m.is_system && !!String(m.mes ?? '').trim();
export const isUserTurn = (m) => !!m && !!m.is_user && !m.is_system;

const norm = (x) => String(x ?? '').toLowerCase().replace(/[“”"'‘’「」『』*_.,!?;:…]/g, '').replace(/\s+/g, ' ').trim();
// Is the quote really in the text? Exact, or any 20-letter window of it (models trim and re-space quotes).
export function quoteOk(q, text, min = 8) {
    const a = norm(q), b = norm(text);
    if (a.length < min) return false;
    if (b.includes(a)) return true;
    for (let i = 0; i + 20 <= a.length; i += 5) if (b.includes(a.slice(i, i + 20))) return true;
    return false;
}
export const nameInText = (name, text) => { const n = norm(name); return n.length > 0 && norm(text).includes(n); };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };
export const sentences = (text) => String(text ?? '').replace(/([.!?。…])\s+/g, '$1\n').split(/\n+/).map((x) => x.trim()).filter((x) => x.length > 3);
