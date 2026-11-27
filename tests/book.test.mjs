// 📘 Setting book: built from picked sources (read whole), then attached in full to every Meatball model call.
// Every name and line here is made up for testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { page, setup, chatOf, apiFor, src } from './harness.mjs';

const SRC = () => [
    { id: 'card', label: '🃏 캐릭터 카드', size: 300, on: true, linked: true },
    { id: 'recent', label: '🕰 최근 대화 6개', size: 0, on: false, linked: true },
    { id: 'wi:바닷마을', label: '📚 바닷마을', size: 900, n: 2, linked: true, on: true, items: [
        { id: 'wx:바닷마을:1', title: '등대', keys: '등대', always: true, size: 500, on: true },
        { id: 'wx:바닷마을:2', title: '시장', keys: '시장', always: false, size: 400, on: true }] }];

test('build: the picked sources are read whole and one call writes the book; it is kept for the chat and the character', async () => {
    page();
    const t = await setup({ apps: ['lore'], chat: chatOf([{ reply: '서점.' }], '미루'), user: '보리', char: '미루' });
    const el = document.createElement('div'), asked = [], read = [];
    const LONG = '가'.repeat(30000);
    const draw = async () => { const api = await apiFor(t.E, 'lore', { draw: () => draw() });
        api.sources = { list: async () => SRC(), read: async (pick) => { read.push(pick); return { text: `[CARD]\n${LONG}`, chars: LONG.length + 7 }; } };
        api.ask = async (p, max) => { asked.push([p, max]); return '[WORLD] 바닷가 마을.\n[PEOPLE] 미루 — 서점 주인.'; };
        (await import(src('apps/lore.js'))).default.render(el, api); };
    const tick = () => new Promise((r) => setTimeout(r, 20));
    await draw(); await tick();
    assert.match(el.textContent, /🃏 캐릭터 카드[\s\S]*📚 바닷마을[\s\S]*항목 2 \/ 2/);
    // take one lorebook entry out
    el.querySelector('[data-act="srcopen"]').click(); await tick();
    const e2 = [...el.querySelectorAll('[data-src]')].find((x) => x.dataset.src === 'wx:바닷마을:2');
    e2.checked = false; e2.dispatchEvent(new Event('change')); await tick();
    const st = t.E.envOf('lore').store;
    assert.deepEqual(st.pick, ['card', 'wi:바닷마을', 'wx:바닷마을:2'], 'what is on, plus the single entry taken out');
    el.querySelector('[data-act="note"]').value = '둘은 아직 서먹하다'; el.querySelector('[data-act="note"]').dispatchEvent(new Event('change'));
    el.querySelector('[data-act="build"]').click(); await tick();
    assert.deepEqual(read, [['card', 'wi:바닷마을', 'wx:바닷마을:2']]);
    assert.equal(asked.length, 1);
    assert.ok(asked[0][0].includes(LONG), 'the whole source goes in, uncut');
    assert.match(asked[0][0], /SETTING BOOK[\s\S]*EXTRA INSTRUCTIONS[\s\S]*둘은 아직 서먹하다[\s\S]*SOURCE:/);
    assert.equal(st.book, '[WORLD] 바닷가 마을.\n[PEOPLE] 미루 — 서점 주인.');
    assert.equal(t.E.envOf('lore').card.book, st.book, 'a new chat with this character starts with it');
    // building again asks first
    el.querySelector('[data-act="build"]').click(); await tick();
    assert.equal(asked.length, 1); assert.match(el.querySelector('[data-act="build"]').textContent, /한 번 더/);
});

test('use: the whole book rides on every tap call; on the reader only when switched on; never while the app is off', async () => {
    const BOOK = `[WORLD] ${'나'.repeat(12000)} 끝.`;
    const t = await setup({ apps: ['scene', 'lore'], chat: chatOf([{ reply: '서점.' }], '미루'), user: '보리', char: '미루' });
    const seen = { ask: [], read: [] };
    t.E.host.ask = async (p) => { seen.ask.push(p); return 'ok'; };
    t.E.host.classify = async (p) => { seen.read.push(p); return '<mb>none</mb>'; };
    t.E.envOf('lore').store.book = BOOK;
    await t.E.ask('Write one line.', 200);
    assert.ok(seen.ask[0].startsWith('Write one line.') && seen.ask[0].includes(BOOK), 'attached in full');
    await t.arrive('강가로 걸었다.');
    assert.ok(seen.read.length && !seen.read.at(-1).includes('SETTING BOOK'), 'the reader stays light by default');
    t.E.envOf('lore').cfg.read = true;
    await t.arrive('시장에 들렀다.');
    assert.ok(seen.read.at(-1).includes(BOOK));
    assert.match(seen.read.at(-1), /report nothing from it/);
    assert.doesNotMatch(t.note().state, /SETTING BOOK/, 'never sent to the main story model');
});

test('the setting book sits first on the phone, alone', async () => {
    const { SHELVES } = await import(src('apps/catalog.js'));
    assert.deepEqual(SHELVES[0].entries[0], { id: 'lore', apps: ['lore'] });
});
