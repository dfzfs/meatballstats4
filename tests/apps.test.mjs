// 📱 Every app loads, and every app screen draws (in a fake page) without throwing — with and without data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { setup, chatOf, page, apiFor, src } from './harness.mjs';

const IDS = readdirSync(new URL('../src/apps/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'catalog.js').map((f) => f.replace(/\.js$/, ''));

test('every app module loads and has an id', async () => {
    for (const id of IDS) assert.equal((await import(src(`apps/${id}.js`))).default?.id, id, id);
});

test('the shop window lists every app on a shelf', async () => {
    const { BUILTIN, SHELVES } = await import(src('apps/catalog.js'));
    const onShelf = new Set(SHELVES.flatMap((s) => s.entries.flatMap((e) => e.apps)));
    for (const a of BUILTIN) assert.ok(onShelf.has(a.id), `${a.id} is on no shelf`);
    assert.ok(SHELVES.some((s) => s.entries.some((e) => e.id === 'news' && e.apps.length === 1)), '📰 news has its own place');
});

test('every app screen draws, empty and with a few replies recorded', async () => {
    page();
    const t = await setup({ apps: IDS, chat: chatOf([{ reply: '11월 25일 저녁, 카페.' }, { user: '라떼 주세요.' }, { reply: '"여기요." 그가 잔을 내밀었다.' }]) });
    const draw = async () => {
        for (const id of IDS) {
            const def = t.E.reg.get(id);
            if (!def.render) continue;
            const el = document.createElement('div');
            try { def.render(el, await apiFor(t.E, id)); } catch (e) { assert.fail(`${id} render: ${e.stack}`); }
            assert.doesNotMatch(el.textContent, /일째/, `${id} shows a bare day count`);
        }
    };
    await draw();
    t.record(0, [['date', '11월 25일'], ['time', 'evening'], ['loc', '항구 > 카페'], ['with', '=도윤'], ['npc', '도윤=카페 주인']]);
    t.record(2, [['cash', '-4500 | 라떼'], ['got', '영수증'], ['touch', '도윤>하루=brush'], ['promise', '도윤>하루=빵, 내일 아침', '내일 아침']]);
    await draw();
});

test('the contacts list opens with the group room in it', async () => {
    page();
    const t = await setup({ apps: ['contacts', 'group', 'scene', 'people'], chat: chatOf([{ reply: 'a' }]) });
    const el = document.createElement('div');
    t.E.reg.get('contacts').render(el, await apiFor(t.E, 'contacts'));
    assert.match(el.textContent, /단체방/);
});
