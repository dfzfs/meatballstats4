// 📅 No strange years: a broken or tiny year (6, 26, «0006-…») never reaches the calendar; it becomes this year.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf, page, apiFor, src } from './harness.mjs';

const NOW = new Date().getUTCFullYear();

test('namedDate never makes a year below 1000', async () => {
    const { namedDate, startMs, okYear } = await import(src('core/clock.js'));
    for (const y of [6, 26, 0, NaN, undefined, '6']) assert.equal(new Date(namedDate('3월 4일', y)).getUTCFullYear(), NOW, `year ${y}`);
    assert.equal(new Date(namedDate('March 4, 2031', 6)).getUTCFullYear(), 2031);
    assert.equal(new Date(namedDate('2031년 3월 4일', 6)).getUTCFullYear(), 2031);
    assert.equal(startMs('0006-03-04'), null, 'a broken start counts as not set');
    assert.equal(startMs('0001-10-12'), null);
    assert.equal(new Date(startMs('2024-03-04')).getUTCFullYear(), 2024);
    assert.equal(okYear(1999), 1999);
});

test('a calendar saved with year 6 drops it and follows the story, and new dates do not inherit it', async () => {
    page();
    const t = await setup({ apps: ['scene', 'calendar'], chat: chatOf([{ reply: '아침, 빵집.' }]) });
    t.record(0, [['date', '3월 4일'], ['time', 'morning']]);
    const api = await apiFor(t.E, 'calendar');
    api.store.start = '0006-03-04';
    const el = document.createElement('div');
    t.E.reg.get('calendar').render(el, api);
    assert.match(el.textContent, new RegExp(`${NOW}년 3월`));
    assert.doesNotMatch(el.textContent, /(^|\D)6년/);
    assert.equal(api.store.start, undefined);
    t.E.touch(); t.E.refresh();
    assert.match(t.note().state, new RegExp(`March 4, ${NOW}`));
    // typing a start date while the old one was broken
    api.store.start = '0006-03-04';
    el.innerHTML = ''; t.E.reg.get('calendar').render(el, api);
    const box = el.querySelector('[data-act="start"]');
    box.value = '3월 2일'; box.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(api.store.start, `${NOW}-03-02`);
});

test('an old v2 start year that is not four digits is not carried over', async () => {
    globalThis.SillyTavern ??= { getContext: () => ({ extensionSettings: {} }) };
    const M = await import(src('st/migrate.js'));
    const md = { meatlite: { book: { world: { start: { y: 6, m: 3, d: 4 } } } } };
    assert.match(JSON.stringify(M.settingsOnly({ meatlite: { book: { world: { start: { y: 2025, m: 3, d: 4 } } } } }, [], '하루')), /2025-03-04/);
    const out = JSON.stringify(M.settingsOnly?.(md, [], '하루') ?? {});
    assert.doesNotMatch(out, /0006|"start":"6-/);
});

test('the story\'s own year wins over a saved start, and a bare weekday or month does not wipe it', async () => {
    page();
    const L = [['date', 'December 17, 1524'], ['time', '+?w morning'], ['date', 'January 12'], ['time', '+5d'], ['date', 'March 3, 1525 (Friday)'], ['time', '+1d noon'], ['date', 'Wednesday'], ['time', '+1d'], ['date', 'March']];
    const t = await setup({ apps: ['scene', 'calendar'], chat: chatOf(L.flatMap((_l, i) => [{ reply: `r${i}` }, { user: `u${i}` }])) });
    L.forEach((l, i) => t.record(i * 2, [l]));
    for (const start of ['0001-10-12', '2026-10-12', undefined]) {
        const api = await apiFor(t.E, 'calendar');
        if (start) api.store.start = start; else delete api.store.start;
        const el = document.createElement('div');
        t.E.reg.get('calendar').render(el, api);
        assert.match(el.querySelector('.mb4-cal-h').textContent, /1525년 3월/, `start ${start}`);
        t.E.touch(); t.E.refresh();
        assert.match(t.note().state, /today is \w+, March 5, 1525/, `start ${start}`);
    }
    assert.equal(t.state('scene').anchor.date, 'March 3, 1525 (Friday)');
});
