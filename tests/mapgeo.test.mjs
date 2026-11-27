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

test('🧭 one tap: asks once, draws zones top to bottom, marks where the story is, keeps the old one for ↩', async () => {
    page();
    const t = await setup({ apps: ['scene', 'map'], chat: chatOf([{ reply: 'a' }, { user: 'b' }, { reply: 'c' }]) });
    t.record(0, [['loc', 'Hilltop > Bell Tower Inn > kitchen']]);
    t.record(2, [['loc', 'Hilltop > Clinic > 3F office']]);
    const api = await apiFor(t.E, 'map');
    let asked = '';
    api.ask = async (p) => { asked = p; return ANSWER; };
    const el = document.createElement('div'), def = t.E.reg.get('map');
    def.render(el, api);
    el.querySelector('[data-act="geo"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    assert.match(asked, /OOC/);
    assert.match(asked, /Do NOT continue the story/);
    assert.match(asked, /Bell Tower Inn/, 'the places already visited go into the question');
    assert.equal(api.store.geo.places.length, 3);
    const zones = () => [...el.querySelectorAll('.mbg-map .zn')].map((x) => x.textContent);
    assert.deepEqual(zones().map((z) => z.split(' ·')[0]), ['Hilltop'], 'opens on the zone where the story is');
    assert.ok(el.querySelector('[data-act="gzone"][data-v="Lower Harbor"]'));
    el.querySelector('[data-act="gzone"][data-v=""]').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.deepEqual(zones().map((z) => z.split(' ·')[0]), ['Hilltop', 'Lower Harbor'], '「전체」: highest on top');
    assert.ok(el.querySelector('[data-act="gzoom"][data-v="in"]') && el.querySelector('[data-act="gzoom"][data-v="fit"]'));
    // one zone shown: a way leading out of it is marked on the place it leaves from
    el.querySelector('[data-act="gzone"][data-v="Hilltop"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.match(el.querySelector('.mbg-map .pl[data-v="Clinic"] .out')?.textContent ?? '', /Fish Market · cliff lift/);
    assert.ok(el.querySelector('.mbg-map .pl.here[data-v="Clinic"]'), 'the clinic is where the story is');
    el.querySelector('[data-act="gzone"][data-v="Lower Harbor"]')?.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.ok(el.querySelector('.mbg-map .pl.unseen[data-v="Fish Market"]'), 'not visited yet');
    el.querySelector('[data-act="geosel"][data-v="Clinic"]')?.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.match(el.textContent, /3F\s*ward · office/);
    // asked again with a different answer: the first is kept for ↩
    api.ask = async () => 'ZONE: Hilltop | 0 |\nPLACE: Clinic | Hilltop | 5,5 | work | - | x';
    el.querySelector('[data-act="geo"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(api.store.geo.places.length, 1);
    assert.equal(api.store.geoPrev.places.length, 3);
    el.querySelector('[data-act="geoundo"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(api.store.geo.places.length, 3);
    // the subway view is still there
    el.querySelector('[data-act="mode"][data-v="line"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.ok(el.querySelector('.mbx-map'));
});
