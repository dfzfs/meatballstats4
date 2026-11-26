// 📆 Story dates: a named date is counted on, never dropped; the screen never shows a bare «N일째».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf, src } from './harness.mjs';

const chat = () => chatOf([{ reply: 'a' }, { user: 'b' }, { reply: 'c' }, { user: 'd' }, { reply: 'e' }, { user: 'f' }, { reply: 'g' }]);

test('a named date keeps counting after days pass', async () => {
    const t = await setup({ apps: ['scene', 'calendar'], chat: chat() });
    t.record(0, [['time', 'night'], ['date', '11월 25일 수요일']]);
    t.record(2, [['time', '+2d morning']]);
    const S = t.state('scene');
    assert.equal(S.day, 3);
    const { dayKo } = await import(src('core/clock.js'));
    assert.equal(dayKo(S, S.day), '11월 27일');
});

test('a later date alone moves the day on; night then morning is the next day', async () => {
    const t = await setup({ apps: ['scene'], chat: chat() });
    t.record(0, [['time', 'night'], ['date', '11월 25일']]);
    t.record(2, [['time', 'morning'], ['date', '11월 26일']]);
    assert.equal(t.state('scene').day, 2, 'night -> morning, then the same date: one day, not two');
    t.record(4, [['date', '11월 28일']]);
    assert.equal(t.state('scene').day, 4);
    t.record(6, [['date', '1월 2일']]);   // across the new year
    assert.equal(t.state('scene').day, 39);
});

test('the calendar draws from story dates without a start date', async () => {
    const t = await setup({ apps: ['scene', 'calendar'], chat: chat() });
    t.record(0, [['date', '2026년 11월 25일']]);
    t.record(2, [['time', '+1d']]);
    const cal = await import(src('apps/calendar.js'));
    assert.equal(cal.today(t.E.envOf('calendar')).date.toISOString().slice(0, 10), '2026-11-26');
});

test('written dates are read in every form a story uses', async () => {
    const { namedDate } = await import(src('core/clock.js'));
    const d = (s) => new Date(namedDate(s, 2026)).toISOString().slice(0, 10);
    assert.equal(d('11월 25일'), '2026-11-25');
    assert.equal(d('November 25, 2026 (Wednesday)'), '2026-11-25');
    assert.equal(d('late November'), '2026-11-25');
    assert.equal(d('11월 말'), '2026-11-25');
    assert.equal(d('2026-11-25'), '2026-11-25');
});

test('no «N일째» in the status strip', async () => {
    const t = await setup({ apps: ['scene'], chat: chat() });
    t.record(0, [['time', '+3d evening']]);
    const hud = t.E.reg.get('scene').hud(t.state('scene'), t.E.envOf('scene')).join(' ');
    assert.doesNotMatch(hud, /일째/);
});
