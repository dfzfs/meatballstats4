// 🙂 faces: real emoji everywhere, a face picked in 👥 인물 wins, and the user is pinned on the map.
// Every name here is made up for testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { page, setup, chatOf, apiFor, src } from './harness.mjs';

test('a picked face wins over the default one, everywhere the kit draws a face; the map board uses the same emoji', async () => {
    const kit = await import(src('ui/kit.js')), { faceOf } = await import(src('ui/board.js'));
    kit.setFaces(null);
    const plain = kit.face('미루');
    assert.ok(kit.FACE_PICKS.length >= 20);
    assert.doesNotMatch(faceOf('미루'), /<svg/, 'no drawn face');
    assert.match(faceOf('미루'), new RegExp(plain));
    kit.setFaces({ 미루: '🐱' });
    assert.equal(kit.face('미루'), '🐱'); assert.match(faceOf('미루'), /🐱/);
    kit.setFaces({});
    assert.equal(kit.face('미루'), plain);
});

test('👥 인물: tapping an emoji saves it for that person and for me', async () => {
    page();
    const t = await setup({ apps: ['scene', 'people'], chat: chatOf([{ reply: '서점.' }], '미루'), user: '보리', char: '미루' });
    t.record(0, [['npc', '미루=서점 주인']]);
    const el = document.createElement('div'), kit = await import(src('ui/kit.js'));
    const draw = async () => (await import(src('apps/people.js'))).default.render(el, await apiFor(t.E, 'people', { draw: () => draw() }));
    await draw();
    [...el.querySelectorAll('[data-act="face"]')].find((b) => b.dataset.v === '미루|🦊').click();
    [...el.querySelectorAll('[data-act="face"]')].find((b) => b.dataset.v === '보리|🐰').click();
    assert.deepEqual(t.E.envOf('people').store.faces, { 미루: '🦊', 보리: '🐰' });
    assert.equal(kit.face('미루'), '🦊');
    kit.setFaces({});
});

test('🗺 the user is pinned where they are now, with whoever is there', async () => {
    page();
    const t = await setup({ apps: ['scene', 'people', 'map'], chat: chatOf([{ reply: '서점.' }, { user: '가자.' }, { reply: '강가.' }], '미루'), user: '보리', char: '미루' });
    t.record(0, [['loc', '구시가 > 서점'], ['with', '=미루']]);
    t.record(2, [['loc', '구시가 > 강가'], ['with', '=']]);
    const el = document.createElement('div');
    (await import(src('apps/map.js'))).default.render(el, await apiFor(t.E, 'map'));
    const kit = await import(src('ui/kit.js')), txt = el.textContent.replace(/\s+/g, ' ');
    assert.match(txt, new RegExp(`강가${kit.face('보리')}보리`), 'the user has a face where they are now');
    assert.match(txt, new RegExp(`서점${kit.face('미루')}미루`), 'the person left behind keeps theirs');
    assert.match(txt, /보리 나 · 지금 여기/);
});

test('👥 인물: someone removed, or left out by 📌 고정, is gone from the other apps\' lists too', async () => {
    page();
    const t = await setup({ apps: ['scene', 'people', 'schedule', 'group'], chat: chatOf([{ reply: '서점.' }, { user: '응.' }, { reply: '강가.' }], '미루'), user: '보리', char: '미루' });
    t.record(0, [['npc', '미루=서점 주인'], ['npc', '소담=꽃집'], ['npc', '한결=우체부']]);
    const env = t.E.envOf('people'), kit = await import(src('ui/kit.js'));
    env.store.hide = { 한결: 99 }; t.E.touch();
    assert.deepEqual(Object.keys(t.state('people').list).sort(), ['미루', '소담']);
    const ok = kit.inCast(t.E.envOf('schedule'));
    assert.deepEqual(['미루', '소담', '한결'].map(ok), [true, true, false]);
    // 📌 고정: a new person in a later reply does not join
    env.store.lock = { on: true, names: ['미루'] };
    t.record(2, [['npc', '새벽=새로 온 사람']]); t.E.touch();
    assert.deepEqual(Object.keys(t.state('people').list), ['미루']);
    const el = document.createElement('div');
    (await import(src('apps/schedule.js'))).default.render(el, await apiFor(t.E, 'schedule'));
    assert.deepEqual(t.E.envOf('schedule').store.sel, ['미루'], 'the schedule offers only the cast');
    assert.doesNotMatch(el.textContent, /소담|한결|새벽=/);
});
