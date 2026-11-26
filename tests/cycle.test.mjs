// 🩸 The calendar's optional cycle: what reaches the AI, and when. Names and lines are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf, page, apiFor } from './harness.mjs';

async function cal(dated) {
    page();
    const t = await setup({ apps: ['scene', 'calendar'], chat: chatOf([{ reply: '아침, 빵집.' }, { user: '안녕' }, { reply: '"어서 와요."' }]) });
    t.record(0, [...(dated ? [['date', '3월 4일']] : []), ['time', 'morning'], ['loc', '골목 > 빵집']]);
    const api = await apiFor(t.E, 'calendar'), el = document.createElement('div');
    const draw = () => { el.innerHTML = ''; t.E.reg.get('calendar').render(el, api); };
    const tap = (act) => { draw(); const b = el.querySelector(`[data-act="${act}"]`); assert.ok(b, act); if (b.type === 'checkbox') { b.checked = true; b.dispatchEvent(new window.Event('change', { bubbles: true })); } b.dispatchEvent(new window.Event('click', { bubbles: true })); };
    const said = () => { t.E.touch(); t.E.refresh(); return t.note().state; };
    return { t, api, el, draw, tap, said };
}

for (const dated of [true, false]) {
    test(`cycle: marked start + 「AI에 알리기」 reaches the AI (${dated ? 'story has a date' : 'no date in the story'})`, async () => {
        const c = await cal(dated);
        c.tap('cyon');
        assert.doesNotMatch(c.said(), /period/, 'only shown on the calendar until told');
        c.tap('cystart');
        assert.deepEqual(c.api.store.cycle.starts, dated ? [`${new Date().getUTCFullYear()}-03-04`] : [1], 'a date when the story has one, else the story day');
        assert.doesNotMatch(c.said(), /period/, '「AI에 알리기」 is off');
        c.tap('cytell');
        assert.match(c.said(), /하루 is on their period \(day 1\)/);
        c.draw();
        assert.match(c.el.textContent, /지금 기간 중 · 1번째 날 · AI가 알아요/);
    });
}

test('cycle: outside the days of a period nothing is sent, and the box says so', async () => {
    const c = await cal(true);
    c.tap('cyon'); c.tap('cytell');
    c.draw();
    assert.match(c.el.textContent, /시작일을 표시해야/);
    c.api.store.cycle.starts = [`${new Date().getUTCFullYear()}-02-22`];   // 10 days before today (March 4): past a 5-day period
    assert.doesNotMatch(c.said(), /period/);
    c.draw();
    assert.match(c.el.textContent, /지금은 기간이 아니에요 · 다음 시작까지 약 18일/);
});

test('cycle: start days stay on their dates when the day count changes, and a wrong one can be removed', async () => {
    const c = await cal(true);
    c.tap('cyon'); c.tap('cystart'); c.tap('cytell');
    assert.match(c.said(), /period \(day 1\)/);
    // the story gains a «a few days later» before today's date: day numbers shift, the start date does not
    c.t.chat.unshift({ is_user: false, name: '도윤', mes: 'x' }, { is_user: true, name: '하루', mes: 'y' });
    c.t.record(0, [['time', '+?d']]);
    assert.match(c.said(), /period \(day 1\)/);
    c.draw();
    assert.match(c.el.textContent, /🩸 3\/4/);
    c.el.querySelector('[data-act="cydel"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.deepEqual(c.api.store.cycle.starts, []);
    assert.doesNotMatch(c.said(), /period/);
});
