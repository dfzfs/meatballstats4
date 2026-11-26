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
        assert.deepEqual(c.api.store.cycle.starts, [1]);
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
    c.api.store.cycle.starts = [-10];   // started 11 days before today: past a 5-day period
    assert.doesNotMatch(c.said(), /period/);
    c.draw();
    assert.match(c.el.textContent, /지금은 기간이 아니에요 · 다음 시작까지 약 17일/);
});
