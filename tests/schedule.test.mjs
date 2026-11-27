// 📆 Schedule: a timetable with shared time down the middle and each person's plans beside it.
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

test('one day: own plans, a promise falling due and a marked day; the note tells what is left and who is elsewhere', async () => {
    const { collect, default: app } = await import(src('apps/schedule.js'));
    const t = await setup({ apps: ['scene', 'todo', 'calendar', 'schedule'], chat: CHAT(), user: '보리', char: '미루' });
    t.record(0, LINES0); t.record(2, LINES2);
    Object.assign(t.E.envOf('schedule').store, { sel: ['미루'], items: [
        { day: 2, tod: 'evening', what: '저녁 장보기', who: [], where: '시장' },
        { day: 2, tod: 'afternoon', what: '가게 보기', who: ['미루'], where: '서점' },
        { day: 2, tod: 'morning', what: '아침 산책', who: ['보리'] },
        { day: 3, tod: 'morning', what: '혼자 산책', who: ['보리'] }] });
    t.md.apps.calendar = { marks: [{ date: '2026-03-03', label: '개업 기념일' }], notes: {}, start: '2026-03-02' };
    t.E.touch();
    const S = t.state('schedule'), kinds = (day) => collect(S, t.E.envOf('schedule'), day).map((e) => `${e.kind}:${e.title}`);
    assert.deepEqual(kinds(2), ['own:저녁 장보기', 'own:가게 보기', 'own:아침 산책', 'due:우산 돌려주기', 'mark:개업 기념일']);
    assert.deepEqual(kinds(3), ['own:혼자 산책']);
    const note = t.note().state;
    assert.match(note, /On today's schedule[^\n]*evening — everyone together: 저녁 장보기 \(at 시장\)/);
    assert.doesNotMatch(note, /아침 산책/, 'what is already past is not told');
    assert.match(note, /Right now \(afternoon\), elsewhere by their schedule: 미루 — 가게 보기 at 서점/);
    t.E.envOf('schedule').cfg.tell = false; t.E.touch();
    assert.doesNotMatch(t.note().state, /schedule/);
    t.E.envOf('schedule').cfg.tell = true;
    assert.deepEqual(app.hud(S, t.E.envOf('schedule')), ['📆 오후 · 가게 보기']);
});

test('the model\'s week is read: day, who (together / one / two), time, what, where; strangers are dropped', async () => {
    const { parsePlan } = await import(src('apps/schedule.js'));
    const rows = parsePlan('D1 | together | evening | 저녁 식사 | 강가 식당\n- D2 | 미루 | 아침 | 가게 열기 | 서점\nD2 | 보리 & 소담 | afternoon | 시장 구경 | 시장\nD3 | 누군가 | noon | 낮잠 | 집\nD9 | together | noon | x | y\nnot a line', [4, 5, 6], ['보리', '미루', '소담']);
    assert.deepEqual(rows.map((r) => [r.day, r.who, r.tod, r.what, r.where]), [[4, [], 'evening', '저녁 식사', '강가 식당'], [5, ['미루'], 'morning', '가게 열기', '서점'], [5, ['보리', '소담'], 'afternoon', '시장 구경', '시장']]);
    assert.ok(rows.every((r) => r.ai));
});

test('the screen: one line, plans in time order, each in its person\'s colour; now is marked; a tap ticks it off', async () => {
    page();
    const t = await setup({ apps: ['scene', 'people', 'schedule'], chat: CHAT(), user: '보리', char: '미루' });
    t.record(0, LINES0); t.record(2, LINES2);
    Object.assign(t.E.envOf('schedule').store, { seeded: true, sel: ['미루'], items: [
        { day: 2, tod: 'evening', what: '저녁 장보기', who: [], where: '시장' }, { day: 2, tod: 'afternoon', what: '가게 보기', who: ['미루'], where: '서점' },
        { day: 2, tod: 'morning', what: '편지 쓰기', who: ['보리'] }] });
    const el = document.createElement('div');
    const draw = async () => (await import(src('apps/schedule.js'))).default.render(el, await apiFor(t.E, 'schedule', { draw: () => draw() }));
    await draw();
    const evs = [...el.querySelectorAll('.mb4-sch-ev')];
    assert.deepEqual(evs.map((e) => e.querySelector('.mb4-sch-b > b').textContent), ['편지 쓰기', '가게 보기', '저녁 장보기']);
    assert.deepEqual(evs.map((e) => e.querySelector('.mb4-sch-t').textContent), ['아침', '오후', '저녁']);
    assert.notEqual(evs[0].style.getPropertyValue('--c'), evs[1].style.getPropertyValue('--c'), 'each person has a colour');
    assert.match(evs[2].textContent, /📍\s*시장[\s\S]*👤\s*다 같이/);
    assert.match(el.querySelector('.mb4-sch-now').textContent, /지금 · 오후[\s\S]*가게 보기/);
    assert.equal(el.querySelectorAll('.mb4-sch-row, .mb4-sch-lane').length, 0, 'no left / right lanes');
    evs[1].querySelector('[data-act="done"]').click(); await new Promise((r) => setTimeout(r, 20));
    assert.equal(t.E.envOf('schedule').store.items[1].done, true);
    assert.doesNotMatch(el.textContent, /일째/);
});

test('🪄 one button, one call: the whole week for everyone; a second press replaces only what the AI made', async () => {
    page();
    const A1 = 'D1 | together | evening | 저녁 식사 | 강가 식당\nD1 | 미루 | morning | 가게 열기 | 서점\nD2 | 보리 | noon | 장보기 | 시장';
    const A2 = 'D1 | together | night | 별 보기 | 언덕';
    const t = await setup({ apps: ['scene', 'people', 'schedule'], chat: CHAT(), user: '보리', char: '미루', answers: [A1, A2] });
    t.record(0, LINES0); t.record(2, LINES2);
    let calls = 0;
    const el = document.createElement('div');
    const draw = async () => { const api = await apiFor(t.E, 'schedule', { draw: () => draw() }); api.ask = (p) => { calls++; return t.E.host.ask(p); }; (await import(src('apps/schedule.js'))).default.render(el, api); };
    const tick = () => new Promise((r) => setTimeout(r, 20));
    await draw();
    const st = t.E.envOf('schedule').store;
    assert.deepEqual(st.sel, ['소담', '미루'], 'the first time, the people in the scene and the story are picked');
    st.items.push({ day: 2, tod: 'dawn', what: '직접 넣은 일', who: [] });
    el.querySelector('[data-act="magic"]').click(); await tick();
    assert.equal(calls, 1);
    assert.deepEqual(st.items.map((x) => x.what), ['직접 넣은 일', '저녁 식사', '가게 열기', '장보기']);
    assert.deepEqual(st.items.slice(1).map((x) => x.day), [2, 2, 3], 'D1 is today (story day 2)');
    el.querySelector('[data-act="magic"]').click(); await tick();
    assert.equal(calls, 2);
    assert.deepEqual(st.items.map((x) => x.what), ['직접 넣은 일', '별 보기']);
    // picking someone off and on
    [...el.querySelectorAll('[data-act="sel"]')].find((b) => b.dataset.v === '소담').click(); await tick();
    assert.deepEqual(st.sel, ['미루']);
});

test('the phone itself cannot be scrolled away by a hidden input taking focus', () => {
    const CSS = readFileSync(new URL('../phone.css', import.meta.url), 'utf8');
    assert.match(CSS, /\.mb4-phone \{[^}]*overflow: clip/);
    for (const sel of ['.mb4-sw', '.mb4-offchip']) assert.match(CSS, new RegExp(`\\${sel} \\{[^}]*position: relative`), `${sel} holds its own hidden input`);
});
