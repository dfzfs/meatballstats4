// 🕰 The scene's dates run on the third generation's time engine: the same answers v3 gave. Made-up dates only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf, src } from './harness.mjs';

async function story(lines, apps = ['scene']) {
    const t = await setup({ apps, chat: chatOf(lines.flatMap((_l, i) => [{ reply: `r${i}` }, { user: `u${i}` }])) });
    lines.forEach((L, i) => t.record(i * 2, Array.isArray(L[0]) ? L : [L]));
    return t;
}
const on = async (t) => { const { dayOn } = await import(src('core/v3time.js')); const S = t.state('scene'); const o = dayOn(S.cal, S.day); return o ? `${o.y}-${o.m}-${o.d}` : (S.vague ? '~' : '-'); };

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
