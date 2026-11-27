// 🧭 The zone map: an out-of-character geography answer read into zones, places and ways, and drawn. Made-up town.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf, page, apiFor, src } from './harness.mjs';

const ANSWER = `Here is the map.
ZONE: Hilltop | 0 | 언덕 위 마을
- ZONE: Lower Harbor | 1 | 절벽 아래 항구
PLACE: Bell Tower Inn | Hilltop | 2,3 | food | 1F: hall, kitchen; 2F: guest rooms | 언덕 서쪽 여관
PLACE: Clinic | Hilltop | 7,2 | work | 3F: ward, office | 동쪽 진료소
PLACE: Fish Market | Lower Harbor | 4,6 | shop | - | 부두 옆 시장
LINK: Bell Tower Inn - Clinic | walk 5 min
LINK: Clinic – Fish Market | cliff lift
nonsense line`;

test('the answer is read into zones, places, floors and ways; anything else is ignored', async () => {
    const { parseGeo, geoText, matcher } = await import(src('ui/mapgeo.js'));
    const G = parseGeo(ANSWER);
    assert.deepEqual(G.zones.map((z) => [z.name, z.level]), [['Hilltop', 0], ['Lower Harbor', 1]]);
    assert.equal(G.places.length, 3);
    assert.deepEqual(G.places[0].floors, [{ lv: '1F', rooms: ['hall', 'kitchen'] }, { lv: '2F', rooms: ['guest rooms'] }]);
    assert.deepEqual(G.links.map((l) => [l.a, l.b, l.how]), [['Bell Tower Inn', 'Clinic', 'walk 5 min'], ['Clinic', 'Fish Market', 'cliff lift']]);
    assert.deepEqual(parseGeo(geoText(G)), G, 'the lines the person edits read back the same');
    const find = matcher(G);
    assert.equal(find('the Bell Tower Inn')?.name, 'Bell Tower Inn');
    assert.equal(find('Clinic')?.name, 'Clinic');
    assert.equal(find('Lighthouse'), null);
});

test('🗺 map: big area cards first, into one area for its tiles, the card under it with the building cut open, ↩', async () => {
    page();
    const t = await setup({ apps: ['scene', 'map'], chat: chatOf([{ reply: 'a' }, { user: 'b' }, { reply: 'c' }]) });
    t.record(0, [['loc', 'Hilltop > Bell Tower Inn > kitchen']]);
    t.record(2, [['loc', 'Hilltop > Clinic > 3F office']]);
    const api = await apiFor(t.E, 'map');
    let asked = '';
    api.ask = async (p) => { asked = p; return ANSWER; };
    const el = document.createElement('div'), def = t.E.reg.get('map'), tap = (sel) => el.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles: true }));
    def.render(el, api);
    // one area only: straight in, here is marked, its card shows under it
    assert.ok(el.querySelector('.mbb-tile.here[data-v="Clinic"]'));
    assert.ok(!el.querySelector('svg.mbx-map'), 'no line map');
    tap('[data-act="geo"]');
    await new Promise((r) => setTimeout(r, 20));
    assert.match(asked, /OOC/); assert.match(asked, /Do NOT continue the story/); assert.match(asked, /Bell Tower Inn/);
    // two areas now: only the big area cards, top (highest) first, the one you are in marked
    const zs = [...el.querySelectorAll('.mbb-zone')];
    assert.deepEqual(zs.map((z) => z.querySelector('.mbb-zname b').textContent), ['Hilltop', 'Lower Harbor']);
    assert.ok(zs[0].classList.contains('mine'));
    assert.ok(!el.querySelector('.mbb-tile'), 'no tiles on the first screen');
    // into the harbor: the market nobody has been to is dashed, the way back up is named
    tap('.mbb-zone[data-v="lower harbor"]');
    assert.ok(el.querySelector('.mbb-tile.new[data-v="Fish Market"]'));
    assert.match(el.querySelector('.mbb-out').textContent, /Hilltop/);
    assert.match(el.querySelector('.mbb-out').textContent, /cliff lift/);
    assert.ok(el.querySelector('.mbb-tile svg.mbb-ico'), 'drawn icons, not emoji');
    tap('.mbb-out');
    // the clinic card: no visit counts, the building cut open right under it
    tap('.mbb-tile[data-v="Clinic"]');
    const card = el.querySelector('.mbx-place');
    assert.doesNotMatch(card.textContent, /들렀어요|여기서 본 사람|안에 있어요/);
    const elev = card.querySelector('svg.mbx-elev');
    assert.ok(elev, 'cross-section right in the card');
    assert.match(elev.textContent, /3F/); assert.match(elev.textContent, /ward/); assert.match(elev.textContent, /office/);
    assert.ok(elev.querySelector('.rm.on'), 'the room the story is in is marked');
    assert.ok(!el.textContent.includes('오늘 다닌 길') && !el.textContent.includes('다녀온 곳 전부'));
    // ＋ a place, from ✏️: it joins this area
    tap('[data-act="edit"][data-v="Clinic"]');
    el.querySelector('[data-f="newplace"]').value = 'Rope Bridge';
    tap('[data-act="add"]');
    assert.ok(el.querySelector('.mbb-tile.new[data-v="Rope Bridge"]'));
    // ← back to the area cards
    tap('.mbb-back');
    assert.ok(el.querySelector('.mbb-zone'));
    // asked again: the first look is kept for ↩
    api.ask = async () => 'ZONE: Hilltop | 0 |\nPLACE: Clinic | Hilltop | 5,5 | work | - | x';
    tap('[data-act="geo"]');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(api.store.geo.places.length, 1);
    tap('[data-act="geoundo"]');
    assert.equal(api.store.geo.places.length, 3);
});
