// Built into Meatball 4 (was a separately installed app). Fetched only when switched on.
import { applyTime } from '../core/clock.js';
//
// 🗺 Map — the second generation's map, carried over: places are stations, the ways between them are lines
// (coloured, bent at 45°), people are pins, a tapped place shows the way there, who is there, its rooms as a
// lift panel, a photo and a note. Drawing only: no key of its own, no model call, nothing sent to any model.
// It WATCHES what 🧭 Scene records (loc · with · time), so its history is folded from the chat like every other
// record: swipe, delete or edit a reply and the map follows.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t; };
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const R = (v) => Math.round(v * 100) / 100;
const segs = (loc) => String(loc ?? '').split('>').map((x) => x.trim()).filter(Boolean);
const pairKey = (a, b) => [a, b].sort().join('|');
const MAX_PLACES = 80;

// ───── kinds of place (second generation's list) ─────
const PLACE_KINDS = { home: '🏠', shop: '🛒', food: '🍜', bath: '🛁', work: '💼', street: '🛣️', school: '🏫', other: '📍' };
const KIND_KO = { home: '집', shop: '가게', food: '먹는 곳', bath: '씻는 곳', work: '일터', street: '길 · 바깥', school: '학교', other: '그 밖' };
const KIND_RE = [
    ['bath', /bath|spa|shower|hot spring|sauna|목욕|욕실|온천|사우나/i],
    ['school', /school|academy|library|classroom|college|university|campus|학교|학원|도서관|교실|대학/i],
    ['food', /cafe|café|coffee|restaurant|diner|inn\b|tavern|pub\b|bar\b|bakery|kitchen|canteen|식당|카페|주점|술집|빵집|부엌|주방/i],
    ['shop', /shop|store|market|mall|boutique|stall|pharmacy|가게|상점|시장|마트|편의점|약국/i],
    ['work', /office|company|guild|workshop|studio|factory|station house|headquarters|hospital|clinic|회사|사무|공방|공장|병원|본부/i],
    ['home', /home|house|apartment|flat\b|cottage|cabin|dorm|bedroom|living room|mansion|집|아파트|자취방|기숙사|침실|거실|저택/i],
    ['street', /street|road|alley|avenue|square|plaza|bridge|park\b|harbor|harbour|pier|dock|forest|field|beach|path|gate|거리|골목|광장|다리|공원|항구|숲|들판|해변|길/i],
];
const guessKind = (name) => KIND_RE.find(([, re]) => re.test(name))?.[0] ?? 'other';

// ───── story time (the same counting 🧭 Scene uses, so "today" means the same day) ─────
function tick(S, v) { applyTime(S, v); }

// ───── which station a "big place > smaller place > room" line means ─────
// three or more parts: the second is the station, the first its district, the rest a room inside.
// two parts: "station > room" when the first is already a station, else "district > station".
function stationOf(S, loc) {
    const p = segs(loc);
    if (!p.length) return null;
    if (p.length === 1) return { name: p[0], area: S.P[norm(p[0])]?.area ?? '', room: '' };
    if (p.length === 2 && S.P[norm(p[0])]) return { name: p[0], area: S.P[norm(p[0])].area ?? '', room: p[1] };
    return { name: p[1], area: p[0], room: p.slice(2).join(' › ') };
}

const names = (v) => String(v).split(/[,，、]/).map((x) => x.trim()).filter((x) => x && x.length <= 40);
function sawAt(S, who, key, i, carried = false) {
    if (!key || !who) return;
    const old = S.seen[who];
    if (old?.at === key) { old.day = S.day; old.i = i; return; }
    S.seen[who] = { at: key, day: S.day, i, ...(carried && old ? { was: { at: old.at, day: old.day, i: old.i } } : {}) };
    const P = S.P[key]; if (P) P.ppl[who] = (P.ppl[who] ?? 0) + 1;
}
// someone who was only carried along by a move in this same reply, and then turns out not to be here
function unsee(S, who, i) {
    const s = S.seen[who];
    if (!s || s.i !== i || !s.was) return;
    const P = S.P[s.at]; if (P?.ppl[who]) { P.ppl[who] -= 1; if (!P.ppl[who]) delete P.ppl[who]; }
    S.seen[who] = s.was;
}

// the map is full: the least visited place, longest ago, makes room (never where we are now)
function evict(S) {
    const out = Object.entries(S.P).filter(([k]) => k !== S.cur).sort((a, b) => (a[1].n - b[1].n) || ((a[1].i ?? 0) - (b[1].i ?? 0)))[0]?.[0];
    if (!out) return;
    delete S.P[out];
    for (const e of Object.keys(S.E)) if (e.split('|').includes(out)) delete S.E[e];
    S.route.list = S.route.list.filter((k) => k !== out);
    for (const [who, x] of Object.entries(S.seen)) if (x.at === out) delete S.seen[who];
}
function reduce(S, { k, v, i }) {
    if (k === 'time') { tick(S, v); return; }
    if (k === 'mood') { const P = S.P[S.cur]; if (P) P.mood = clip(v, 40); return; }
    if (k === 'loc') {
        const st = stationOf(S, v); if (!st) return;
        const key = norm(st.name);
        let P = S.P[key];
        if (!P) { if (Object.keys(S.P).length >= MAX_PLACES) evict(S); P = S.P[key] = { name: clip(st.name, 60), area: clip(st.area, 60), n: 0, first: S.day, last: S.day, i, rooms: {}, ppl: {} }; }
        if (st.area && !P.area) P.area = clip(st.area, 60);
        if (S.cur !== key) {
            P.n += 1;
            if (S.cur && S.P[S.cur]) { const e = pairKey(S.cur, key); S.E[e] = (S.E[e] ?? 0) + 1; }
            if (S.route.day !== S.day) S.route = { day: S.day, list: S.cur ? [S.cur] : [] };
            if (S.route.list.at(-1) !== key) S.route.list.push(key);
            if (S.route.list.length > 12) S.route.list.shift();
            S.cur = key;
            for (const n of S.with) sawAt(S, n, key, i, true);   // whoever is with you came along
        }
        P.last = S.day; P.i = i;
        S.room = clip(st.room, 60);
        if (S.room) { P.rooms[S.room] = (P.rooms[S.room] ?? 0) + 1; const ks = Object.keys(P.rooms); if (ks.length > 12) delete P.rooms[ks[0]]; }
        return;
    }
    if (k === 'with') {
        const t = String(v).trim(), before = S.with;
        if (/^=?\s*\(?\s*(?:none|nobody|no one|alone|empty|-)?\s*\)?\s*$/i.test(t)) S.with = [];
        else if (t.startsWith('=')) S.with = names(t.slice(1)).filter((n) => !/^\(?(?:none|nobody|no one)\)?$/i.test(n)).slice(0, 12);
        else {
            S.with = [...S.with];
            for (const part of t.split(/\s*[;/]\s*|\s+(?=[+-])/)) {
                const n = part.slice(1).trim();
                if (part.startsWith('+') && n && !S.with.includes(n)) S.with.push(n);
                if (part.startsWith('-')) S.with = S.with.filter((x) => x !== n);
            }
        }
        for (const n of before) if (!S.with.includes(n)) unsee(S, n, i);
        for (const n of S.with) sawAt(S, n, S.cur, i);
    }
}

// ═════ drawing: carried over from the second generation's metro.js ═════
const LINE_COLORS = ['#e5484d', '#2f7de1', '#2fa56b', '#f08c2e', '#8b5bd6', '#16a3a8', '#d6409f', '#8d6e4f', '#6c7a89', '#c2a000'];
const STEP = 12;
// map coordinates snapped to a grid (a taken cell -> the nearest free one)
function linePos(flatPos) {
    const used = new Set(), out = new Map();
    for (const [k, o] of flatPos) {
        const fx = o.x / STEP, fy = o.y / STEP;
        let best = null;
        for (let r = 0; r < 6 && !best; r++) {
            for (let gx = Math.round(fx) - r; gx <= Math.round(fx) + r; gx++) for (let gy = Math.round(fy) - r; gy <= Math.round(fy) + r; gy++) {
                if (used.has(`${gx},${gy}`)) continue;
                const d = Math.hypot(gx - fx, gy - fy);
                if (!best || d < best.d) best = { gx, gy, d };
            }
        }
        best ??= { gx: Math.round(fx), gy: Math.round(fy) };
        used.add(`${best.gx},${best.gy}`);
        out.set(k, { x: best.gx * STEP, y: best.gy * STEP });
    }
    return out;
}
// one stretch of line: straight, then a 45° bend with a rounded corner
function octSeg(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
    if (!ax || !ay || Math.abs(ax - ay) < 0.01) return { d: `M${R(a.x)} ${R(a.y)}L${R(b.x)} ${R(b.y)}`, da: Math.atan2(dy, dx), db: Math.atan2(-dy, -dx) };
    const dg = Math.min(ax, ay), m = ax > ay ? { x: b.x - sx * dg, y: a.y } : { x: a.x, y: b.y - sy * dg };
    const l1 = Math.hypot(m.x - a.x, m.y - a.y), l2 = Math.hypot(b.x - m.x, b.y - m.y), r = Math.min(3, l1 * 0.6, l2 * 0.6);
    const p1 = { x: m.x - ((m.x - a.x) / l1) * r, y: m.y - ((m.y - a.y) / l1) * r };
    const p2 = { x: m.x + ((b.x - m.x) / l2) * r, y: m.y + ((b.y - m.y) / l2) * r };
    return {
        d: `M${R(a.x)} ${R(a.y)}L${R(p1.x)} ${R(p1.y)}Q${R(m.x)} ${R(m.y)} ${R(p2.x)} ${R(p2.y)}L${R(b.x)} ${R(b.y)}`,
        da: Math.atan2(m.y - a.y, m.x - a.x), db: Math.atan2(m.y - b.y, m.x - b.x),
    };
}
// ways gathered into lines: start at an end station and keep going as straight as possible -> one colour per line
function lineEdges(pairs, pos) {
    const adj = new Map(), unused = new Map(pairs.map((e) => [e.key, e]));
    const add = (n, to, e) => { if (!adj.has(n)) adj.set(n, []); adj.get(n).push({ to, e }); };
    for (const e of pairs) { add(e.a, e.b, e); add(e.b, e.a, e); }
    const left = (n) => adj.get(n).filter((x) => unused.has(x.e.key));
    const lineOf = new Map(); let li = 0;
    for (;;) {
        const ns = [...adj.keys()].filter((n) => left(n).length);
        if (!ns.length) break;
        let cur = ns.find((n) => left(n).length % 2 === 1) ?? ns[0], prev = null;
        for (;;) {
            const opts = left(cur); if (!opts.length) break;
            const p = pos.get(cur);
            const turn = (x) => { if (!prev) return 0; const q = pos.get(x.to), a1 = Math.atan2(p.y - prev.y, p.x - prev.x), a2 = Math.atan2(q.y - p.y, q.x - p.x); return Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))); };
            const nx = opts.reduce((m, x) => (turn(x) < turn(m) ? x : m), opts[0]);
            unused.delete(nx.e.key); lineOf.set(nx.e.key, li); prev = p; cur = nx.to;
        }
        li++;
    }
    const dirs = new Map(), lines = new Map(), colorOf = new Map(); let base = '', top = '';
    const note = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const e of pairs) {
        const s = octSeg(pos.get(e.a), pos.get(e.b)), n = lineOf.get(e.key), c = LINE_COLORS[n % LINE_COLORS.length];
        colorOf.set(e.key, c);
        note(dirs, e.a, s.da); note(dirs, e.b, s.db); note(lines, e.a, n); note(lines, e.b, n);
        base += `<path class="ln ${e.unk ? 'unk' : ''}" style="--c:${c}" d="${s.d}"/>`;
        if (e.route) top += `<path class="ln route" d="${s.d}"/>`;
    }
    return { svg: base + top, dirs, lines, lineOf, colorOf };
}
// 📍 people pin: a bubble above the station (four faces, then +n)
function pinBubble(cx, tipY, list) {
    if (!list?.length) return '';
    const shown = list.slice(0, 4), more = list.length - shown.length, n = shown.length + (more > 0 ? 1 : 0);
    const w = n * 4.3 + 1.4, h = 5.6, x = cx - w / 2, y = tipY - 1.5 - h;
    return `<g class="pins mb4-notr"><title>${esc(list.map((p) => p.name).join(', '))}</title><path class="tail" d="M${R(cx - 1.1)} ${R(y + h - 0.2)}L${R(cx)} ${R(tipY)}L${R(cx + 1.1)} ${R(y + h - 0.2)}z"/><rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${h}" rx="2.8"/>
        ${shown.map((p, i) => `<text class="pe" x="${R(x + 0.7 + 2.15 + i * 4.3)}" y="${R(y + 4.05)}">${esc(p.e)}</text>`).join('')}${more > 0 ? `<text class="pm" x="${R(x + 0.7 + 2.15 + shown.length * 4.3)}" y="${R(y + 3.75)}">+${more}</text>` : ''}</g>`;
}
// stations: the name tag goes to the side that crosses no line and no other tag
const textW = (t) => { let w = 0; for (const ch of String(t)) w += ch.codePointAt(0) > 0x2000 ? 3.4 : 1.9; return w; };
const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
function lineNodes(places, o) {
    const taken = places.map((p) => { const q = o.pos.get(p.name); return [q.x - 3, q.y - 3, 6, 6]; });
    const ext = [Infinity, Infinity, -Infinity, -Infinity], grow = (b) => { ext[0] = Math.min(ext[0], b[0]); ext[1] = Math.min(ext[1], b[1]); ext[2] = Math.max(ext[2], b[0] + b[2]); ext[3] = Math.max(ext[3], b[1] + b[3]); };
    const svg = [...places].sort((a, b) => (o.pos.get(a.name).y - o.pos.get(b.name).y) || (o.pos.get(a.name).x - o.pos.get(b.name).x)).map((p) => {
        const { x: cx, y: cy } = o.pos.get(p.name);
        const here = p.name === o.here, isSel = o.sel === p.name;
        const ls = [...new Set(o.net.lines.get(p.name) ?? [])], xfer = ls.length > 1;
        const pins = o.pins?.(p) ?? [];
        const ico = PLACE_KINDS[p.kind] ?? '📍', nm = clip(p.name, 13), txt = `${ico} ${nm}`, w = textW(txt) + 1;
        const dirs = o.net.dirs.get(p.name) ?? [];
        const cands = [['b', 0, 6.6, 'middle', Math.PI / 2], ['t', 0, -4.4, 'middle', -Math.PI / 2], ['r', 4.4, 1.15, 'start', 0], ['l', -4.4, 1.15, 'end', Math.PI]]
            .filter((c) => !(pins.length && c[0] === 't'))
            .map(([k, dx, dy, anchor, ang], i) => {
                const box = [anchor === 'middle' ? cx - w / 2 : anchor === 'start' ? cx + dx : cx + dx - w, cy + dy - 3.1, w, 4.2];
                const free = dirs.length ? Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(d - ang), Math.cos(d - ang))))) : Math.PI;
                return { k, dx, dy, anchor, box, score: Math.min(free, 1.6) - taken.filter((t) => hit(box, t)).length * 4 - i * 0.05 };
            });
        const lb = cands.reduce((m, c) => (c.score > m.score ? c : m), cands[0]);
        taken.push(lb.box); grow(lb.box); grow([cx - 6, cy - (pins.length ? 12 : 6), 12, pins.length ? 18 : 12]);
        const c = ls.length ? LINE_COLORS[ls[0] % LINE_COLORS.length] : 'var(--sub)';
        const vis = p.visits, foot = vis === 0 ? 'new' : vis >= 5 ? 'v3' : vis >= 2 ? 'v2' : 'v1';   // 👣 footprints
        const ord = o.order?.(p.name) ?? 0;
        return `<g class="node ${here ? 'here' : ''} ${isSel ? 'sel' : ''} ${xfer ? 'xfer' : ''} ${foot}" style="--c:${c}" data-act="mapsel" data-v="${esc(p.name)}">${ord ? `<text class="ord mb4-notr" x="${R(cx + 3)}" y="${R(cy - 2.6)}">${ord}</text>` : ''}
            <circle class="hitbox" cx="${cx}" cy="${cy}" r="5"/>${here ? `<circle class="ring" cx="${cx}" cy="${cy}" r="5.2"/>` : ''}${isSel ? `<circle class="halo" cx="${cx}" cy="${cy}" r="${xfer ? 4.3 : 3.8}"/>` : ''}
            <circle class="stn" cx="${cx}" cy="${cy}" r="${xfer ? 2.9 : 2.3}"/>${here ? `<circle class="me" cx="${cx}" cy="${cy}" r="1.25"/>` : ''}
            <text class="lb" x="${R(cx + lb.dx)}" y="${R(cy + lb.dy)}" style="text-anchor:${lb.anchor}"><tspan class="pi mb4-notr">${esc(ico)} </tspan><tspan class="pn" data-trc="place">${esc(nm)}</tspan>${p.floors.length ? `<tspan class="pf mb4-notr"> ${p.floors.length}칸</tspan>` : ''}</text>
            ${pinBubble(cx, cy - 3.2, pins)}</g>`;
    }).join('');
    return { svg, ext };
}
// where each station goes: along its connections on a grid (right -> down -> up -> left -> diagonals)
function layout(places) {
    const flat = new Map(), ns = places.map((p) => p.name), byN = new Map(places.map((p) => [norm(p.name), p]));
    const adj = new Map(ns.map((n) => [n, new Set()]));
    for (const p of places) for (const q of p.near ?? []) { const t = byN.get(norm(q)); if (t && t.name !== p.name) { adj.get(p.name).add(t.name); adj.get(t.name).add(p.name); } }
    const used = new Set(), put = (n, gx, gy) => { flat.set(n, { x: gx * STEP, y: gy * STEP }); used.add(`${gx},${gy}`); };
    const D = [[1, 0], [0, 1], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let col = 0;
    for (const start of ns) {
        if (flat.has(start)) continue;
        put(start, col, 3); const q = [start];
        while (q.length) {
            const cur = q.shift(), c = flat.get(cur), cx = c.x / STEP, cy = c.y / STEP;
            for (const nb of adj.get(cur)) {
                if (flat.has(nb)) continue;
                const d = D.find(([dx, dy]) => !used.has(`${cx + dx * 2},${cy + dy * 2}`) && !used.has(`${cx + dx},${cy + dy}`)) ?? [1, 0];
                let gx = cx + d[0] * 2, gy = cy + d[1] * 2; while (used.has(`${gx},${gy}`)) gx += 2;
                put(nb, gx, gy); q.push(nb);
            }
        }
        col = Math.max(...[...flat.values()].map((v) => v.x / STEP)) + 3;
    }
    const pos = linePos([...flat]);
    const pairs = [], seen = new Set();
    for (const [a, s] of adj) for (const b of s) { const k = pairKey(a, b); if (!seen.has(k)) { seen.add(k); pairs.push({ a, b, key: k }); } }
    return { pos, pairs, adj };
}
// the shortest way from here to the chosen station (station names)
function route(adj, from, to) {
    if (!from || !to || from === to || !adj.has(from)) return [];
    const prev = new Map([[from, null]]), q = [from];
    while (q.length) { const c = q.shift(); if (c === to) break; for (const n of adj.get(c) ?? []) if (!prev.has(n)) { prev.set(n, c); q.push(n); } }
    if (!prev.has(to)) return [];
    const out = []; for (let c = to; c; c = prev.get(c)) out.unshift(c); return out;
}
// rooms as floors: "2F office" "basement storage" "rooftop" sorted bottom to top, with the button label a lift would show
const lvOf = (s) => { const t = String(s); if (/옥상|루프|roof/i.test(t)) return 999; const m = /(지하|basement|cellar|\bb)\s*(\d*)/i.exec(t); if (m) return -Number(m[2] || 1); const n = /(\d+)\s*(층|f\b|st floor|nd floor|rd floor|th floor)/i.exec(t) ?? /(?:floor|level)\s*(\d+)/i.exec(t); return n ? Number(n[1]) : /upstairs|위층|이층/i.test(t) ? 2 : 1; };
const btnOf = (s) => { const k = lvOf(s); return k === 999 ? 'R' : k < 0 ? `B${-k}` : /(\d+)\s*(층|f\b|st floor|nd floor|rd floor|th floor)|(?:floor|level)\s*\d+|upstairs|위층|이층/i.test(s) ? String(k) : ''; };
const floorsOf = (rooms) => rooms.map((name) => ({ name, k: lvOf(name), b: btnOf(name) })).sort((a, b) => a.k - b.k);

// ═════ what the screen shows, worked out from the record + what the person set by hand ═════
// st (this chat): kind{} note{} photo{} hide[] pins[]|null links[] cuts[] extra[]
function model(S, env, st) {
    const hide = new Set(st.hide ?? []), cuts = new Set(st.cuts ?? []);
    const all = Object.entries(S.P).map(([key, p]) => ({ key, name: p.name, area: p.area, visits: p.n, first: p.first, last: p.last, i: p.i, rooms: Object.keys(p.rooms), ppl: p.ppl, mood: p.mood ?? '' }));
    for (const n of st.extra ?? []) if (!S.P[norm(n)]) all.push({ key: norm(n), name: n, area: '', visits: 0, first: 0, last: 0, i: -1, rooms: [], ppl: {} });
    const places = all.filter((p) => !hide.has(p.key) || p.key === S.cur);
    const byKey = new Map(places.map((p) => [p.key, p]));
    const link = (a, b) => { const A = byKey.get(a), B = byKey.get(b); if (A && B && A !== B && !cuts.has(pairKey(a, b))) { if (!(A.near ??= []).includes(B.name)) A.near.push(B.name); if (!(B.near ??= []).includes(A.name)) B.near.push(A.name); } };
    for (const e of Object.keys(S.E)) { const [a, b] = e.split('|'); link(a, b); }
    for (const e of st.links ?? []) { const [a, b] = e.split('|'); link(a, b); }
    // "near" lines 🧭 Scene recorded: "Place — beside: Place" joins two stations when both are on the map
    const near = env.peek?.('scene')?.near ?? {};
    for (const [a, b] of Object.entries(near)) { const A = norm(a), B = [...byKey.keys()].find((k) => k !== A && k.length >= 3 && norm(b).includes(k)); if (byKey.has(A) && B) link(A, B); }
    for (const p of places) { p.near ??= []; p.kind = PLACE_KINDS[st.kind?.[p.key]] ? st.kind[p.key] : guessKind(p.name); p.floors = floorsOf(p.rooms); }
    // people: here now = whoever 🧭 Scene says is present; elsewhere = where each was last seen
    const gone = env.peek?.('people')?.list ?? {}, face = env.face ?? (() => '🙂');
    const pinOK = (n) => !Array.isArray(st.pins) || st.pins.includes(n);
    const at = new Map(), everyone = new Set([...S.with, ...Object.keys(S.seen)]);
    const push = (key, x) => { if (byKey.has(key)) (at.get(key) ?? at.set(key, []).get(key)).push(x); };
    for (const n of S.with) if (pinOK(n)) push(S.cur, { e: face(n), name: n, why: '지금 같이 있어요', now: true });
    for (const [n, s] of Object.entries(S.seen)) if (!S.with.includes(n) && !gone[n]?.gone && pinOK(n)) push(s.at, { e: face(n), name: n, why: '마지막으로 본 곳', now: false });
    return { places, byKey, at, everyone: [...everyone].filter((n) => !gone[n]?.gone), hidden: all.filter((p) => hide.has(p.key) && p.key !== S.cur), near };
}

const TOD_KO = { dawn: '새벽', morning: '아침', noon: '낮', afternoon: '오후', evening: '저녁', night: '밤', midnight: '한밤' };
const btn = (text, act, v = '', cls = 'sm ghost') => `<button class="mb4-btn ${cls}" data-act="${act}" data-v="${esc(v)}">${text}</button>`;
const rl = (ico, body) => `<div class="mbx-rl"><i>${ico}</i><span>${body}</span></div>`;
const okPhoto = (u) => /^(https?:\/\/|\/|data:image\/)/i.test(String(u ?? '').trim());

function placeCard(S, M, st, p, path, ui) {
    const isHere = p.key === S.cur, here = M.at.get(p.key) ?? [], L = [];
    if (!isHere && path.length > 1) L.push(rl('🚶', `<span data-trc="place">${path.map(esc).join(' → ')}</span> <small>${path.length - 1}정거장</small>`));
    else if (!isHere && S.cur) L.push(rl('🚶', '<small>여기서 이어진 길이 아직 없어요</small>'));
    L.push(rl('👥', here.length ? here.map((x) => `${x.e} <b data-trc="name">${esc(x.name)}</b> <small>${esc(x.why)}</small>`).join(' · ') : '<small>지금은 아무도 없을 것 같아요</small>'));
    // who you may meet if you go now: people last seen here first, then the ones seen here most often (code only)
    if (!isHere) {
        const shown = new Set(here.map((x) => x.name)), guess = Object.entries(p.ppl).filter(([n, c]) => c >= 2 && !shown.has(n) && !S.with.includes(n)).sort((a, b) => b[1] - a[1]).slice(0, 3);
        if (guess.length) L.push(rl('🔮', `가면 만날지도: ${guess.map(([n, c]) => `<b data-trc="name">${esc(n)}</b> <small>${c >= 5 ? '자주' : '가끔'}</small>`).join(' · ')}`));
    }
    if (p.mood) L.push(rl('🌫', `<small>여기 분위기</small> ${esc(p.mood)}`));
    if (p.visits) L.push(rl('👣', `<b>${p.visits}번</b> 들렀어요 `));
    else L.push(rl('👣', '<small>아직 가 보지 않은 곳이에요</small>'));
    const often = Object.entries(p.ppl).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (often.length) L.push(rl('🕰', `여기서 본 사람: ${often.map(([n, c]) => `<b data-trc="name">${esc(n)}</b> <small>${c}번</small>`).join(' · ')}`));
    if (p.area) L.push(rl('🗾', `<span data-trc="place">${esc(p.area)}</span> <small>안에 있어요</small>`));
    for (const [a, b] of Object.entries(M.near)) if (norm(a) === p.key || norm(b).includes(p.key)) L.push(rl('🧭', `<span data-trc="place">${esc(a)}</span> <small data-trc="phrase">${esc(b)}</small>`));
    if (st.note?.[p.key]) L.push(rl('📝', esc(st.note[p.key])));
    // 🛗 inside: narrow, like a lift's button panel (upper floors on top), with the photo beside it
    const fl = [...p.floors].reverse();
    const lift = fl.length ? `<div class="mbx-lift">${fl.map((f) => `<div class="mbx-fl${isHere && norm(S.room) === norm(f.name) ? ' on' : ''}"><b class="mb4-notr">${esc(f.b || [...f.name][0].toUpperCase())}</b><span data-trc="place">${esc(f.name)}</span></div>`).join('')}</div>` : '';
    const ph = st.photo?.[p.key];
    const photo = okPhoto(ph) ? `<div class="mbx-photo"><img src="${esc(ph)}" alt="${esc(p.name)}" loading="lazy"></div>` : `<button class="mbx-photo empty" data-act="edit" data-v="${esc(p.name)}">🖼<small>사진 넣기</small></button>`;
    const bld = `<div class="mbx-bld${lift ? '' : ' nolift'}">${lift}${photo}</div>`;
    const others = M.places.filter((q) => q.key !== p.key);
    const linked = new Set(p.near.map(norm));
    const edit = ui.edit !== p.key ? '' : `<div class="mbx-edit">
        <p class="mb4-hint">어떤 곳인가요</p><div class="mb4-chips">${Object.entries(PLACE_KINDS).map(([k, e]) => `<button class="mb4-btn sm ${p.kind === k ? '' : 'ghost'}" data-act="kind" data-v="${k}">${e} ${KIND_KO[k]}</button>`).join('')}</div>
        <label class="mb4-label">메모<input class="mb4-input" data-act="note" maxlength="120" placeholder="이 장소에 대해 적어 둘 것" value="${esc(st.note?.[p.key] ?? '')}"></label>
        <label class="mb4-label">사진 주소<input class="mb4-input" data-act="photo" maxlength="400" placeholder="https://… 로 시작하는 그림 주소" value="${esc(ph ?? '')}"></label>
        ${others.length ? `<p class="mb4-hint">이어진 곳 (눌러서 잇고 끊어요)</p><div class="mb4-chips">${others.map((q) => `<button class="mb4-btn sm ${linked.has(q.key) ? '' : 'ghost'}" data-act="link" data-v="${esc(q.name)}"><span data-trc="place">${esc(clip(q.name, 16))}</span></button>`).join('')}</div>` : ''}
        <div class="mb4-btnrow">${isHere ? '' : btn('👁 지도에서 숨기기', 'hide', p.name)}${p.visits ? '' : btn('🗑 지우기', 'drop', p.name)}${btn('닫기', 'edit', '')}</div>
    </div>`;
    return `<section class="mb4-card mbx-place"><h5 class="mb4-card-h"><span class="mb4-notr">${PLACE_KINDS[p.kind]}</span> <span data-trc="place">${esc(p.name)}</span>${isHere ? ' <small class="mbx-here">지금 여기</small>' : ''}</h5>
        ${L.join('')}${bld}
        <div class="mb4-btnrow">${isHere ? '' : btn('🚶 여기로 가기', 'go', p.name, 'sm')}${btn('✏️ 고치기', 'edit', p.name)}</div>${edit}</section>`;
}

function view(S, env, st, ui = {}) {
    const sc = env.peek?.('scene');
    if (!sc) return env.kit.empty('🧭', '「장면」 앱을 켜 주세요', '지도는 장면 앱이 적어 둔 장소를 읽어서 그려요');
    const M = model(S, env, st);
    const add = `<details class="mb4-card mbx-add"${ui.add ? ' open' : ''}><summary>＋ 장소 직접 넣기</summary><div class="mb4-btnrow"><input class="mb4-input" data-f="newplace" maxlength="60" placeholder="아직 안 가 본 곳 이름">${btn('넣기', 'add', '', 'sm')}</div><p class="mb4-hint">넣은 곳은 흐리게 보이다가, 이야기에서 실제로 가면 진해져요.</p></details>`;
    if (!M.places.length) return env.kit.empty('🗺', '아직 지나온 곳이 없어요', '장소가 바뀌면 역이 하나씩 생겨요') + add;
    const { pos, pairs, adj } = layout(M.places);
    const cur = M.byKey.get(S.cur), sel = M.byKey.get(norm(ui.sel)) ?? cur ?? M.places.at(-1);
    const path = route(adj, cur?.name, sel.name), onPath = new Set(path.slice(1).map((n, i) => pairKey(path[i], n)));
    for (const e of pairs) e.route = onPath.has(e.key);
    const net = lineEdges(pairs, pos);
    const today = S.route.day === S.day ? S.route.list.map((k) => M.byKey.get(k)?.name).filter(Boolean) : [];
    const nodes = lineNodes(M.places, { pos, here: cur?.name, sel: sel.name, net, pins: (p) => M.at.get(p.key) ?? [], order: today.length > 1 ? (n) => today.lastIndexOf(n) + 1 : null });
    const [x0, y0, x1, y1] = nodes.ext, pad = 4;
    const svg = `<svg class="mbx-map" viewBox="${R(x0 - pad)} ${R(y0 - pad)} ${R(x1 - x0 + pad * 2)} ${R(y1 - y0 + pad * 2)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="지도"><g class="edges">${net.svg}</g>${nodes.svg}</svg>`;
    const tools = `${M.everyone.length ? btn('📍 핀 인물', 'pinpick') : ''}${M.hidden.length ? btn(`👁 숨긴 곳 ${M.hidden.length}`, 'unhide') : ''}`;
    let h = `<div class="mbx-maphead"><span>📍 지금 <b data-trc="place">${esc(cur?.name ?? '어딘가')}</b>${S.room && cur ? ` <small data-trc="place">${esc(S.room)}</small>` : ''}${sc.tod ? ` · ${TOD_KO[sc.tod] ?? ''}` : ''}</span><span class="mb4-btnrow tight">${tools}</span></div>`;
    if (ui.pinpick) h += `<div class="mb4-card"><p class="mb4-hint">지도에 띄울 사람 (꺼 둔 사람은 핀이 안 떠요)</p><div class="mb4-chips">${M.everyone.map((n) => `<button class="mb4-btn sm ${!Array.isArray(st.pins) || st.pins.includes(n) ? '' : 'ghost'}" data-act="pin" data-v="${esc(n)}">${env.face?.(n) ?? '🙂'} <span data-trc="name">${esc(n)}</span></button>`).join('')}</div><div class="mb4-btnrow">${btn('모두 띄우기', 'pinall')}${btn('닫기', 'pinpick')}</div></div>`;
    h += `<div class="mbx-mapwrap">${svg}</div>`;
    const who = [...M.at.entries()].flatMap(([key, L]) => L.map((x) => ({ ...x, pl: M.byKey.get(key).name })));
    if (who.length) h += `<div class="mbx-pinrow">${who.map((x) => `<button class="mbx-pin" data-act="mapsel" data-v="${esc(x.pl)}" title="${esc(x.why)}">${x.e} <span data-trc="name">${esc(x.name)}</span> <small data-trc="place">${esc(clip(x.pl, 14))}</small></button>`).join('')}</div>`;
    h += placeCard(S, M, st, sel, path, ui);
    if (today.length > 1) h += `<section class="mb4-card"><h5 class="mb4-card-h">오늘 다닌 길</h5><p class="mbx-today" data-trc="place">${today.map((n, i) => `<b class="mb4-notr">${i + 1}</b> ${esc(n)}`).join(' → ')}</p></section>`;
    const trail = [...M.places].filter((p) => p.visits).sort((a, b) => b.i - a.i);
    h += `<details class="mb4-card"><summary>🧾 다녀온 곳 전부 (${trail.length})</summary><ol class="mb4-trail">${trail.map((p) => `<li data-act="mapsel" data-v="${esc(p.name)}"><b><span class="mb4-notr">${PLACE_KINDS[p.kind]}</span> <span data-trc="place">${esc(p.name)}</span></b><small>${p.visits}번${p.area ? ` · <span data-trc="place">${esc(p.area)}</span>` : ''}</small></li>`).join('')}</ol></details>`;
    h += add;
    return h + env.kit.hint('역 = 장소, 선 = 실제로 오간 길이에요. 색이 진할수록 자주 간 곳이고, 숫자는 오늘 다닌 순서예요. AI를 부르지 않아요.');
}

const CSS = `
.mbx-maphead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;font-size:13px}
.mbx-maphead small{color:var(--sub)}
.mbx-mapwrap{border:1px solid var(--line);border-radius:14px;background:radial-gradient(color-mix(in srgb,var(--fg) 9%,transparent) .8px,transparent 1px) 0 0/14px 14px,color-mix(in srgb,var(--fg) 2%,transparent);padding:4px}
.mbx-map{display:block;width:100%;height:auto;max-height:46vh;user-select:none;--bg:#fffaf5;--hi:var(--a)}
.mbx-map .edges .ln{fill:none;stroke:var(--c,var(--sub));stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.mbx-map .edges .ln.unk{stroke-dasharray:.1 3.2;opacity:.75}
.mbx-map .edges .ln.route{stroke:#fff;stroke-width:.7;stroke-dasharray:1.6 1.8;animation:mbx-run 1.2s linear infinite}
.mbx-map .node{cursor:pointer}
.mbx-map .node .hitbox{fill:transparent}
.mbx-map .node .stn{fill:var(--bg);stroke:var(--c,var(--sub));stroke-width:1.15}
.mbx-map .node.xfer .stn{stroke:var(--fg);stroke-width:.95}
.mbx-map .node .me{fill:var(--hi)}
.mbx-map .node.here .stn{stroke:var(--hi);stroke-width:1.3}
.mbx-map .node .ring{fill:color-mix(in srgb,var(--hi) 18%,transparent);animation:mbx-pulse 2s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
.mbx-map .node .halo{fill:none;stroke:var(--hi);stroke-width:.5;stroke-dasharray:1.1 1.1}
.mbx-map .node:hover .stn{stroke-width:1.6}
.mbx-map .node text{fill:var(--fg);paint-order:stroke;stroke:var(--bg);stroke-width:1px;stroke-linejoin:round;font-family:inherit}
.mbx-map .node text.lb{font-size:3.1px;font-weight:700}
.mbx-map .node.here text.lb{fill:var(--hi)}
.mbx-map .node text.lb .pf{font-size:2.3px;fill:var(--sub);font-weight:600}
.mbx-map .node.v1 .stn{fill:color-mix(in srgb,var(--c,var(--sub)) 22%,var(--bg))}
.mbx-map .node.v2 .stn{fill:color-mix(in srgb,var(--c,var(--sub)) 48%,var(--bg))}
.mbx-map .node.v3 .stn{fill:color-mix(in srgb,var(--c,var(--sub)) 78%,var(--bg))}
.mbx-map .node.new:not(.here):not(.sel) text.lb{opacity:.55}
.mbx-map .node .ord{font-size:2.4px;font-weight:800;fill:#fff;paint-order:stroke;stroke:var(--love,#e0567f);stroke-width:.9px;pointer-events:none}
.mbx-map .pins{pointer-events:none;animation:mbx-bob 1.6s ease-in-out infinite}
.mbx-map .pins rect{fill:var(--bg);stroke:var(--hi);stroke-width:.45}
.mbx-map .pins .tail{fill:var(--hi);stroke:none}
.mbx-map .node .pins text{stroke:none;paint-order:normal;text-anchor:middle}
.mbx-map .node .pins text.pe{font-size:3.5px}
.mbx-map .node .pins text.pm{font-size:2.4px;font-weight:800;fill:var(--hi)}
@keyframes mbx-run{to{stroke-dashoffset:-3.4}}
@keyframes mbx-pulse{50%{transform:scale(1.25);opacity:.5}}
@keyframes mbx-bob{50%{transform:translateY(-1.1px)}}
@media (prefers-reduced-motion:reduce){.mbx-map .pins,.mbx-map .edges .ln.route,.mbx-map .node .ring{animation:none}}
.mbx-pinrow{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}
.mbx-pin{font:inherit;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
.mbx-pin small{color:var(--sub)}
.mbx-place{margin-top:8px}
.mbx-here{font-size:11px;font-weight:700;color:var(--a);margin-left:4px}
.mbx-rl{display:flex;gap:8px;align-items:baseline;font-size:13px;padding:3px 0}
.mbx-rl>i{flex:none;font-style:normal;width:20px;text-align:center}
.mbx-rl small{color:var(--sub)}
.mbx-bld{display:flex;gap:8px;margin:8px 0 2px}
.mbx-lift{flex:0 0 132px;display:flex;flex-direction:column;gap:4px;padding:6px;border-radius:12px;background:color-mix(in srgb,var(--fg) 5%,transparent)}
.mbx-fl{display:flex;align-items:center;gap:6px;min-height:30px;font-size:11px}
.mbx-fl b{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;border:1.5px solid color-mix(in srgb,var(--fg) 30%,transparent);font-size:12px;background:#fff}
.mbx-fl span{color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mbx-fl.on b{background:var(--a);border-color:var(--a);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 25%,transparent)}
.mbx-fl.on span{color:var(--fg);font-weight:600}
.mbx-photo{position:relative;flex:1;min-height:96px;border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--fg) 5%,transparent);border:0;padding:0;font:inherit}
.mbx-photo img{display:block;width:100%;height:100%;max-height:240px;object-fit:cover}
.mbx-photo.empty{border:1.5px dashed var(--line);color:var(--sub);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:20px}
.mbx-photo.empty small{font-size:11px}
.mbx-edit{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}
.mbx-today{font-size:13px;margin:0;line-height:1.7}
.mbx-today b{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--love,#e0567f);color:#fff;font-size:10px}
.mb4-app-map .mb4-trail li{cursor:pointer}
`;

const ui = { sel: '', edit: '', pinpick: false, add: false };
const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default {
    api: 1, id: 'map', name: '지도', icon: '🗺', color: '#2f9e7a', cost: 'zero',
    desc: '다녀온 곳을 노선도로 그려요. 누가 어디 있는지, 가는 길, 건물 안까지 보여 줘요. 🧭 장면이 적어 둔 걸 읽기만 해요.',
    watch: ['loc', 'with', 'time', 'mood'],
    start: () => ({ day: 1, hrs: 0, cur: '', room: '', with: [], P: {}, E: {}, seen: {}, route: { day: 1, list: [] } }),
    reduce,
    widget(S) { const T = S?.route?.day === S?.day ? S.route.list.map((k) => S.P[k]?.name).filter(Boolean).slice(-4) : []; const cur = S?.P?.[S.cur]; return T.length > 1 ? `<div class="mb4-row"><span class="mb4-row-v" data-trc="place">${T.map((n) => esc(clip(n, 14))).join(' → ')}</span></div>` : cur ? `<div class="mb4-row"><span class="mb4-row-k">📍 지금</span><span class="mb4-row-v" data-trc="place">${esc(cur.name)}</span></div>` : ''; },
    widgetTitle: '오늘 다닌 길',
    render(el, api) {
        const st = api.store, env = { peek: api.env.peek, kit: api.kit, face: api.kit.face };
        if (ui.st !== st) Object.assign(ui, { st, sel: '', edit: '', pinpick: false, add: false });   // another chat: start fresh
        const keyOf = (name) => norm(name);
        const save = () => { api.save(); paint(); };
        const paint = () => {
            el.innerHTML = view(api.state(), env, st, ui);
            api.kit.acts(el, {
                mapsel: (v) => { ui.sel = v; ui.edit = ''; paint(); },
                edit: (v) => { ui.edit = ui.edit === keyOf(v) ? '' : keyOf(v); if (v) ui.sel = v; paint(); },
                pinpick: () => { ui.pinpick = !ui.pinpick; paint(); },
                pin: (v) => { const S = api.state(), everyone = [...new Set([...S.with, ...Object.keys(S.seen)])]; st.pins = toggle(Array.isArray(st.pins) ? st.pins : everyone, v); save(); },
                pinall: () => { delete st.pins; save(); },
                unhide: () => { st.hide = []; save(); },
                hide: (v) => { st.hide = [...new Set([...(st.hide ?? []), keyOf(v)])]; ui.sel = ''; ui.edit = ''; save(); },
                drop: (v) => { st.extra = (st.extra ?? []).filter((n) => keyOf(n) !== keyOf(v)); ui.sel = ''; ui.edit = ''; save(); },
                kind: (v) => { (st.kind ??= {})[ui.edit] = v; save(); },
                note: (v) => { const t = String(v).trim().slice(0, 120); if (t) (st.note ??= {})[ui.edit] = t; else delete st.note?.[ui.edit]; save(); },
                photo: (v) => { const t = String(v).trim(); if (!t) delete st.photo?.[ui.edit]; else if (okPhoto(t)) (st.photo ??= {})[ui.edit] = t.slice(0, 400); else { api.toast('https:// 로 시작하는 그림 주소를 넣어 주세요.', 'warning'); return; } save(); },
                link: (v) => {
                    const S = api.state(), e = pairKey(ui.edit, keyOf(v));
                    const on = (st.links ?? []).includes(e) || (S.E[e] && !(st.cuts ?? []).includes(e));
                    if (on) { st.links = (st.links ?? []).filter((x) => x !== e); if (S.E[e]) st.cuts = [...new Set([...(st.cuts ?? []), e])]; }
                    else { st.cuts = (st.cuts ?? []).filter((x) => x !== e); if (!S.E[e]) st.links = [...new Set([...(st.links ?? []), e])]; }
                    save();
                },
                add: () => {
                    const name = api.kit.val(el, '[data-f="newplace"]').slice(0, 60);
                    if (!name) return;
                    if (api.state().P[keyOf(name)] || (st.extra ?? []).some((n) => keyOf(n) === keyOf(name))) { st.hide = (st.hide ?? []).filter((k) => k !== keyOf(name)); api.toast('이미 지도에 있는 곳이에요.'); }
                    else if ((st.extra ?? []).length >= 30) { api.toast('직접 넣는 곳은 30곳까지예요.', 'warning'); return; }
                    else st.extra = [...(st.extra ?? []), name];
                    ui.sel = name; ui.add = false; save();
                },
                go: (v) => { if (api.say(`${v}(으)로 간다.`)) api.toast('입력창에 적어 뒀어요. 고쳐서 보내면 돼요.'); },
            });
            el.querySelector('.mbx-add')?.addEventListener('toggle', (e) => { ui.add = e.target.open; });
        };
        paint();
    },
    css: CSS,
    _t: { reduce, stationOf, layout, route, floorsOf, view, model, guessKind },
};
