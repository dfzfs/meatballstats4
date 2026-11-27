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

test('🗺 map: 🗂 floor guide by default (areas by height, drawn icons and faces), 🚇 line map with ＋－ zoom, 🏢 cross-section, ↩', async () => {
    page();
    const t = await setup({ apps: ['scene', 'map'], chat: chatOf([{ reply: 'a' }, { user: 'b' }, { reply: 'c' }]) });
    t.record(0, [['loc', 'Hilltop > Bell Tower Inn > kitchen']]);
    t.record(2, [['loc', 'Hilltop > Clinic > 3F office']]);
    const api = await apiFor(t.E, 'map');
    let asked = '';
    api.ask = async (p) => { asked = p; return ANSWER; };
    const el = document.createElement('div'), def = t.E.reg.get('map'), tap = (sel) => el.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles: true }));
    def.render(el, api);
    assert.ok(el.querySelector('.mbb-tile.here[data-v="Clinic"]'), 'the floor guide is the map; here is marked');
    assert.ok(!el.querySelector('svg.mbx-map'));
    tap('[data-act="geo"]');
    await new Promise((r) => setTimeout(r, 20));
    assert.match(asked, /OOC/); assert.match(asked, /Do NOT continue the story/); assert.match(asked, /Bell Tower Inn/);
    // areas top (highest) to bottom; the market nobody has been to is a dashed tile in the lower one; the lift between them is named
    const bands = [...el.querySelectorAll('.mbb-band .mbb-zn b')].map((b) => b.textContent);
    assert.deepEqual(bands, ['Hilltop', 'Lower Harbor']);
    assert.ok(el.querySelector('.mbb-tile.new[data-v="Fish Market"]'));
    assert.match(el.querySelector('.mbb-way').textContent, /Fish Market|Clinic|Bell Tower Inn/);
    assert.ok(el.querySelector('.mbb-tile svg.mbb-ico'), 'drawn icons, not emoji');
    // 🚇 the line map is still there
    tap('[data-act="mode"][data-v="line"]');
    assert.ok(el.querySelector('svg.mbx-map'), 'line map');
    assert.ok(el.querySelector('[data-act="zoom"][data-v="in"]') && el.querySelector('[data-act="zoom"][data-v="fit"]'));
    // the market nobody has been to yet is now a (faint) station, joined by the cliff lift
    const st = (n) => el.querySelector(`svg.mbx-map g.node[data-v="${n}"]`);
    assert.ok(!st('Fish Market'), 'opens on the area you are in');
    tap('[data-act="area"][data-v="*"]');
    assert.ok(st('Fish Market') && st('Fish Market').classList.contains('new'));
    assert.ok(el.querySelector('[data-act="area"][data-v="Lower Harbor"]'), 'areas from the zones');
    // ＋ narrows the view; ⤢ puts it back
    const svg = el.querySelector('svg.mbx-map'), vb0 = svg.getAttribute('viewBox');
    tap('[data-act="zoom"][data-v="in"]');
    assert.notEqual(svg.getAttribute('viewBox'), vb0);
    tap('[data-act="zoom"][data-v="fit"]');
    assert.equal(svg.getAttribute('viewBox'), vb0);
    // 🏢 the clinic: floors from the story (3F office) and the look (3F ward, office)
    tap('[data-act="mapsel"][data-v="Clinic"]');
    tap('[data-act="inside"][data-v="Clinic"]');
    const elev = el.querySelector('svg.mbx-elev');
    assert.ok(elev, 'cross-section open');
    assert.match(elev.textContent, /3F/); assert.match(elev.textContent, /ward/); assert.match(elev.textContent, /office/);
    assert.ok(elev.querySelector('.rm.on'), 'the room the story is in is marked');
    tap('[data-act="outside"]');
    assert.ok(el.querySelector('svg.mbx-map'));
    // asked again: the first look is kept for ↩
    api.ask = async () => 'ZONE: Hilltop | 0 |\nPLACE: Clinic | Hilltop | 5,5 | work | - | x';
    tap('[data-act="geo"]');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(api.store.geo.places.length, 1);
    tap('[data-act="geoundo"]');
    assert.equal(api.store.geo.places.length, 3);
});
