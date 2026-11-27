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
// zones top to bottom by level; places on their grid; ways inside a zone as lines, ways between zones as dashed
// risers with a label. here: geo name of where the story is now; seen: Set of geo names visited; sel: selected.
export function geoSvg(G, { here = '', seen = new Set(), sel = '', ppl = new Map(), icons = {} } = {}) {
    const W = 100, PAD = 3, ZH = 40, GAP = 9, zs = [...G.zones].sort((a, b) => a.level - b.level);
    const pos = new Map(), zoneY = new Map();
    zs.forEach((z, i) => zoneY.set(norm(z.name), PAD + i * (ZH + GAP)));
    const taken = new Set();
    for (const p of G.places) {
        const top = zoneY.get(norm(p.zone)) ?? PAD;
        let gx = p.x ?? 0, gy = p.y ?? 0;
        if (p.x == null) { gx = [...G.places].filter((q) => q.zone === p.zone).indexOf(p) % 10; gy = 4; }
        let key = `${p.zone}|${gx}|${gy}`, nudge = 0;
        while (taken.has(key) && nudge < 9) { gx = (gx + 1) % 10; key = `${p.zone}|${gx}|${gy}`; nudge++; }
        taken.add(key);
        pos.set(norm(p.name), { x: R(8 + gx * 9.4), y: R(top + 9 + gy * ((ZH - 15) / 9)), p });
    }
    const H = PAD * 2 + zs.length * ZH + Math.max(0, zs.length - 1) * GAP;
    const at = (n) => pos.get(norm(n)) ?? [...pos.values()].find((v) => norm(v.p.name).includes(norm(n)) || norm(n).includes(norm(v.p.name)));
    let s = `<svg class="mbg-map" viewBox="0 0 ${W} ${R(H)}" preserveAspectRatio="xMidYMin meet" role="img" aria-label="지도">`;
    s += zs.map((z) => { const y = zoneY.get(norm(z.name)); return `<g class="zone"><rect x="1.5" y="${y}" width="${W - 3}" height="${ZH}" rx="3"/><text class="zn" x="4" y="${R(y + 4.6)}"><tspan data-trc="place">${esc(z.name)}</tspan>${z.note ? `<tspan class="zno"> · ${esc(clip(z.note, 30))}</tspan>` : ''}</text></g>`; }).join('');
    // ways
    for (const l of G.links) {
        const A = at(l.a), B = at(l.b);
        if (!A || !B || A === B) continue;
        const cross = norm(A.p.zone) !== norm(B.p.zone);
        s += `<line class="way${cross ? ' riser' : ''}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
        if (cross && l.how) s += `<text class="how" x="${R((A.x + B.x) / 2 + 1.5)}" y="${R((A.y + B.y) / 2)}">${esc(clip(l.how, 16))}</text>`;
    }
    // places
    for (const { x, y, p } of pos.values()) {
        const n = norm(p.name), isHere = n === norm(here), cls = `${isHere ? ' here' : ''}${seen.has(n) ? ' seen' : ' unseen'}${norm(sel) === n ? ' sel' : ''}`;
        const who = ppl.get(n) ?? [];
        s += `<g class="pl${cls}" data-act="geosel" data-v="${esc(p.name)}"><circle class="hit" cx="${x}" cy="${y}" r="5"/>${isHere ? `<circle class="ring" cx="${x}" cy="${y}" r="3.9"/>` : ''}<circle class="dot" cx="${x}" cy="${y}" r="${isHere ? 2.4 : 1.9}"/>`
            + `<text class="nm" x="${x}" y="${R(y + 5.2)}"><tspan class="mb4-notr">${icons[p.kind] ?? ''} </tspan><tspan data-trc="place">${esc(clip(p.name, 14))}</tspan></text>`
            + (who.length ? `<text class="who mb4-notr" x="${R(x + 2.6)}" y="${R(y - 1.8)}">${who.slice(0, 3).join('')}${who.length > 3 ? '…' : ''}</text>` : '') + '</g>';
    }
    return `${s}</svg>`;
}

export const GEO_CSS = `
.mbg-map { width: 100%; height: auto; display: block; font-family: inherit; }
.mbg-map .zone rect { fill: color-mix(in srgb, var(--a) 6%, var(--card, transparent)); stroke: color-mix(in srgb, var(--a) 30%, transparent); stroke-width: .35; }
.mbg-map .zn { font-size: 3.1px; font-weight: 700; fill: var(--fg); } .mbg-map .zno { font-weight: 400; fill: var(--sub); }
.mbg-map .way { stroke: var(--sub); stroke-width: .5; opacity: .55; } .mbg-map .way.riser { stroke-dasharray: 1.2 1; stroke: var(--a); opacity: .8; }
.mbg-map .how { font-size: 2.4px; fill: var(--a); }
.mbg-map .pl { cursor: pointer; } .mbg-map .hit { fill: transparent; }
.mbg-map .dot { fill: var(--card, #fff); stroke: var(--fg); stroke-width: .45; }
.mbg-map .seen .dot { fill: var(--fg); } .mbg-map .unseen .dot { stroke-dasharray: .8 .6; stroke-opacity: .7; } .mbg-map .unseen .nm { opacity: .6; }
.mbg-map .here .dot { fill: var(--a); stroke: var(--a); } .mbg-map .ring { fill: none; stroke: var(--a); stroke-width: .5; opacity: .5; }
.mbg-map .sel .dot { stroke: var(--a); stroke-width: .9; }
.mbg-map .nm { font-size: 2.6px; text-anchor: middle; fill: var(--fg); } .mbg-map .who { font-size: 2.6px; }
.mbg-floors { display: grid; gap: 4px; margin-top: 6px; }
.mbg-floor { display: flex; gap: 8px; align-items: baseline; font-size: 13px; } .mbg-floor b { min-width: 2.6em; color: var(--a); }
.mbg-floor .on { font-weight: 700; } .mbg-raw { width: 100%; min-height: 160px; font: 12px/1.4 ui-monospace, monospace; }
`;
