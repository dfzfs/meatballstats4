// Carrying on from an earlier Meatball in the same chat. Fetched only when the person taps 「이어 가기」.
// The old data is read, never changed: everything is translated into this version's own lines and stored under
// this version's own key. No model call is made.
import { fingerprint, isReply, shortId } from '../core/text.js';

const TOD = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'midnight'];
const TOD_KO = { 새벽: 'dawn', 아침: 'morning', 오전: 'morning', 낮: 'noon', 점심: 'noon', 오후: 'afternoon', 저녁: 'evening', 밤: 'night', 심야: 'midnight', 한밤: 'midnight' };
const TOUCH = ['none', 'brush', 'hand', 'hug', 'kiss', 'more'];
const num = (v) => { const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Math.abs(+m[0]) : null; };
const parts = (v) => String(v ?? '').split('|').map((x) => x.trim());
const tod = (t) => { const s = String(t ?? '').toLowerCase(); return TOD.find((w) => s.includes(w)) ?? Object.entries(TOD_KO).find(([k]) => s.includes(k))?.[1] ?? ''; };
const names = (v) => String(v ?? '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean);

// ── third generation: per-reply events keyed by the same kind of text fingerprint ──
// v3 kept dates as { y, m, d, wd, part } (part: early | mid | late), not as text.
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function v3Date(o) {
    if (!o) return '';
    if (typeof o === 'string') return o;
    if (typeof o !== 'object') return '';
    const wd = Number.isInteger(o.wd) && WD[o.wd] ? WD[o.wd] : '';
    if (o.m == null) return wd;
    const md = o.d != null ? `${MON[o.m - 1]} ${o.d}` : `${o.part ? `${o.part} ` : ''}${MON[o.m - 1]}`;
    return `${md}${o.y != null ? `, ${o.y}` : ''}${wd ? ` (${wd})` : ''}`.trim();
}
const signOf = (v) => { const t = String(v ?? '').trim(); return t.startsWith('=') ? '=' : t.startsWith('-') || t.startsWith('−') ? '-' : '+'; };
const isUser = (who, user) => !!who && !!user && String(who).trim().toLowerCase() === String(user).trim().toLowerCase();
function v3Line(e, user) {
    switch (e.k) {
        case 'time': {
            const t = [e.days > 0 ? `+${e.days}d` : '', e.fuzzy ? `+?${e.fuzzy}` : '', tod(e.tod)].filter(Boolean).join(' ');
            const out = t ? [['time', t]] : [];
            const d = v3Date(e.date); if (d) out.push(['date', d]);
            return out;
        }
        case 'date': { const d = v3Date(e.date); return d ? [['date', d]] : []; }
        case 'loc': case 'weather': return e.v ? [[e.k, String(e.v)]] : [];
        case 'with': return e.full ? [['with', `=${(e.add ?? []).join(', ') || 'none'}`]] : [...(e.add ?? []).map((n) => ['with', `+${n}`]), ...(e.del ?? []).map((n) => ['with', `-${n}`])];
        case 'wear': return e.who && e.v && !e.delta ? [['wear', `${e.who}=${e.v}`]] : [];
        case 'body': return e.who && e.v ? [['body', `${e.who}=${e.healed ? 'healed' : e.v}`]] : [];
        case 'mark': return e.who && e.v ? [['mark', `${e.who}=${e.v}`]] : [];
        case 'item': return e.who && e.v ? (isUser(e.who, user) ? [[e.sign === '-' ? 'lost' : 'got', String(e.v)]] : [['carry', `${e.who}=${e.sign === '-' ? '-' : ''}${e.v}`]]) : [];
        case 'gone': return e.who ? [['gone', `${e.who}=${e.v === 'dead' ? 'dead' : 'left the story for good'}`, e.q ?? '']] : [];
        case 'role': return e.who && e.v ? [['npc', `${e.who}=${e.v}`]] : [];
        case 'touch': return e.a && e.b ? [['touch', `${e.a}>${e.b}=${typeof e.v === 'number' ? TOUCH[e.v] ?? 'none' : e.v}`]] : [];
        case 'tie': return e.a && e.b ? [['tie', `${e.a}-${e.b}=${e.v ?? e.rel ?? ''}`]] : [];
        case 'refuse': case 'yield': return e.a && e.b && e.v ? [[e.k, `${e.a}>${e.b}=${e.v}`, e.q ?? '']] : [];
        case 'promise': return e.a && e.b && e.v ? [['promise', `${e.a}>${e.b}=${e.v}`, e.q ?? '']] : [];
        // v3 kept how one person addresses another as "name,register | \"quote\"", and who set the pace of a reply
        case 'call': { const [head, q] = String(e.v ?? '').split('|'); const name = head.split(',')[0].trim(); return e.a && e.b && name ? [['call', `${e.a}>${e.b}=${name}`, String(q ?? '').replace(/^[\s"“]+|[\s"”]+$/g, '')]] : []; }
        case 'lead': return e.who ? [['lead', String(e.who)]] : [];
        // v3: { who, v: "+50 gold" | "-20" | "=300 gold" } — the sign is in the text
        // (older records keep the sign beside the amount: { sign: '-', v: '20' } — both shapes are read)
        case 'money': return isUser(e.who, user) && num(e.v) != null ? [['cash', `${e.sign ? signOf(e.sign) : signOf(e.v)}${num(e.v)}`]] : [];
        case 'stat': return isUser(e.who, user) && e.item && e.v ? [['stat', `${e.item}=${e.v}`]] : [];
        default: return [];
    }
}
function fromV3(md, user) {
    const records = {};
    for (const [fp, evs] of Object.entries(md?.ev ?? {})) {
        if (!fp.startsWith('a.') || !Array.isArray(evs)) continue;
        const L = evs.flatMap((e) => { try { return v3Line(e, user); } catch (x) { return []; } });
        records[fp.slice(2)] = { t: Date.now(), L, src: 'v3' };   // "a.<name>.<text>.<length>" -> our "<name>.<text>.<length>"
    }
    // relationship events were kept apart, in md.rel (same fingerprints): dealings, feelings, the official relationship
    const MV = ['closer', 'back', 'wavering', 'crack', 'clash', 'same'], TEX = ['attraction', 'desire', 'lingering', 'love-hate', 'forbidden pull', 'resentment', 'bond', 'none'];
    for (const [fp0, evs] of Object.entries(md?.rel ?? {})) {
        if (!Array.isArray(evs) || !evs.length) continue;
        const fp = fp0.startsWith('a.') ? fp0.slice(2) : fp0;
        const L = evs.flatMap((e) => {
            if (!e?.a || !e?.b || e.a === e.b) return [];
            if (e.k === 'mv' && MV[e.mv]) return [['move', `${e.a}>${e.b}=${MV[e.mv]} / ${String(e.inner ?? '').trim() || '-'}`, e.q ?? '']];
            if (e.k === 'tex' && TEX[e.t]) return [['feel', `${e.a}>${e.b}=${TEX[e.t]}`, e.q ?? '']];
            if (e.k === 'tie' && e.v) return [['tie', `${e.a}-${e.b}=${e.v}`, e.q ?? '']];
            return [];
        });
        if (L.length) (records[fp] ??= { t: Date.now(), L: [], src: 'v3' }).L.push(...L);
    }
    const apps = { ...v3Settings(md) }, sec = v3Secrets(md);
    if (sec) {
        apps.secrets = { list: sec.list };
        for (const [fp, L] of Object.entries(sec.lines)) (records[fp] ??= { t: Date.now(), L: [], src: 'v3' }).L.push(...L);
    }
    return { records, apps };
}
// What the person set by hand in the third generation: directions (goals) and the standing note.
function v3Settings(md) {
    const out = {};
    const goals = (Array.isArray(md?.goals) ? md.goals : []).filter((g) => g?.v).slice(0, 6).map((g) => ({
        v: String(g.v).slice(0, 300), ...(g.who ? { who: String(g.who).slice(0, 60) } : {}),
        signs: (Array.isArray(g.signs) ? g.signs : []).map(String).filter((w) => w.trim().length >= 2).slice(0, 20),
        mode: g.push ? 'push' : g.hint ? 'hint' : 'silent', every: 4,
    }));
    if (goals.length) out.director = { goals };
    const note = String(md?.note ?? '').trim();
    if (note) out.memo = { text: note.slice(0, 600) };
    return out;
}
// The separate direction window (지시창) kept its own note per chat: the next-reply beat, the standing line, the scene.
export function fromDirector(d) {
    if (!d || typeof d !== 'object') return {};
    const x = {};
    if (d.beat && !d.used) x.once = String(d.beat).slice(0, 600);
    if (d.keep) x.always = String(d.keep).slice(0, 600);
    if (d.scene) x.scene = String(d.scene).slice(0, 600);
    return Object.keys(x).length ? { director: x } : {};
}
// Secrets written in the third generation's lore sheet (설정집): "금고: 누구 = 무엇 | 신호: … | 보임: … | 덮개: … | 열림: …"
// and "숨김: A>B = 무엇" (A keeps it from B). Same reading as there; anything else on the sheet is left alone.
export function loreSecrets(text) {
    const KEYS = { '금고': 'vault', vault: 'vault', '숨김': 'hide', hide: 'hide' };
    const EX = { '신호': 'signs', '금지신호': 'signs', signs: 'signs', '보임': 'shows', '보여도됨': 'shows', shows: 'shows', '덮개': 'cover', cover: 'cover', '열림': 'opens', opens: 'opens' };
    const out = [];
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const line = raw.replace(/←.*$/, '').trim();
        if (!line || /^[#\[]/.test(line) || /^\/\//.test(line)) continue;
        const m = line.match(/^([^:：]{1,12})[:：]\s*(.+)$/), k = m && KEYS[m[1].trim().toLowerCase()];
        if (!k) continue;
        const [main, ...rest] = m[2].split('|').map((x) => x.trim());
        const extra = Object.fromEntries(rest.map((x) => { const e = x.match(/^([^:：]+)[:：]\s*(.+)$/); return e && EX[e[1].trim().toLowerCase()] ? [EX[e[1].trim().toLowerCase()], e[2].trim()] : null; }).filter(Boolean));
        const eq = main.indexOf('=');
        if (eq < 0) continue;
        let who = main.slice(0, eq).trim(); const v = main.slice(eq + 1).trim();
        if (!who || !v) continue;
        if (k === 'hide') { const p = who.split('>').map((x) => x.trim()); if (p.length !== 2 || !p[0] || !p[1]) continue; who = p[0]; }
        out.push({ id: shortId('s', v.slice(0, 400)), v: v.slice(0, 400), who: who.slice(0, 60), signs: String(extra.signs ?? '').split(/[,，]/).map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 12), shows: (extra.shows ?? '').slice(0, 200), cover: (extra.cover ?? '').slice(0, 200), opens: (extra.opens ?? '').slice(0, 120) });
    }
    return out.slice(0, 20);
}
// Secrets typed in the third generation, and what happened to them per reply (a leak, a clue, a lie, the person's
// open / lock), as our own lines. Only secrets with a keeper and a text; at most 12, as there.
function v3Secrets(md) {
    const list = (Array.isArray(md?.secrets) ? md.secrets : []).filter((x) => x?.who && x?.v).slice(0, 20).map((x) => ({
        id: shortId('s', String(x.v).slice(0, 400)), v: String(x.v).slice(0, 400), who: String(x.who).slice(0, 60),
        signs: (Array.isArray(x.signs) ? x.signs : []).map(String).filter((w) => w.trim().length >= 2).slice(0, 12),
        shows: String(x.shows ?? '').slice(0, 200), cover: String(x.cover ?? '').slice(0, 200), opens: String(x.opens ?? '').slice(0, 120),
        ...(x.vOrig ? { vOrig: String(x.vOrig).slice(0, 400) } : {}), auto: !!x.auto,
    }));
    if (!list.length) return null;
    // their id was "keeper|first 80 letters"; an older event named only the keeper (usable when that keeper keeps one secret)
    const idFor = (sid, who) => {
        if (sid) { const k = String(sid).indexOf('|'), w = String(sid).slice(0, k), v = String(sid).slice(k + 1); const m = list.find((x) => x.who === w && x.v.slice(0, 80) === v); if (m) return m.id; }
        const mine = list.filter((x) => x.who === who);
        return mine.length === 1 ? mine[0].id : '';
    };
    const lines = {}, add = (fp, id, kind, q = '') => { if (!id || !String(fp).startsWith('a.')) return; (lines[String(fp).slice(2)] ??= []).push(q ? ['leak', `${id} ${kind}`, String(q).slice(0, 140)] : ['leak', `${id} ${kind}`]); };
    for (const [fp, g] of Object.entries(md.guard ?? {})) if (g && !g.false) for (const h of g.hits ?? []) if (h.kind === 'revealed' && h.q) add(fp, idFor(h.sid, h.who), 'revealed', h.q);
    for (const [fp, cs] of Object.entries(md.clue ?? {})) for (const c of Array.isArray(cs) ? cs : []) if (c?.q) add(fp, idFor(c.sid, c.who), c.kind === 'near' ? 'near' : 'clue', c.q);
    for (const [fp, ws] of Object.entries(md.lieLog ?? {})) for (const w of Array.isArray(ws) ? ws : []) add(fp, idFor('', w), 'lie');
    for (const [fp, ds] of Object.entries(md.vdec ?? {})) for (const d of Array.isArray(ds) ? ds : []) add(fp, idFor(d.sid, d.who), d.open ? 'open' : 'lock');
    return { list, lines };
}

// ── second and first generation: a list of [key, value] operations kept beside each message ──
function opLine(k, v, user) {
    const key = String(k).trim().toLowerCase(), p = parts(v), n = num(p.find((x) => /\d/.test(x)));
    switch (key) {
        case 'loc': case '장소': case 'place': return p[0] ? [['loc', p[0]]] : [];
        case 'time': case '시간': { const t = String(v).match(/[+]\s*\d+\s*(?:h|d|w|min|m)\b/gi)?.join(' ') ?? ''; const w = tod(v); return t || w ? [['time', [t, w].filter(Boolean).join(' ')]] : []; }
        case 'with': case '동행': return [['with', `=${names(p[0]).join(', ')}`]];
        case 'weather': case '날씨': return p[0] ? [['weather', p[0]]] : [];
        case 'cash': case 'money': case '돈': case '소지금': return n != null ? [['cash', `${/^\s*=/.test(v) ? '=' : /^\s*-/.test(v) ? '-' : '+'}${n}${p[1] ? ` | ${p[1]}` : ''}`]] : [];
        case 'earn': return n != null ? [['cash', `+${n}${p[1] ? ` | ${p[1]}` : ''}`]] : [];
        case 'buy': return [...(n != null ? [['cash', `-${n} | ${p[0]}`]] : []), ...(p[0] ? [['got', p[0]]] : [])];
        case 'sell': return [...(n != null ? [['cash', `+${n} | ${p[0]}`]] : []), ...(p[0] ? [['lost', p[0]]] : [])];
        case 'got': case 'item': case '획득': return p[0] ? [['got', p[0].replace(/^\+\s*/, '')]] : [];
        case 'used': case 'lost': case '분실': case '사용': return p[0] ? [['lost', p[0].replace(/^-\s*/, '')]] : [];
        case 'gift': return p[1] ? [['lost', p[1]]] : [];
        case 'wear': return p[0] ? [['wear', `${user}=${p[0]}`]] : [];
        case 'status': return p[0] ? [['body', `${user}=${p[0].startsWith('-') ? 'healed' : p[0]}`]] : [];
        case 'promise': return p[0] ? [[p[0].startsWith('-') ? 'done' : 'promise', p[0].replace(/^-\s*/, '') + (p[1] ? `, ${p[1]}` : '')]] : [];
        case 'npc': return p[0] ? [['npc', `${p[0]}=${p[1] ?? ''}`]] : [];
        case 'gone': return p[0] ? [['gone', `${p[0]}=${p[1] || 'gone'}`]] : [];
        default: return [];
    }
}
function fromOps(chat, opsOf, user, src) {
    const records = {};
    for (const m of chat) {
        if (!isReply(m)) continue;
        let ops = [];
        try { ops = opsOf(m) ?? []; } catch (e) { ops = []; }
        if (!ops.length) continue;
        records[fingerprint(m)] = { t: Date.now(), L: ops.flatMap(([k, v]) => { try { return opLine(k, v, user); } catch (x) { return []; } }), src };
    }
    return records;
}
function fromV2(md, chat, user) {
    const opsOf = (m) => { const sl = m.extra?.meatlite?.sw?.[m.swipe_id ?? 0]; const undo = new Set(sl?.undo ?? []); return [...(sl?.ops ?? []).filter((_o, j) => !undo.has(j)), ...(sl?.hand ?? []).map((h) => [h.k, h.v])]; };
    const w = md?.book?.world, s = w?.start, apps = {};
    if (w?.currency) apps.wallet = { unit: String(w.currency).slice(0, 12) };
    if (s?.y && s?.m && s?.d) apps.calendar = { start: `${String(s.y).padStart(4, '0')}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}` };
    return { records: fromOps(chat, opsOf, user, 'v2'), apps };
}
function fromV1(md, chat, user) {
    const opsOf = (m) => m.extra?.statussim?.bySwipe?.[m.swipe_id ?? 0] ?? [];
    const d = md?.base?.data, apps = {};
    if (d?.wallet) apps.wallet = { startCash: Number(d.wallet.cash) || 0, unit: String(d.wallet.currency ?? '').slice(0, 12) };
    return { records: fromOps(chat, opsOf, user, 'v1'), apps };
}

// Which earlier generations left something usable in this chat, newest first.
export function sources(chatMetadata) {
    const md = chatMetadata ?? {};
    return [['v3', 'meatball_status3', '미트볼 상태창 3'], ['v2', 'meatlite', '미트볼폰'], ['v1', 'statussim', '미트볼 상태창']].filter(([, k]) => md[k] && typeof md[k] === 'object').map(([gen, key, name]) => ({ gen, key, name }));
}
// -> { records, apps, by: { v3: n, ... } } ready for engine.adopt(). Newer generations win where two cover the same reply.
// Only what the person set by hand (secrets, directions, standing note, the direction window), no reply records.
export function settingsOnly(chatMetadata, chat, user) { return collect(chatMetadata, chat, user).apps; }
export function collect(chatMetadata, chat, user) {
    const out = { records: {}, apps: {}, by: {} };
    for (const { gen, key } of sources(chatMetadata).reverse()) {
        let got = { records: {}, apps: {} };
        try { got = gen === 'v3' ? fromV3(chatMetadata[key], user) : gen === 'v2' ? fromV2(chatMetadata[key], chat, user) : fromV1(chatMetadata[key], chat, user); } catch (e) { console.warn(`[meatball] could not read ${gen} data`, e); }
        out.by[gen] = Object.keys(got.records).length;
        Object.assign(out.records, got.records);
        for (const [id, data] of Object.entries(got.apps)) out.apps[id] = { ...(out.apps[id] ?? {}), ...data };
    }
    const dw = fromDirector(chatMetadata?.meatball_director);
    for (const [id, data] of Object.entries(dw)) out.apps[id] = { ...(out.apps[id] ?? {}), ...data };
    return out;
}
