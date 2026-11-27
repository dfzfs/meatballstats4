// 🧭 Map geography: an out-of-character look at where the story's places are, asked from the model by a tap
// (one call), then drawn as a zone map — zones stacked by height (a cliff top above its harbour), places set by
// compass direction inside each zone, the ways between them, and each building's floors.
// Saved per chat (st.geo); asked again whenever the person wants; the last one can be put back.
import { clip } from '../core/text.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const R = (v) => Math.round(v * 10) / 10;
export const KINDS = ['home', 'shop', 'food', 'bath', 'work', 'street', 'school', 'other'];
const LIMIT = { zones: 8, places: 40, links: 60 };

// ── the question ──
export function geoPrompt({ known = [], recent = '', facts = '', lore = '', prev = '' }) {
    return `[OOC — this is not part of the story. Do NOT continue the story or write any narration.]
Task: map the story's setting. Read the setting notes and the story, then lay out where its places are.

[Setting notes]
${clip(lore, 6000) || '(none)'}

[What is known now]
${clip(facts, 1500) || '(nothing recorded)'}

[Places the story has visited (name · area · rooms · visits)]
${known.length ? known.map((p) => `- ${p.name}${p.area ? ` · ${p.area}` : ''}${p.rooms?.length ? ` · ${p.rooms.join(', ')}` : ''} · ${p.visits ?? 0}`).join('\n') : '(none yet)'}

[Latest part of the story]
${clip(recent, 6000) || '(none)'}
${prev ? `\n[The previous map — keep what still fits, fix what the story contradicts]\n${clip(prev, 3000)}\n` : ''}
Rules:
- Use what the notes and the story establish. Where they are silent, place things sensibly; do not invent major new places.
- Every place in [Places the story has visited] must appear (same name), unless it is clearly the same place as another.
- Names exactly as the story writes them. Notes in Korean, under 40 characters.
- ZONE level: 0 = the highest ground; larger numbers lie lower (a harbour below a cliff = 1). Zones on the same ground share a number.
- PLACE position: x 0-9 west to east, y 0-9 north to south, inside its zone.
- floors: "3F: room, room; 4F: room" for buildings with known floors or rooms, "-" otherwise.

Output ONLY these lines, nothing else (up to ${LIMIT.zones} zones, ${LIMIT.places} places, ${LIMIT.links} links):
ZONE: name | level | note
PLACE: name | zone | x,y | kind (${KINDS.join('/')}) | floors | note
LINK: place - place | how (walk 5 min / stairs / lift / bridge …)`;
}

// ── reading the answer ──
const field = (s) => String(s ?? '').trim();
export function parseGeo(raw) {
    const zones = [], places = [], links = [];
    for (let line of String(raw ?? '').split('\n')) {
        line = line.replace(/^[\s>*\-•·]+/, '').trim();
        const m = /^(ZONE|PLACE|LINK)\s*[:：]\s*(.+)$/i.exec(line);
        if (!m) continue;
        const f = m[2].split('|').map(field), kind = m[1].toUpperCase();
        if (kind === 'ZONE' && f[0] && zones.length < LIMIT.zones && !zones.some((z) => norm(z.name) === norm(f[0]))) {
            zones.push({ name: clip(f[0], 40), level: Number.isFinite(parseInt(f[1], 10)) ? Math.max(0, Math.min(9, parseInt(f[1], 10))) : zones.length, note: clip(f[2] ?? '', 80) });
        } else if (kind === 'PLACE' && f[0] && places.length < LIMIT.places && !places.some((p) => norm(p.name) === norm(f[0]))) {
            const xy = /(\d+)\s*[,/ ]\s*(\d+)/.exec(f[2] ?? '');
            const k = String(f[3] ?? '').toLowerCase().trim();
            places.push({ name: clip(f[0], 40), zone: clip(f[1] ?? '', 40), x: xy ? Math.min(9, +xy[1]) : null, y: xy ? Math.min(9, +xy[2]) : null, kind: KINDS.includes(k) ? k : '', floors: floorsText(f[4]), note: clip(f[5] ?? '', 80) });
        } else if (kind === 'LINK' && links.length < LIMIT.links) {
            const ab = /^(.+?)\s+(?:-|–|—|<->|↔|to)\s+(.+)$/.exec(f[0] ?? '');
            if (ab) links.push({ a: clip(ab[1], 40), b: clip(ab[2], 40), how: clip(f[1] ?? '', 40) });
        }
    }
    // a place whose zone was not listed gets that zone; zones keep the order they were given
    for (const p of places) if (p.zone && !zones.some((z) => norm(z.name) === norm(p.zone)) && zones.length < LIMIT.zones) zones.push({ name: p.zone, level: zones.length, note: '' });
    for (const p of places) if (!p.zone || !zones.some((z) => norm(z.name) === norm(p.zone))) p.zone = zones[0]?.name ?? '';
    return { zones, places, links };
}
// "3F: scrub room, office; 4F: Ward C" -> [{ lv: '3F', rooms: [...] }]
function floorsText(s) {
    const t = field(s);
    if (!t || t === '-' || /^none$/i.test(t)) return [];
    return t.split(';').map((x) => { const m = /^\s*([^:：]{1,12})[:：]\s*(.+)$/.exec(x); return m ? { lv: m[1].trim(), rooms: m[2].split(',').map(field).filter(Boolean).slice(0, 12) } : { lv: '', rooms: x.split(',').map(field).filter(Boolean).slice(0, 12) }; }).filter((f) => f.rooms.length).slice(0, 12);
}
// back to the lines, for the person to edit by hand
export function geoText(G) {
    if (!G) return '';
    return [...G.zones.map((z) => `ZONE: ${z.name} | ${z.level} | ${z.note}`),
        ...G.places.map((p) => `PLACE: ${p.name} | ${p.zone} | ${p.x ?? ''},${p.y ?? ''} | ${p.kind || 'other'} | ${p.floors.length ? p.floors.map((f) => `${f.lv ? `${f.lv}: ` : ''}${f.rooms.join(', ')}`).join('; ') : '-'} | ${p.note}`),
        ...G.links.map((l) => `LINK: ${l.a} - ${l.b} | ${l.how}`)].join('\n');
}

// Which geo place a recorded place is: the same name, or one name inside the other (4+ letters).
export function matcher(G) {
    const L = G.places.map((p) => ({ p, k: norm(p.name) }));
    return (name) => {
        const n = norm(name);
        if (!n) return null;
        return L.find((x) => x.k === n)?.p ?? L.find((x) => (x.k.length >= 4 && n.includes(x.k)) || (n.length >= 4 && x.k.includes(n)))?.p ?? null;
    };
}

// ── drawing ──
// One zone (or all of them stacked, highest on top). Inside a zone the places keep their compass order but are
// spread to fill the panel; labels go where they collide least; people are a face and a count.
// here: geo name of where the story is now; seen: Set of geo names visited; sel: selected; zone: '' = all.
const textW = (t, fs) => { let w = 0; for (const ch of String(t)) w += ch.codePointAt(0) > 0x2000 ? fs * 1.0 : fs * 0.56; return w; };
const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
export function geoSvg(G, { here = '', seen = new Set(), sel = '', ppl = new Map(), icons = {}, zone = '' } = {}) {
    const W = 160, GAP = 14, FS = 4.2;
    const zs = [...G.zones].sort((a, b) => a.level - b.level).filter((z) => !zone || norm(z.name) === norm(zone));
    const inZone = (z) => G.places.filter((p) => norm(p.zone) === norm(z.name));
    // a zone whose places all sit on one row is drawn low; others full height
    const zh = new Map(zs.map((z) => { const ys = inZone(z).map((p) => p.y ?? 4); return [norm(z.name), ys.length && Math.max(...ys) > Math.min(...ys) ? 100 : 56]; }));
    const top = new Map(); let acc = 0;
    for (const z of zs) { top.set(norm(z.name), acc); acc += zh.get(norm(z.name)) + GAP; }
    const pos = new Map();
    for (const z of zs) {
        const ps = inZone(z), ZH = zh.get(norm(z.name));
        ps.forEach((p, i) => { if (p.x == null) { p._x = i % 10; p._y = Math.floor(i / 10) * 3 + 4; } else { p._x = p.x; p._y = p.y; } });
        const xs = ps.map((p) => p._x), ys = ps.map((p) => p._y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const sx = (v) => (x1 > x0 ? 26 + ((v - x0) / (x1 - x0)) * (W - 52) : W / 2), sy = (v) => (y1 > y0 ? 22 + ((v - y0) / (y1 - y0)) * (ZH - 38) : ZH / 2 + 6);
        const used = [];
        for (const p of ps) {
            let x = sx(p._x), y = top.get(norm(z.name)) + sy(p._y);
            for (let k = 0; k < 8 && used.some((q) => Math.hypot(q[0] - x, q[1] - y) < 9); k++) { x += 9; if (x > W - 10) { x = 14; y += 9; } }
            used.push([x, y]);
            pos.set(norm(p.name), { x: R(x), y: R(y), p });
        }
    }
    const H = Math.max(1, acc - GAP);
    const at = (n) => pos.get(norm(n)) ?? [...pos.values()].find((v) => norm(v.p.name).includes(norm(n)) || norm(n).includes(norm(v.p.name)));
    let s = `<svg class="mbg-map" viewBox="0 0 ${W} ${R(H)}" data-fit="0 0 ${W} ${R(H)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="지도">`;
    s += zs.map((z) => { const y = top.get(norm(z.name)); return `<g class="zone"><rect x="1" y="${y}" width="${W - 2}" height="${zh.get(norm(z.name))}" rx="5"/><text class="zn" x="6" y="${R(y + 8)}"><tspan data-trc="place">${esc(z.name)}</tspan>${z.note ? `<tspan class="zno"> · ${esc(clip(z.note, 34))}</tspan>` : ''}</text></g>`; }).join('');
    // ways (a way to a zone not shown: a short stub with where it goes)
    const outs = new Map();
    for (const l of G.links) {
        const A = at(l.a), B = at(l.b);
        if (A && B && A !== B) {
            const cross = norm(A.p.zone) !== norm(B.p.zone);
            s += `<line class="way${cross ? ' riser' : ''}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
            if (cross && l.how) s += `<text class="how" x="${R((A.x + B.x) / 2 + 2)}" y="${R((A.y + B.y) / 2)}">${esc(clip(l.how, 18))}</text>`;
        } else if ((A || B) && zone) { const P = A ?? B; (outs.get(P) ?? outs.set(P, []).get(P)).push(`${A ? l.b : l.a}${l.how ? ` · ${l.how}` : ''}`); }
    }
    // places, then labels where they overlap least
    const dots = [...pos.values()].flatMap(({ x, y, p }) => [[x - 3, y - 3, 6, 6], ...((ppl.get(norm(p.name)) ?? []).length ? [[x + 2.6, y - 7.4, 9, 5.5]] : [])]), taken = [...dots];
    let marks = '', labels = '';
    for (const v of pos.values()) {
        const { x, y, p } = v, n = norm(p.name), isHere = n === norm(here);
        const cls = `${isHere ? ' here' : ''}${seen.has(n) ? ' seen' : ' unseen'}${norm(sel) === n ? ' sel' : ''}`;
        const who = ppl.get(n) ?? [], o = outs.get(v) ?? [];
        marks += `<g class="pl${cls}" data-act="geosel" data-v="${esc(p.name)}"><circle class="hit" cx="${x}" cy="${y}" r="7"/>${isHere ? `<circle class="ring" cx="${x}" cy="${y}" r="5"/>` : ''}<circle class="dot" cx="${x}" cy="${y}" r="${isHere ? 3 : 2.4}"/>`
            + (who.length ? `<text class="who mb4-notr" x="${R(x + 3.2)}" y="${R(y - 3)}">${who[0]}${who.length > 1 ? `<tspan class="cnt">+${who.length - 1}</tspan>` : ''}</text>` : '')
            + (o.length ? `<text class="out" x="${R(x)}" y="${R(y - 5.5)}">↗ ${esc(clip(o[0], 30))}</text>` : '') + '</g>';
        const txt = `${icons[p.kind] ?? ''} ${clip(p.name, 18)}`, w = textW(txt, FS) + 1;
        const cands = [['m', 0, 7.2], ['m', 0, -4.6], ['s', 4.5, 1.5], ['e', -4.5, 1.5], ['m', 0, 12.4], ['m', 0, -9.8], ['s', 4, 7], ['e', -4, 7]].map(([an, dx, dy], i) => {
            const bx = an === 'm' ? x - w / 2 : an === 's' ? x + dx : x + dx - w, box = [bx, y + dy - FS, w, FS + 1];
            return { an, dx, dy, box, score: -taken.filter((t) => hit(box, t)).length * 4 - (bx < 1 || bx + w > W - 1 ? 3 : 0) - i * 0.1 };
        });
        const L = cands.reduce((m, c) => (c.score > m.score ? c : m), cands[0]);
        taken.push(L.box);
        labels += `<text class="nm${cls}" data-act="geosel" data-v="${esc(p.name)}" x="${R(x + L.dx)}" y="${R(y + L.dy)}" style="text-anchor:${L.an === 'm' ? 'middle' : L.an === 's' ? 'start' : 'end'}"><tspan class="mb4-notr">${icons[p.kind] ?? ''} </tspan><tspan data-trc="place">${esc(clip(p.name, 18))}</tspan></text>`;
    }
    return `${s}${marks}${labels}</svg>`;
}

// ── moving the map: drag, two fingers, wheel, ＋ － ◎ ⤢ (the first generation's map, carried over) ──
// Only the viewBox changes; the drawing is not redone. keep(vb) is told every change so a repaint can put it back.
const box = (svg) => svg.getAttribute('viewBox').split(/\s+/).map(Number);
const R10 = (v) => Math.round(v * 10) / 10;
export function zoomBox(vb, f, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) {
    const w = Math.min(Math.max(vb[2] * f, 20), 600), h = vb[3] * (w / vb[2]);
    return [cx - (cx - vb[0]) * (w / vb[2]), cy - (cy - vb[1]) * (h / vb[3]), w, h].map(R10);
}
export function wireZoom(svg, keep = () => {}) {
    if (!svg || svg._mbgWired) return;
    svg._mbgWired = true;
    const set = (vb) => { svg.setAttribute('viewBox', vb.join(' ')); keep(vb); };
    let drag = null;
    const pinch = () => { const [a, b] = [...drag.pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
    const restart = () => { drag.vb = box(svg); drag.start = new Map([...drag.pts].map(([k, v]) => [k, { ...v }])); drag.pin = drag.pts.size === 2 ? pinch() : null; };
    svg.addEventListener('pointerdown', (e) => { drag ??= { pts: new Map(), moved: false }; drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); restart(); });
    svg.addEventListener('pointermove', (e) => {
        if (!drag?.pts.has(e.pointerId)) return;
        drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = svg.getBoundingClientRect(); if (!r.width) return;
        const vb = drag.vb, k = Math.max(vb[2] / r.width, vb[3] / r.height);
        if (drag.pin && drag.pts.size >= 2) {
            const now = pinch(), cx = vb[0] + (drag.pin.cx - r.left) * k, cy = vb[1] + (drag.pin.cy - r.top) * k, z = zoomBox(vb, drag.pin.d / now.d, cx, cy), k2 = z[2] / r.width;
            drag.moved = true; set([z[0] - (now.cx - drag.pin.cx) * k2, z[1] - (now.cy - drag.pin.cy) * k2, z[2], z[3]].map(R10)); return;
        }
        const st = drag.start.get(e.pointerId); if (!st) return;
        if (!drag.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 5) return;
        if (!drag.moved) try { svg.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
        drag.moved = true; set([vb[0] - (e.clientX - st.x) * k, vb[1] - (e.clientY - st.y) * k, vb[2], vb[3]].map(R10));
    });
    const end = (e) => {
        if (!drag) return;
        drag.pts.delete(e.pointerId);
        if (drag.pts.size) { restart(); return; }
        if (drag.moved) { svg._dragged = true; setTimeout(() => { svg._dragged = false; }, 60); }
        drag = null;
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('click', (e) => { if (svg._dragged) { e.stopPropagation(); e.preventDefault(); } }, true);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(), vb = box(svg), k = Math.max(vb[2] / r.width, vb[3] / r.height); set(zoomBox(vb, e.deltaY > 0 ? 1.2 : 1 / 1.2, vb[0] + (e.clientX - r.left) * k, vb[1] + (e.clientY - r.top) * k)); }, { passive: false });
}
// ＋ － ◎ ⤢
export function zoomStep(svg, what, keep = () => {}) {
    if (!svg) return;
    const vb = box(svg), fit = String(svg.dataset.fit ?? '').split(/\s+/).map(Number);
    let out = vb;
    if (what === 'in') out = zoomBox(vb, 1 / 1.4);
    else if (what === 'out') out = zoomBox(vb, 1.4);
    else if (what === 'fit') out = fit;
    else if (what === 'here') { const c = svg.querySelector('.pl.here .dot'); if (c) { const x = +c.getAttribute('cx'), y = +c.getAttribute('cy'), w = Math.min(fit[2], 70), h = w * (vb[3] / vb[2]); out = [x - w / 2, y - h / 2, w, h].map(R10); } }
    svg.setAttribute('viewBox', out.join(' ')); keep(what === 'fit' ? null : out);
}

export const GEO_CSS = `
.mbg-wrap { position: relative; border-radius: 14px; overflow: hidden; background: var(--fill, rgba(0,0,0,.03)); touch-action: none; }
.mbg-map { width: 100%; height: auto; max-height: 62vh; display: block; font-family: inherit; touch-action: none; user-select: none; cursor: grab; }
.mbg-map:active { cursor: grabbing; }
.mbg-ctl { position: absolute; right: 8px; bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.mbg-ctl button { width: 34px; height: 34px; border: 0; border-radius: 10px; background: var(--card, #fff); color: var(--fg); font-size: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.15); cursor: pointer; }
.mbg-zones { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.mbg-map .zone rect { fill: var(--card, #fff); fill-opacity: .55; stroke: color-mix(in srgb, var(--a) 35%, transparent); stroke-width: .5; }
.mbg-map .zn { font-size: 5.2px; font-weight: 700; fill: var(--fg); } .mbg-map .zno { font-weight: 400; fill: var(--sub); font-size: 4px; }
.mbg-map .way { stroke: var(--sub); stroke-width: .8; opacity: .5; stroke-linecap: round; } .mbg-map .way.riser { stroke-dasharray: 2 1.6; stroke: var(--a); opacity: .85; }
.mbg-map .how, .mbg-map .out { font-size: 3.4px; fill: var(--a); } .mbg-map .out { text-anchor: middle; }
.mbg-map .pl, .mbg-map .nm { cursor: pointer; } .mbg-map .hit { fill: transparent; }
.mbg-map .dot { fill: var(--card, #fff); stroke: var(--fg); stroke-width: .7; }
.mbg-map .seen .dot { fill: var(--fg); } .mbg-map .unseen .dot { stroke-dasharray: 1.2 .9; stroke-opacity: .65; }
.mbg-map .here .dot { fill: var(--a); stroke: var(--a); } .mbg-map .ring { fill: none; stroke: var(--a); stroke-width: .8; opacity: .45; }
.mbg-map .sel .dot { stroke: var(--a); stroke-width: 1.3; }
.mbg-map .nm { font-size: 4.2px; fill: var(--fg); paint-order: stroke; stroke: var(--card, #fff); stroke-width: 1.1px; stroke-linejoin: round; }
.mbg-map .nm.unseen { fill: var(--sub); } .mbg-map .nm.here, .mbg-map .nm.sel { font-weight: 700; }
.mbg-map .who { font-size: 4.4px; } .mbg-map .cnt { font-size: 3.2px; fill: var(--sub); }
.mbg-floors { display: grid; gap: 4px; margin-top: 6px; }
.mbg-floor { display: flex; gap: 8px; align-items: baseline; font-size: 13px; } .mbg-floor b { min-width: 2.6em; color: var(--a); }
.mbg-floor .on { font-weight: 700; } .mbg-raw { width: 100%; min-height: 160px; font: 12px/1.4 ui-monospace, monospace; }
`;
