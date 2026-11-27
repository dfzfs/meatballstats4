// 📆 Schedule: routines (time blocks · activity · movement) inside a shared timetable.
// Every name and line here is made up for testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page, setup, chatOf, apiFor, src } from './harness.mjs';

const CHAT = () => chatOf([{ reply: '3월 2일 아침, 서점.' }, { user: '안녕.' }, { reply: '둘은 강가로 걸었다.' }], '미루');
const LINES0 = [['date', '3월 2일'], ['time', 'morning'], ['loc', '구시가 > 서점'], ['with', '=미루'], ['npc', '미루=서점 주인'], ['npc', '소담=꽃집 아르바이트'], ['promise', '미루>보리=우산 돌려주기, tomorrow', '내일']];
const LINES2 = [['time', '+1d afternoon'], ['loc', '강가'], ['with', '=소담']];

test('the story clock is folded from the chat and follows a swipe', async () => {
    const t = await setup({ apps: ['scene', 'schedule'], chat: CHAT(), user: '보리', char: '미루' });
    t.record(0, LINES0); t.record(2, LINES2);
    assert.deepEqual([t.state('schedule').day, t.state('schedule').tod], [2, 'afternoon']);
    t.chat.pop(); t.E.touch();
    assert.deepEqual([t.state('schedule').day, t.state('schedule').tod], [1, 'morning']);
});

test('a day: daily and weekday routines, a one-off, a promise and a marked day; the note tells what is left and where the absent are', async () => {
    const { collect, default: app } = await import(src('apps/schedule.js'));
    const t = await setup({ apps: ['scene', 'todo', 'calendar', 'schedule'], chat: CHAT(), user: '보리', char: '미루' });
    t.record(0, LINES0); t.record(2, LINES2);
    Object.assign(t.E.envOf('schedule').store, { sel: ['미루'], items: [
        { who: '*', rep: 'daily', time: '18:00–19:00', tod: 'evening', what: '다 같이 저녁', how: '부엌 식탁' },
        { who: '미루', rep: 'weekly', wd: [1, 2, 3, 4, 5], time: '13:00–17:00', tod: 'afternoon', what: '가게 보기', how: '서점 계산대에서 거의 안 나옴' },
        { who: '미루', rep: 'weekly', wd: [0], time: '13:00–17:00', tod: 'afternoon', what: '늦잠' },
        { who: '보리', rep: 'daily', time: '07:00–08:00', tod: 'morning', what: '아침 산책' },
        { who: '보리', rep: 'once', day: 3, time: '09:00', tod: 'morning', what: '혼자 장보기' }] });
    t.md.apps.calendar = { marks: [{ date: '2026-03-03', label: '개업 기념일' }], notes: {}, start: '2026-03-02' };
    t.E.touch();
    const S = t.state('schedule'), kinds = (day) => collect(S, t.E.envOf('schedule'), day).map((e) => `${e.kind}:${e.title}`);
    assert.deepEqual(kinds(2), ['own:다 같이 저녁', 'own:가게 보기', 'own:아침 산책', 'due:우산 돌려주기', 'mark:개업 기념일'], 'day 2 is a Tuesday: the Sunday block is not there');
    assert.deepEqual(kinds(3), ['own:다 같이 저녁', 'own:가게 보기', 'own:아침 산책', 'own:혼자 장보기']);
    const note = t.note().state;
    assert.match(note, /On today's schedule[^\n]*18:00–19:00 — everyone together: 다 같이 저녁/);
    assert.doesNotMatch(note, /아침 산책/, 'what is already past is not told');
    assert.match(note, /Right now \(afternoon\), by their usual routine: 미루 — 가게 보기 \(서점 계산대에서 거의 안 나옴\)/);
    t.E.envOf('schedule').cfg.tell = false; t.E.touch();
    assert.doesNotMatch(t.note().state, /schedule|routine/);
    t.E.envOf('schedule').cfg.tell = true;
    assert.deepEqual(app.hud(S, t.E.envOf('schedule')), ['📆 13:00–17:00 · 가게 보기']);
});

test('the model\'s answer is read: who (shared / name), when (daily · days · weekdays · D<n>), a time range, what, how; strangers dropped', async () => {
    const { parsePlan } = await import(src('apps/schedule.js'));
    const rows = parsePlan([
        'shared | daily | 18:00–19:00 | 다 같이 저녁 | 부엌에 모임',
        '- 미루 | weekdays | 07:00 – 09:00 | 가게 문 열기 | 뒷문으로 드나듦 | 손님 적을 때 책 읽음',
        '미루 | Sat, Sun | evening | 산책 | 강가',
        '소담 | D2 | 오후 | 시장 구경 | 시장',
        '누군가 | daily | noon | 낮잠 | 집',
        '미루 | someday | noon | 없음 | 없음',
        'not a line'].join('\n'), { days: [4, 5], people: ['보리', '미루', '소담'] });
    assert.deepEqual(rows.map((r) => [r.who, r.rep, r.wd ?? r.day ?? null, r.time ?? '', r.tod, r.what, r.how]), [
        ['*', 'daily', null, '18:00–19:00', 'evening', '다 같이 저녁', '부엌에 모임'],
        ['미루', 'weekly', [1, 2, 3, 4, 5], '07:00 – 09:00', 'morning', '가게 문 열기', '뒷문으로 드나듦 | 손님 적을 때 책 읽음'],
        ['미루', 'weekly', [0, 6], '', 'evening', '산책', '강가'],
        ['소담', 'once', 5, '', 'afternoon', '시장 구경', '시장']]);
    assert.ok(rows.every((r) => r.ai));
});

test('older saved plans carry over', async () => {
    const { migrate } = await import(src('apps/schedule.js'));
    const st = { items: [{ day: 2, tod: 'evening', what: '저녁', who: [], where: '시장', done: true }, { day: 3, what: '산책', who: ['미루'] }] };
    migrate(st);
    assert.deepEqual(st.items.map((x) => [x.who, x.rep, x.day, x.how, x.doneOn]), [['*', 'once', 2, '시장', { 2: true }], ['미루', 'once', 3, '', {}]]);
});

test('the screen: 👥 공동 holds everyone in time order; overlapping blocks share one group, one short line each; details open on tap', async () => {
    page();
    const t = await setup({ apps: ['scene', 'people', 'schedule'], chat: CHAT(), user: '보리', char: '미루' });
    t.record(0, LINES0); t.record(2, LINES2);
    const st = t.E.envOf('schedule').store;
    Object.assign(st, { seeded: true, sel: ['미루'], items: [
        { who: '*', rep: 'daily', time: '18:00–19:00', tod: 'evening', what: '저녁' },
        { who: '미루', rep: 'daily', time: '13:00–17:00', tod: 'afternoon', what: '가게', how: '계산대' },
        { who: '보리', rep: 'daily', time: '07:00–08:30', tod: 'morning', what: '산책' },
        { who: '미루', rep: 'daily', time: '07:30–12:30', tod: 'morning', what: '회진' },
        { who: '*', rep: 'daily', time: '07:30–08:30', tod: 'morning', what: '아침' }] });
    const el = document.createElement('div');
    const draw = async () => (await import(src('apps/schedule.js'))).default.render(el, await apiFor(t.E, 'schedule', { draw: () => draw() }));
    const tick = () => new Promise((r) => setTimeout(r, 20));
    await draw();
    const groups = () => [...el.querySelectorAll('.mb4-sch-ev')].map((g) => [g.querySelector('.mb4-sch-t').textContent, [...g.querySelectorAll('.mb4-sch-row > b')].map((b) => b.textContent)]);
    assert.deepEqual(groups(), [['아침', ['산책', '아침', '회진']], ['오후', ['가게']], ['저녁', ['저녁']]]);
    assert.match(el.querySelector('.mb4-sch-now').textContent, /지금 · 오후[\s\S]*가게/);
    assert.equal(el.querySelectorAll('.mb4-sch-more').length, 0, 'details stay closed');
    [...el.querySelectorAll('[data-act="open"]')].find((b) => b.textContent.includes('가게')).click(); await tick();
    assert.match(el.querySelector('.mb4-sch-more').textContent, /🚶 계산대[\s\S]*미루 · 매일[\s\S]*✓ 끝냄/);
    el.querySelector('.mb4-sch-more [data-act="done"]').click(); await tick();
    assert.deepEqual(st.items[1].doneOn, { 2: true }, 'a daily block is ticked off for this day only');
    [...el.querySelectorAll('[data-act="view"]')].find((b) => b.dataset.v === '미루').click(); await tick();
    assert.deepEqual(groups().map((g) => g[1]), [['회진'], ['가게']]);
    assert.doesNotMatch(el.textContent, /일째/);
});

test('🪄 opens a panel with everyone ticked; one press, one call: routines for all; again replaces only what the AI made', async () => {
    page();
    const A1 = 'shared | daily | 18:00–19:00 | 다 같이 저녁 | 부엌\n미루 | weekdays | 09:00–17:00 | 가게 보기 | 계산대\n보리 | daily | 07:00–08:00 | 산책 | 강가\n소담 | Sat | noon | 꽃시장 | 시장';
    const A2 = 'shared | daily | 21:00 | 차 마시기 | 거실';
    const t = await setup({ apps: ['scene', 'people', 'schedule'], chat: CHAT(), user: '보리', char: '미루', answers: [A1, A2] });
    t.record(0, LINES0); t.record(2, LINES2);
    let calls = 0, prompt = '';
    const el = document.createElement('div');
    const draw = async () => { const api = await apiFor(t.E, 'schedule', { draw: () => draw() }); api.ask = (p) => { calls++; prompt = p; return t.E.host.ask(p); }; (await import(src('apps/schedule.js'))).default.render(el, api); };
    const tick = () => new Promise((r) => setTimeout(r, 20));
    await draw();
    const st = t.E.envOf('schedule').store;
    assert.deepEqual(st.sel, ['소담', '미루'], 'the first time, the people in the scene and the story are picked');
    st.items.push({ who: '*', rep: 'once', day: 2, what: '직접 넣은 일', doneOn: {} });
    el.querySelector('[data-act="panel"][data-v="ai"]').click(); await tick();
    assert.deepEqual([...el.querySelectorAll('[data-ai]')].map((x) => [x.dataset.ai, x.checked]), [['*', true], ['보리', true], ['소담', true], ['미루', true]]);
    assert.equal(el.querySelector('input[name="mb4-sch-mode"]:checked').value, 'routine');
    el.querySelector('[data-act="magic"]').click(); await tick();
    assert.equal(calls, 1);
    assert.match(prompt, /ROUTINE[\s\S]*who \| when \| time \| what \| how[\s\S]*ONE TO THREE WORDS/);
    assert.deepEqual(st.items.map((x) => `${x.who}:${x.what}`), ['*:직접 넣은 일', '*:다 같이 저녁', '미루:가게 보기', '보리:산책', '소담:꽃시장']);
    el.querySelector('[data-act="panel"][data-v="ai"]').click(); await tick();
    el.querySelector('[data-act="magic"]').click(); await tick();
    assert.equal(calls, 2);
    assert.deepEqual(st.items.map((x) => `${x.who}:${x.what}`), ['*:직접 넣은 일', '*:차 마시기']);
});

test('the phone itself cannot be scrolled away by a hidden input taking focus', () => {
    const CSS = readFileSync(new URL('../phone.css', import.meta.url), 'utf8');
    assert.match(CSS, /\.mb4-phone \{[^}]*overflow: clip/);
    for (const sel of ['.mb4-sw', '.mb4-offchip']) assert.match(CSS, new RegExp(`\\${sel} \\{[^}]*position: relative`), `${sel} holds its own hidden input`);
});
