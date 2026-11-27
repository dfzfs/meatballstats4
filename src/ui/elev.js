// 🏢 Building cross-section (the first generation's 「정면도」, carried over): a building cut open from the front,
// every floor and room on one picture — upper floors on top, basements under the ground line, a stair shaft from
// two floors up, a rooftop as a railing. Drawing only.
//   fls = [{ name, rooms: [{ name, items? }] }] bottom floor first · o = { act, on(f, r), arg(f, r), at(f), me, pinsAt(f, r), home }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t; };
const R = (v) => Math.round(v * 100) / 100;
const FURN = [
    [/침대|bed|요$|이불|매트리스/i, '🛏️'], [/소파|sofa|couch|안락의자/i, '🛋️'], [/의자|chair|stool|스툴|벤치|bench/i, '🪑'], [/책상|desk|탁자|테이블|table|식탁/i, '🪵'],
    [/책장|책꽂이|bookshel|서가|책$|book/i, '📚'], [/화분|식물|plant|꽃|flower|나무|tree|선인장/i, '🪴'], [/램프|등$|조명|lamp|light|스탠드|촛|candle|랜턴|lantern/i, '💡'],
    [/거울|mirror/i, '🪞'], [/그림|액자|painting|picture|poster|포스터|사진/i, '🖼️'], [/tv|텔레비전|티비|모니터|monitor|컴퓨터|computer|pc$/i, '📺'], [/시계|clock/i, '🕰️'],
    [/냉장고|fridge|refrigerator/i, '🧊'], [/난로|벽난로|fireplace|stove|화로|히터|heater/i, '🔥'], [/욕조|bath|샤워|shower/i, '🛁'], [/변기|toilet/i, '🚽'], [/러그|카펫|carpet|rug|매트|mat$/i, '🧶'],
    [/커튼|curtain|블라인드/i, '🪟'], [/옷장|장롱|wardrobe|closet|서랍|drawer|수납|선반|shelf|cabinet|캐비닛/i, '🗄️'], [/인형|doll|곰|bear|장난감|toy/i, '🧸'], [/피아노|piano|기타|guitar|악기/i, '🎹'],
    [/상자|box|궤|chest|금고|safe/i, '📦'], [/무기|검|sword|칼|방패|shield|갑옷/i, '⚔️'], [/트로피|trophy|상패|메달/i, '🏆'], [/어항|fish|수조/i, '🐟'], [/쿠션|베개|pillow|cushion/i, '🛌'],
];
const furnIcon = (name) => FURN.find(([re]) => re.test(name))?.[1] ?? '📦';
const ROOM_COLOR = [[/부엌|주방|kitchen|식당|dining/i, '#f3e2b8'], [/욕실|화장실|bath|toilet|세면/i, '#cfe6f2'], [/침실|bedroom|안방|내 방|방$/i, '#f2d9dc'], [/거실|living|응접|라운지|lounge/i, '#e9dcc3'], [/서재|study|도서|작업|work|연구/i, '#dcd2e8'], [/정원|마당|garden|yard|베란다|발코니|테라스|옥상|terrace|balcony|rooftop/i, '#cfe6bf'], [/지하|창고|cellar|basement|storage|다락|attic/i, '#d5d0c6'], [/현관|입구|entrance|hall|복도|corridor/i, '#e4ddd0']];
const UNDER = /지하|basement|cellar|^b\d/i, DECK = /^(옥상|루프탑|rooftop|roof\b)/i, HALL = /복도|통로|corridor|hallway|홀$|^hall$|계단|stairs?$/i;
const LV = /^(지하\s*\d*\s*층?|b\d+f?|\d+\s*층|\d+f|옥상|옥탑|루프탑|다락방?|rooftop|roof|attic|basement|로비|lobby)\s*/i;
// 「2층 병원」 → 층 이름표 「2층」 + 칸 안 글 「병원」
function splitLv(name) {
    const s = String(name).trim(), m = s.match(LV);
    if (!m) return ['', s];
    return [m[1].replace(/\s+/g, ' ').trim(), s.slice(m[0].length).trim()];
}
export function elevSVG(fls, o = {}) {
    if (!fls?.length) return '';
    const W = 130, GUT = 21, X0 = 23, BW = 103, XE = X0 + BW;
    const shaft = fls.length >= 2 ? 9 : 0; // 🪜 계단실 (두 층부터)
    const rows = [...fls].reverse().map((f, i, all) => {
        const rooms = f.rooms.length ? f.rooms : [{ name: f.name, whole: true }], two = rooms.length > 6, k = Math.ceil(rooms.length / 2);
        const deck = i === 0 && all.length > 1 && !f.rooms.length && DECK.test(f.name); // 맨 위 옥상은 벽 없이 난간만
        return { f, lines: two ? [rooms.slice(0, k), rooms.slice(k)] : [rooms], h: deck ? 13 : two ? 34 : 22, deck, under: UNDER.test(f.name) };
    });
    let gi = rows.length; while (gi > 0 && rows[gi - 1].under) gi--; // gi번째 줄부터 땅 밑
    const roofH = rows[0].deck || gi === 0 ? 0 : o.home ? 14 : 4;
    let y = 5 + roofH; for (const r of rows) { r.y = y; y += r.h; }
    const bottom = y, encY = rows[0].deck ? rows[1].y : rows[0].y, groundY = gi < rows.length ? rows[gi].y : bottom;
    let cells = '', deco = '', labels = '';
    rows.forEach((row, ri) => {
        const { f } = row, [tag, rest] = splitLv(f.name), at = !!o.at?.(f), bw = BW - (row.deck ? 0 : shaft), ch = row.h / row.lines.length;
        row.lines.forEach((line, li) => {
            const w = bw / line.length, cy = row.y + li * ch;
            line.forEach((r, i) => {
                const x = X0 + i * w, on = !!o.on?.(f, r), name = r.whole ? rest : r.name, items = (r.items ?? []).slice(0, Math.max(2, Math.floor(w / 5.5)));
                const col = row.under ? '#d5d0c6' : HALL.test(r.name) ? '#e9e4da' : ROOM_COLOR.find(([re]) => re.test(r.name))?.[1] ?? '#f4eee2';
                const pp = o.pinsAt?.(f, r) ?? [], ppTxt = pp.length ? pp.slice(0, w < 24 ? 2 : 4).map(p => p.e).join('') + (pp.length > (w < 24 ? 2 : 4) ? `+${pp.length - (w < 24 ? 2 : 4)}` : '') : '';
                const hereTxt = on && o.act === 'spot' ? (w < 24 ? (o.me || '●') : `${o.me || '●'} 지금 여기`) : '';
                cells += `<g class="rm ${on ? 'on' : ''} ${o.act ? 'can' : ''} ${row.deck ? 'deck' : ''}" ${o.act ? `data-act="${o.act}" data-arg="${esc(o.arg ? o.arg(f, r) : r.name)}" role="button"` : ''}><title>${esc(r.whole ? f.name : `${f.name} · ${r.name}`)}${r.items?.length ? ` — ${esc(r.items.join(', '))}` : ''}</title>
                    <rect x="${R(x)}" y="${R(cy)}" width="${R(w)}" height="${R(ch)}" style="--c:${col}"/>
                    ${name ? `<text class="nm" x="${R(x + w / 2)}" y="${R(cy + ch / 2 + (items.length || hereTxt ? -1.6 : 1.4))}">${esc(short(name, Math.max(3, Math.floor(w / 3.9))))}</text>` : ''}
                    ${items.length ? `<text class="fu" x="${R(x + w / 2)}" y="${R(cy + ch / 2 + 4.6)}">${items.map(furnIcon).join('')}${r.items.length > items.length ? '…' : ''}</text>` : ''}
                    ${hereTxt ? `<text class="here" x="${R(x + w / 2)}" y="${R(cy + ch - (items.length ? 0.9 : 3))}">${esc(hereTxt)}</text>` : ''}
                    ${ppTxt ? `<g class="pp"><title>${esc(pp.map(p => p.name).join(', '))}</title><text x="${R(x + w - 1.2)}" y="${R(cy + 4.3)}">${esc(ppTxt)}</text></g>` : ''}</g>`;
            });
        });
        if (row.deck) deco += `<path class="rail" d="M${X0} ${R(row.y + row.h)}V${R(row.y + 5)}H${XE}V${R(row.y + row.h)}"/>${[1, 2, 3, 4, 5, 6, 7].map(k => `<line class="rail p" x1="${R(X0 + (BW * k) / 8)}" y1="${R(row.y + 5)}" x2="${R(X0 + (BW * k) / 8)}" y2="${R(row.y + row.h)}"/>`).join('')}`;
        else {
            if (shaft) { const sx = XE - shaft, up = ri % 2 === 0; deco += `<rect class="shaft" x="${R(sx)}" y="${R(row.y)}" width="${shaft}" height="${row.h}"/><path class="st" d="M${R(sx + 1.4)} ${R(up ? row.y + row.h - 1.4 : row.y + 1.4)}L${R(XE - 1.4)} ${R(up ? row.y + 1.4 : row.y + row.h - 1.4)}"/>`; }
            if (row.y > encY) deco += `<line class="slab" x1="${X0}" y1="${R(row.y)}" x2="${XE}" y2="${R(row.y)}"/>`;
        }
        const lab = tag || short(f.name, 5);
        labels += `<g class="lv ${at ? 'on' : ''}"><title>${esc(f.name)}</title><text x="${GUT - 1.5}" y="${R(row.y + row.h / 2 + 1.4)}">${esc(short(lab, 5))}</text></g>`;
    });
    const roof = !roofH ? '' : o.home ? `<polygon class="roof" points="${X0 - 3},${encY} ${R(X0 + BW / 2)},${R(encY - 13)} ${XE + 3},${encY}"/>` : `<rect class="roof" x="${X0 - 2}" y="${R(encY - 3.6)}" width="${BW + 4}" height="3.6" rx=".8"/>`;
    const earth = groundY < bottom ? `<rect class="earth" x="0" y="${R(groundY)}" width="${W}" height="${R(bottom - groundY + 5)}"/>` : '';
    return `<svg class="mbx-elev" viewBox="0 0 ${W} ${R(bottom + 5)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="건물 정면도">${earth}${cells}${deco}
        <rect class="outer" x="${X0}" y="${R(encY)}" width="${BW}" height="${R(bottom - encY)}"/>${roof}<line class="ground" x1="0" y1="${R(groundY)}" x2="${W}" y2="${R(groundY)}"/>${labels}</svg>`;
}

// Rooms recorded for a place («3F office», «basement storage», «kitchen») and floors an analysis gave
// ([{ lv: '3F', rooms }]) → floors bottom first for elevSVG. A room with no floor in its name goes on the
// floor the analysis puts it on, else on a floor called 「안」 (inside) when nothing says which floor.
const LVK = (s) => { const t = String(s); if (/옥상|루프|roof/i.test(t)) return 999; const m = /(지하|basement|cellar|^b)\s*(\d*)/i.exec(t); if (m) return -Number(m[2] || 1); const n = /(\d+)\s*(층|f\b|st floor|nd floor|rd floor|th floor)/i.exec(t) ?? /(?:floor|level)\s*(\d+)/i.exec(t); return n ? Number(n[1]) : null; };
const LVNAME = (k) => (k === 999 ? '옥상' : k < 0 ? `B${-k}` : `${k}F`);
export function buildFloors(rooms = [], geo = []) {
    const by = new Map(), seen = new Set(), put = (k, name, room) => { const key = k ?? 'in'; if (!by.has(key)) by.set(key, { k, name, rooms: [] }); const f = by.get(key); if (room && !seen.has(room.toLowerCase())) { seen.add(room.toLowerCase()); f.rooms.push({ name: room }); } };
    for (const f of geo ?? []) { const k = LVK(f.lv); for (const r of f.rooms ?? []) put(k, k == null ? (f.lv || '안') : LVNAME(k), r); if (!(f.rooms ?? []).length) put(k, k == null ? (f.lv || '안') : LVNAME(k)); }
    for (const r of rooms) {
        const k = LVK(r), [, rest] = splitLv(r);
        const g = k == null ? [...by.values()].find((f) => f.rooms.some((x) => x.name.toLowerCase() === r.toLowerCase())) : null;
        if (g) continue;
        put(k, k == null ? '안' : LVNAME(k), rest || r);
    }
    return [...by.values()].sort((a, b) => (a.k ?? 0.5) - (b.k ?? 0.5)).map(({ name, rooms: rs }) => ({ name, rooms: rs }));
}
export const ELEV_CSS = `
.mbx-elev{display:block;width:100%;height:auto;max-height:66vh;user-select:none;-webkit-user-select:none;--sf:color-mix(in srgb,var(--fg) 3%,var(--card,#fff))}
.mbx-elev .rm rect{fill:color-mix(in srgb,var(--c,#f4eee2) 55%,var(--sf));stroke:var(--fg);stroke-width:.4}
.mbx-elev .rm.deck rect{fill:transparent;stroke:none}
.mbx-elev .rm.can{cursor:pointer}
.mbx-elev .rm.can:hover rect{fill:color-mix(in srgb,var(--a) 14%,var(--sf))}
.mbx-elev .rm.on rect{fill:color-mix(in srgb,var(--a) 26%,var(--sf))}
.mbx-elev text{text-anchor:middle;pointer-events:none;font-family:inherit}
.mbx-elev .nm{font-size:4px;font-weight:700;fill:var(--fg)}
.mbx-elev .fu{font-size:4.2px}
.mbx-elev .here{font-size:3px;font-weight:700;fill:var(--a)}
.mbx-elev .outer{fill:none;stroke:var(--fg);stroke-width:1.5;stroke-linejoin:miter;pointer-events:none}
.mbx-elev .slab{stroke:var(--fg);stroke-width:1.1;pointer-events:none}
.mbx-elev .shaft{fill:color-mix(in srgb,var(--fg) 10%,var(--sf));stroke:var(--fg);stroke-width:.4;pointer-events:none}
.mbx-elev .st{fill:none;stroke:var(--fg);stroke-width:.9;stroke-dasharray:1.3 1;opacity:.55;pointer-events:none}
.mbx-elev .roof{fill:color-mix(in srgb,var(--fg) 78%,var(--sf));stroke:var(--fg);stroke-width:.5;stroke-linejoin:round;pointer-events:none}
.mbx-elev .rail{fill:none;stroke:var(--fg);stroke-width:.7;pointer-events:none}
.mbx-elev .rail.p{stroke-width:.35;opacity:.6}
.mbx-elev .ground{stroke:color-mix(in srgb,#5c8f48 70%,var(--fg));stroke-width:1.2;pointer-events:none}
.mbx-elev .earth{fill:color-mix(in srgb,#8a6f4d 22%,var(--sf))}
.mbx-elev .lv text{text-anchor:end;font-size:3.6px;font-weight:700;fill:var(--sub)}
.mbx-elev .lv.on text{fill:var(--a)}
.mbx-elev .pp text{text-anchor:end;font-size:3.4px}
.mbx-elev .pp{animation:mbx-bob 1.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.mbx-elev .pp{animation:none}}
.mbx-mapwrap.inside{background:linear-gradient(color-mix(in srgb,var(--fg) 7%,transparent) 1px,transparent 0) 0 0/100% 14px,linear-gradient(90deg,color-mix(in srgb,var(--fg) 7%,transparent) 1px,transparent 0) 0 0/14px 100%,color-mix(in srgb,var(--fg) 2%,transparent)}
.mbx-inbar{display:flex;align-items:center;gap:8px;padding:6px;flex-wrap:wrap}
.mbx-inbar b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mbx-mapwrap{position:relative}
.mbx-map{touch-action:none;cursor:grab;max-height:56vh}.mbx-map:active{cursor:grabbing}
.mbx-ctl{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:4px}
.mbx-ctl button{width:32px;height:32px;border:1px solid var(--line);border-radius:9px;background:var(--card,#fff);color:var(--fg);font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.mbx-areas{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px}
`;
