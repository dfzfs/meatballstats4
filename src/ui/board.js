// 🗂 the map as a floor guide (층별 안내판): areas stacked by height, places as big tiles you can read without zooming.
// Everything here is drawn by hand (little SVG icons and faces), so it looks the same on every phone.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };

// ── icons: one line drawing per kind of place; a few names get their own picture ──
const P = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    food: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4M8 21h8"/>',
    bath: '<path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V5a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
    street: '<path d="M8 3 5 21M16 3l3 18M12 4v3M12 11v3M12 18v3"/>',
    school: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M7 11v5c3 2 7 2 10 0v-5"/>',
    other: '<path d="M12 21c-5-6-7-9-7-12a7 7 0 0 1 14 0c0 3-2 6-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    castle: '<path d="M4 21V9h2V7h2v2h2V7h4v2h2V7h2v2h2v12z"/><path d="M10 21v-5a2 2 0 0 1 4 0v5"/>',
    hospital: '<rect x="4" y="6" width="16" height="15" rx="1"/><path d="M12 9v6M9 12h6M9 6V3h6v3"/>',
    ship: '<path d="M3 15h18l-3 5H6z"/><path d="M12 15V4l6 8h-6"/>',
    tree: '<path d="M12 21v-7"/><path d="M12 3c-4 0-6 3-6 6s3 5 6 5 6-2 6-5-2-6-6-6z"/>',
    lift: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M9 9l3-3 3 3M9 15l3 3 3-3"/>',
    isle: '<path d="M3 17c3-3 6 3 9 0s6 3 9 0"/><path d="M7 13c1-4 3-6 5-6s4 2 5 6"/>',
    tower: '<path d="M9 21V8l3-5 3 5v13z"/><path d="M11 12h2M11 16h2"/>',
    gate: '<path d="M4 21V8a8 8 0 0 1 16 0v13"/><path d="M8 21v-9a4 4 0 0 1 8 0v9"/>',
};
const BY_NAME = [
    ['castle', /castle|palace|fortress|keep|chancery|chancellery|성\b|궁|요새|성채/i],
    ['hospital', /hospital|clinic|infirmary|medical|ward|병원|의무실|진료/i],
    ['ship', /ship|boat|ferry|galley|deck|cabin|harbou?r|port|dock|배\b|선박|항구|부두|갑판/i],
    ['tree', /garden|grove|forest|park|glasshouse|greenhouse|conservatory|숲|정원|온실|공원/i],
    ['lift', /lift|elevator|stair|escalator|승강기|엘리베이터|계단/i],
    ['isle', /isle|island|beach|shore|섬|해변|바닷가/i],
    ['tower', /tower|spire|lighthouse|탑|등대/i],
    ['gate', /gate|bridge|entrance|문\b|다리|입구|관문/i],
];
export function iconOf(kind, name = '') {
    const k = BY_NAME.find(([, re]) => re.test(name))?.[0] ?? (P[kind] ? kind : 'other');
    return `<svg class="mbb-ico" viewBox="0 0 24 24" aria-hidden="true">${P[k]}</svg>`;
}

// ── faces: a small drawn face per person (hair colour and cut from the name, so it stays the same) ──
const HAIR = ['#3b2b25', '#1f2a44', '#8a5a2b', '#c9a24a', '#a33b3b', '#5b6b7b', '#e8e2d0', '#2e5e4e'];
const CUT = [
    (c) => `<path d="M4 12.5a8 8 0 0 1 16 0c-3-2.4-9-3-16 0z" fill="${c}"/>`,
    (c) => `<path d="M4 13a8 8 0 0 1 16 0c-2-1-3-3-4-3-2 2-6 2-12 3z" fill="${c}"/><path d="M4 13c0 3 0 5 1 7l1-6z" fill="${c}"/><path d="M20 13c0 3 0 5-1 7l-1-6z" fill="${c}"/>`,
    (c) => `<path d="M4.5 12 6 6l2 3 2-5 2 4 2-4 2 5 2-3 1.5 6c-5-2-10-2-15 0z" fill="${c}"/>`,
];
export function faceOf(name, cls = '') {
    const h = hash(name), hair = HAIR[h % HAIR.length], cut = CUT[(h >>> 3) % CUT.length];
    return `<svg class="mbb-face ${cls}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="#f7d9bd"/>${cut(hair)}<circle cx="9.2" cy="14" r="1.1" fill="#3b2b25"/><circle cx="14.8" cy="14" r="1.1" fill="#3b2b25"/><path d="M10.2 17.2q1.8 1.4 3.6 0" fill="none" stroke="#3b2b25" stroke-width="1" stroke-linecap="round"/><circle cx="7.6" cy="16.2" r="1" fill="#f2a0a0" opacity=".6"/><circle cx="16.4" cy="16.2" r="1" fill="#f2a0a0" opacity=".6"/></svg>`;
}

// ── a strip of scenery behind each area's name, picked from its name and note ──
const ART = [
    [/cliff|mountain|high|upper|summit|peak|sky|heaven|holy|castle|palace|절벽|산|위|높|상층|하늘|성/i, '<path d="M0 36 40 12l26 16 34-22 40 30z" class="a1"/><path d="M110 36l50-20 30 12 40-18 50 26z" class="a2"/><path d="M220 36l40-24 30 14 30-10v20z" class="a1"/>'],
    [/ship|boat|ferry|fleet|배|선박|함대/i, '<path d="M0 28q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0v8H0z" class="a2"/><path d="M200 24h50l-8 7h-34z" class="a1"/><path d="M224 24V8l14 12z" class="a1"/>'],
    [/sea|water|isle|island|harbou?r|port|reed|lake|river|coast|lower|바다|물|섬|항|강|호수|해안|아래|하층/i, '<path d="M0 26q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0v10H0z" class="a2"/><path d="M0 31q20-6 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0v5H0z" class="a1"/>'],
    [/forest|grove|garden|wood|park|숲|정원|공원/i, '<path d="M20 36l12-22 12 22zM60 36l14-26 14 26zM150 36l12-20 12 20zM240 36l14-24 14 24zM290 36l10-18 10 18z" class="a1"/>'],
];
const CITY = '<path d="M0 36V22h20v-8h16v14h18V10h14v26zM90 36V18h22v-6h12v24zM150 36V14h16v8h20V6h12v30zM230 36V20h18v-8h14v24zM280 36V16h20v20h20v16z" class="a2"/>';
const artOf = (z) => `<svg class="mbb-art" viewBox="0 0 320 36" preserveAspectRatio="none" aria-hidden="true">${ART.find(([re]) => re.test(`${z.name} ${z.note ?? ''}`))?.[1] ?? CITY}</svg>`;

// ── the board ──
// Areas (zones) first, top (highest) to bottom; each holds its places, north before south, west before east.
// places: [{key,name,kind,visits,area,first,fls,geo:{x,y}}], zones: [{name,note,level}]
export function bandsOf(places, zones) {
    const zs = zones.length ? zones : [];
    const inZone = new Map(zs.map((z) => [norm(z.name), []])), rest = [];
    for (const p of places) (inZone.get(norm(p.area)) ?? rest).push(p);
    const bands = zs.map((z) => ({ key: norm(z.name), name: z.name, note: z.note ?? '', list: inZone.get(norm(z.name)) })).filter((b) => b.list.length);
    if (rest.length) bands.push({ key: bands.length ? '~' : '', name: bands.length ? '그 밖' : '', note: '', list: rest });
    for (const b of bands) b.list.sort((a, c) => ((a.geo?.y ?? 99) - (c.geo?.y ?? 99)) || ((a.geo?.x ?? 99) - (c.geo?.x ?? 99)) || (a.first - c.first));
    return bands;
}
// the first screen: only the big area names, one big card each
// o: { bands, hereKey, people:(p)=>[{name,now}] }
export function zonesView(o) {
    return `<div class="mbb-zones">${o.bands.map((b, i) => {
        const mine = b.list.some((p) => p.key === o.hereKey), seen = b.list.filter((p) => p.visits).length;
        const ppl = [...new Map(b.list.flatMap((p) => o.people(p)).map((x) => [x.name, x])).values()];
        return `<button class="mbb-zone ${mine ? 'mine' : ''}" data-act="zone" data-v="${esc(b.key)}">${artOf(b)}
            <span class="mbb-zbody"><span class="mbb-zname"><b data-trc="place">${esc(b.name || '전체')}</b>${mine ? '<span class="mbb-badge">여기</span>' : ''}</span>
            ${b.note ? `<span class="mbb-znote" data-trc="phrase">${esc(b.note)}</span>` : ''}
            <span class="mbb-zmeta">${i === 0 && o.bands.length > 1 ? '▲ 제일 위 · ' : ''}${b.list.length}곳${seen < b.list.length ? ` (가 본 곳 ${seen})` : ''}${ppl.length ? `<span class="mbb-zppl">${ppl.slice(0, 5).map((x) => faceOf(x.name)).join('')}${ppl.length > 5 ? `<small>+${ppl.length - 5}</small>` : ''}</span>` : ''}</span></span>
            <svg class="mbb-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>`;
    }).join('')}</div>`;
}
// inside one area: its places as tiles, and the ways out to the other areas
// o: { band, hereKey, selKey, kindKo, people, order, out:[{zone,zoneName,from,to,how}], back:boolean }
export function zoneView(o) {
    const b = o.band;
    const tile = (p) => {
        const here = p.key === o.hereKey, sel = p.key === o.selKey, ppl = o.people(p), ord = o.order?.(p.name) ?? 0;
        const sub = [p.kind === 'other' ? '' : o.kindKo[p.kind], p.fls?.length ? `${p.fls.length}층` : '', p.visits ? '' : '안 가 봄'].filter(Boolean).join(' · ');
        const who = ppl.length ? `<span class="mbb-who">${ppl.slice(0, 3).map((x) => `<span class="mbb-pp ${x.now ? 'now' : ''}">${faceOf(x.name)}<span data-trc="name">${esc(x.name)}</span></span>`).join('')}${ppl.length > 3 ? `<span class="mbb-more">+${ppl.length - 3}</span>` : ''}</span>` : '';
        return `<button class="mbb-tile ${here ? 'here' : ''} ${sel ? 'sel' : ''} ${p.visits ? '' : 'new'}" data-act="mapsel" data-v="${esc(p.name)}">
            <span class="mbb-top">${iconOf(p.kind, p.name)}${here ? '<span class="mbb-badge">여기</span>' : ord ? `<span class="mbb-ord">${ord}</span>` : ''}</span>
            <span class="mbb-nm" data-trc="place">${esc(p.name)}</span>${sub ? `<span class="mbb-sub">${esc(sub)}</span>` : ''}${who}</button>`;
    };
    const head = b.name || o.back ? `<header class="mbb-hd big">${artOf(b)}${o.back ? '<button class="mbb-back" data-act="zone" data-v="" aria-label="전체 지역"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>전체 지역</button>' : ''}<span class="mbb-zn"><b data-trc="place">${esc(b.name)}</b>${b.note ? ` <small data-trc="phrase">${esc(b.note)}</small>` : ''}</span></header>` : '';
    const outs = o.out.length ? `<div class="mbb-outs">${o.out.map((w) => `<button class="mbb-out" data-act="zone" data-v="${esc(w.zone)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M7 15l5 5 5-5M7 9l5-5 5 5"/></svg><span><span data-trc="place">${esc(w.from)}</span> → <b data-trc="place">${esc(w.zoneName)}</b> <small data-trc="place">${esc(w.to)}${w.how ? ` · ${esc(w.how)}` : ''}</small></span></button>`).join('')}</div>` : '';
    return `<section class="mbb-band">${head}<div class="mbb-grid">${b.list.map(tile).join('')}</div>${outs}</section>`;
}

export const BOARD_CSS = `
.mbb-zones{display:flex;flex-direction:column;gap:10px}
.mbb-zone{all:unset;box-sizing:border-box;position:relative;display:flex;align-items:center;gap:8px;min-height:96px;padding:14px 12px 14px 16px;border-radius:18px;border:1px solid var(--line);background:var(--card,#fff);overflow:hidden;cursor:pointer;color:var(--fg)}
.mbb-zone:hover{border-color:color-mix(in srgb,var(--a) 50%,var(--line))}
.mbb-zone.mine{border:2px solid var(--a)}
.mbb-zone .mbb-art{top:auto;height:60%}
.mbb-zbody{position:relative;flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}
.mbb-zname{display:flex;align-items:center;gap:8px;font-size:21px;line-height:1.2}
.mbb-znote{font-size:13px;color:var(--sub)}
.mbb-zmeta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sub)}
.mbb-zppl{display:inline-flex;align-items:center}.mbb-zppl .mbb-face{margin-right:-4px}
.mbb-chev{position:relative;width:22px;height:22px;flex:none;fill:none;stroke:var(--sub);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.mbb-hd.big{flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:8px;min-height:92px;padding:10px 12px 8px}
.mbb-hd.big .mbb-zn{font-size:20px}.mbb-hd.big .mbb-zn small{font-size:13px}
.mbb-back{all:unset;position:relative;display:inline-flex;align-items:center;gap:2px;font-size:13px;font-weight:600;color:var(--a);cursor:pointer;padding:2px 8px 2px 2px;border-radius:999px;background:color-mix(in srgb,var(--card,#fff) 80%,transparent)}
.mbb-back svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.mbb-outs{display:flex;flex-direction:column;gap:4px;padding:0 10px 10px}
.mbb-out{all:unset;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--a) 7%,transparent);font-size:13px;cursor:pointer;color:var(--fg)}
.mbb-out small{color:var(--sub)}
.mbb-out svg{width:18px;height:18px;flex:none;fill:none;stroke:var(--a);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.mbb-band{border:1px solid var(--line);border-radius:16px;background:var(--card,#fff);overflow:hidden}
.mbb-hd{position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:8px;padding:16px 12px 6px;min-height:46px}
.mbb-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.mbb-art .a1{fill:color-mix(in srgb,var(--a) 16%,transparent)}.mbb-art .a2{fill:color-mix(in srgb,var(--a) 9%,transparent)}
.mbb-zn{position:relative;font-size:15px;line-height:1.3}.mbb-zn small{color:var(--sub);font-size:12px;font-weight:400}
.mbb-n{position:relative;font-size:12px;color:var(--sub);white-space:nowrap}
.mbb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px 10px 10px}
.mbb-tile{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:3px;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--card,#fff);cursor:pointer;min-height:74px;color:var(--fg)}
.mbb-tile:hover{border-color:color-mix(in srgb,var(--a) 50%,var(--line))}
.mbb-tile.new{border-style:dashed;background:transparent}.mbb-tile.new .mbb-nm{color:var(--sub)}
.mbb-tile.here{border:2px solid var(--a);background:color-mix(in srgb,var(--a) 10%,var(--card,#fff))}
.mbb-tile.sel:not(.here){box-shadow:0 0 0 2px color-mix(in srgb,var(--a) 45%,transparent)}
.mbb-top{display:flex;align-items:center;justify-content:space-between}
.mbb-ico{width:24px;height:24px;fill:none;stroke:var(--a);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.mbb-tile.new .mbb-ico{stroke:var(--sub)}
.mbb-badge{font-size:11px;font-weight:700;color:#fff;background:var(--a);border-radius:999px;padding:1px 8px}
.mbb-ord{font-size:11px;font-weight:800;color:#fff;background:var(--love,#e0567f);border-radius:999px;min-width:18px;text-align:center;padding:1px 5px}
.mbb-nm{font-size:15px;font-weight:700;line-height:1.25;word-break:keep-all;overflow-wrap:anywhere}
.mbb-sub{font-size:12px;color:var(--sub)}
.mbb-who{display:flex;flex-wrap:wrap;gap:3px 8px;margin-top:3px}
.mbb-pp{display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--sub)}.mbb-pp.now{color:var(--fg);font-weight:600}
.mbb-face{width:22px;height:22px;flex:none}
.mbb-more{font-size:12px;color:var(--sub)}
.mbx-maphead .mbb-face{width:18px;height:18px;vertical-align:-4px}
`;
