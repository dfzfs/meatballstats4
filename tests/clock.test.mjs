// 🕰 Story time: the third generation's date rules inside the shared clock (scene, todo, wallet, map count the same days). Made-up dates only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf, src } from './harness.mjs';

async function story(lines, apps = ['scene']) {
    const t = await setup({ apps, chat: chatOf(lines.flatMap((_l, i) => [{ reply: `r${i}` }, { user: `u${i}` }])) });
    lines.forEach((L, i) => t.record(i * 2, Array.isArray(L[0]) ? L : [L]));
    return t;
}
const on = async (t) => { const { dayOn } = await import(src('core/clock.js')); const S = t.state('scene'); const o = dayOn(S); return o ? `${o.y}-${o.m}-${o.d}` : (S.vague ? '~' : '-'); };

test('a full date named after "a few days" is taken (v3)', async () => {
    const t = await story([['date', '3월 2일 월요일'], ['time', '+?d'], ['date', '3월 20일 금요일'], ['time', '+?w'], ['date', '4월 10일']]);
    const S = t.state('scene');
    assert.match(await on(t), /-4-10$/);
    assert.equal(S.vague, false);
    assert.equal(S.day, 1 + 18 + 21);
});

test('a year the story names stays, and the next January is the year after', async () => {
    const t = await story([['date', 'October 5'], ['date', 'November 25'], ['date', 'December 15'], ['date', '1610년 12월 17일'], ['date', 'January 12'], ['date', 'January 20']]);
    assert.equal(await on(t), '1611-1-20');
});

test('a bare weekday or month never throws the date away; a date far behind is kept back', async () => {
    const t = await story([['date', 'May 3, 1702 (Monday)'], ['time', '+1d'], ['date', 'Thursday'], ['date', 'March'], ['date', 'spring']]);
    assert.equal(await on(t), '1702-5-4');
    const S = t.state('scene');
    assert.equal(S.day, 2);
});

test('small years never show up (no «6년»), and the story\'s weekday is the one told to the AI', async () => {
    const t = await story([['date', '6년 3월 4일 화요일'], ['time', '+1d']], ['scene', 'calendar']);
    t.E.touch(); t.E.refresh();
    const note = t.note().state;
    assert.match(note, /today is Wednesday, March 5, \d{4}\./);
    assert.doesNotMatch(note, /, 6\.|, 1906\./);
});

test('🎲 미정 날짜 정하기: no date → a day of this year; inside «며칠 뒤» → a day of that week, after the day before', async () => {
    const { page, apiFor } = await import('./harness.mjs');
    page();
    const tap = async (t) => { const api = await apiFor(t.E, 'calendar'), el = document.createElement('div'); t.E.reg.get('calendar').render(el, api); const b = el.querySelector('[data-act="roll"]'); assert.ok(b, 'the 🎲 button is there'); b.dispatchEvent(new window.Event('click', { bubbles: true })); };
    const a = await story([['time', 'morning']], ['scene', 'calendar']);
    await tap(a);
    assert.match(await on(a), new RegExp(`^${new Date().getUTCFullYear()}-\\d+-\\d+$`));
    const b = await story([['date', 'June 10, 1702 (Saturday)'], ['time', '+?d']], ['scene', 'calendar']);
    assert.equal(b.state('scene').vague, true);
    await tap(b);
    const got = await on(b), [y, m, d] = got.split('-').map(Number);
    assert.equal(b.state('scene').vague, false);
    assert.ok(y === 1702 && m === 6 && d >= 11 && d <= 17, got);
});

test('scene, promises, wallet and map count the same day after a date moves the count', async () => {
    const t = await story([['date', 'April 2, 1810'], ['time', '+1d'], ['date', 'April 20'], ['time', '+3h night'], ['time', 'morning']], ['scene', 'todo', 'wallet', 'map']);
    const day = t.state('scene').day;
    assert.equal(day, 1 + 18 + 1);
    assert.equal(t.state('todo').clock.day, day);
    assert.equal(t.state('wallet').clock.day, day);
    assert.equal(t.state('map').day, day);
});

test('the month grid puts days under the story\'s weekdays', async () => {
    const { page, apiFor } = await import('./harness.mjs');
    page();
    const t = await story([['date', 'November 17, 1640 (Saturday)']], ['scene', 'calendar']);
    const el = document.createElement('div');
    t.E.reg.get('calendar').render(el, await apiFor(t.E, 'calendar'));
    const cells = [...el.querySelectorAll('.mb4-cal > *')].slice(7).map((x) => x.textContent.trim());
    assert.equal(cells.indexOf('17') % 7, 6, 'the 17th sits under 토');
});
