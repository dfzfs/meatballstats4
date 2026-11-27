// 📆 Schedule: one timeline per story day, built from its own plans and from what other apps recorded.
// Every name and line here is made up for testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page, setup, chatOf, apiFor, src } from './harness.mjs';

const CHAT = () => chatOf([{ reply: '3월 2일 아침, 서점.' }, { user: '안녕.' }, { reply: '둘은 강가로 걸었다.' }], '미루');
const LINES0 = [['date', '3월 2일'], ['time', 'morning'], ['loc', '구시가 > 서점'], ['with', '=미루'], ['gist', 'They open the shop together.'], ['promise', '미루>보리=우산 돌려주기, tomorrow', '내일']];
const LINES2 = [['time', '+1d afternoon'], ['loc', '강가'], ['with', '+소담']];

test('the day is folded from the chat: places, people met and the summary land on the right day and time', async () => {
    const t = await setup({ apps: ['scene', 'todo', 'calendar', 'schedule'], chat: CHAT(), user: '보리', char: '미루' });
    t.record(0, LINES0); t.record(2, LINES2);
    const S = t.state('schedule');
    assert.equal(S.day, 2); assert.equal(S.tod, 'afternoon');
    assert.deepEqual(S.log.map((l) => [l.d, l.t, l.k, l.v]), [[1, 'morning', 'loc', '서점'], [1, 'morning', 'met', '미루'], [1, 'morning', 'gist', 'They open the shop together.'], [2, 'afternoon', 'loc', '강가'], [2, 'afternoon', 'met', '소담']]);
    // a reply swiped away takes its part of the day with it
    t.chat.pop(); t.E.touch();
    assert.equal(t.state('schedule').day, 1);
    assert.equal(t.state('schedule').log.length, 3);
});

test('one timeline: own plans, a person\'s week, a promise falling due and a marked day', async () => {
    const { collect, default: app } = await import(src('apps/schedule.js'));
    const t = await setup({ apps: ['scene', 'todo', 'calendar', 'schedule'], chat: CHAT(), user: '보리', char: '미루' });
    t.record(0, LINES0); t.record(2, [['time', '+1d afternoon'], ['loc', '강가'], ['with', '=소담']]);
    const env = t.E.envOf('schedule');
    Object.assign(env.store, { sel: ['미루'], items: [{ day: 2, tod: 'evening', what: '저녁 장보기', who: [], where: '시장' }, { day: 3, tod: 'morning', what: '혼자 산책', who: ['보리'] }], rt: { 미루: [{ wd: [], tod: 'afternoon', what: '가게 보기', where: '서점' }, { wd: [0], tod: 'morning', what: '늦잠', where: '' }] } });
    t.md.apps.calendar = { marks: [{ date: '2026-03-03', label: '개업 기념일' }], notes: {}, start: '2026-03-02' };
    t.E.touch();
    const S = t.state('schedule'), kinds = (day) => collect(S, t.E.envOf('schedule'), day).map((e) => `${e.kind}:${e.title}`);
    assert.deepEqual(kinds(2).filter((x) => !/^(loc|met|gist)/.test(x)), ['own:저녁 장보기', 'rt:가게 보기', 'due:우산 돌려주기', 'mark:개업 기념일']);   // day 2 is Tuesday 3월 3일: the Sunday-only row is not there
    assert.deepEqual(kinds(3), ['own:혼자 산책', 'rt:가게 보기']);
    // the main model hears today's plan and where the picked person is by habit — and nothing once switched off
    const note = t.note().state;
    assert.match(note, /On today's schedule[^\n]*: evening — everyone together: 저녁 장보기 \(at 시장\)/);
    assert.match(note, /By habit, right now \(afternoon\): 미루 is at 서점 \(가게 보기\)/);
    t.E.envOf('schedule').cfg.tell = false; t.E.touch();
    assert.doesNotMatch(t.note().state, /schedule|By habit/);
    assert.deepEqual(app.hud(S, t.E.envOf('schedule')), ['📆 저녁 · 저녁 장보기']);
});

test('a week written as lines is read: days, time of day, what, where', async () => {
    const { parseRoutine } = await import(src('apps/schedule.js'));
    assert.deepEqual(parseRoutine('1. Mon, Wed | morning | 수업 듣기 | 강의실\n- every | night | 일기 쓰기 |\nweekend | 낮 | 시장 구경 | 시장\nnot a line'), [
        { wd: [1, 3], tod: 'morning', what: '수업 듣기', where: '강의실' }, { wd: [], tod: 'night', what: '일기 쓰기', where: '' }, { wd: [0, 6], tod: 'noon', what: '시장 구경', where: '시장' }]);
    assert.deepEqual(parseRoutine('월·수 | 아침 | 수업 | 학교')[0].wd, [1, 3]);
});

test('the screen: adding a plan, picking a person, 🪄 one call for their week', async () => {
    page();
    const t = await setup({ apps: ['scene', 'people', 'todo', 'calendar', 'schedule'], chat: CHAT(), user: '보리', char: '미루', answers: ['Tue, Thu | evening | 야간 수업 | 학원\nevery | morning | 가게 열기 | 서점'] });
    t.record(0, [...LINES0, ['npc', '미루=서점 주인']]); t.record(2, LINES2);
    const el = document.createElement('div');
    const draw = async () => { const api = await apiFor(t.E, 'schedule', { draw: () => draw() }); api.ask = (p) => t.E.host.ask(p); (await import(src('apps/schedule.js'))).default.render(el, api); };
    const tickle = () => new Promise((r) => setTimeout(r, 20));
    await draw();
    assert.equal(el.querySelectorAll('.mb4-sch-day').length, 7);
    assert.match(el.querySelector('.mb4-sch-slot.now').textContent, /지금\s*오후/);
    assert.doesNotMatch(el.textContent, /일째/);
    // pick a person -> their chip joins the row
    const box = [...el.querySelectorAll('[data-act="sel"]')].find((x) => x.dataset.v === '미루');
    box.checked = true; box.dispatchEvent(new Event('change')); await tickle();
    assert.ok([...el.querySelectorAll('.mb4-sch-p')].some((b) => b.dataset.v === '미루'));
    // add a shared plan for today's evening
    el.querySelector('[data-f="what"]').value = '같이 저녁 먹기'; el.querySelector('[data-f="tod"]').value = 'evening';
    el.querySelector('[data-act="add"]').click(); await tickle();
    assert.deepEqual(t.E.envOf('schedule').store.items.map((x) => [x.day, x.tod, x.what, x.who]), [[2, 'evening', '같이 저녁 먹기', []]]);
    assert.match([...el.querySelectorAll('.mb4-sch-slot')].at(-1).textContent, /저녁\s*같이 저녁 먹기/);
    // tick it off
    el.querySelector('[data-act="done"]').click(); await tickle();
    assert.equal(t.E.envOf('schedule').store.items[0].done, true);
    // 🪄
    el.querySelector('[data-act="ai"]').click();
    await tickle();
    assert.deepEqual(t.E.envOf('schedule').store.rt['미루'].map((r) => [r.wd, r.tod, r.what]), [[[2, 4], 'evening', '야간 수업'], [[], 'morning', '가게 열기']]);
});

test('the phone itself cannot be scrolled away by a hidden input taking focus', () => {
    const CSS = readFileSync(new URL('../phone.css', import.meta.url), 'utf8');
    assert.match(CSS, /\.mb4-phone \{[^}]*overflow: clip/);
    for (const sel of ['.mb4-sw', '.mb4-offchip']) assert.match(CSS, new RegExp(`\\${sel} \\{[^}]*position: relative`), `${sel} holds its own hidden input`);
});
