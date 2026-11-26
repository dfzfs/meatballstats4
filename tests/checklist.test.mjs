// ✅ The 4.2 checklist, kept true: fonts, glass bars, contacts as one chat list, «✏️ 고치기» everywhere it was asked for.
// All names and lines are made up for testing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, chatOf, page, apiFor, src } from './harness.mjs';

const CSS = readFileSync(new URL('../phone.css', import.meta.url), 'utf8');

test('fonts: only 기본 and 온글잎 박다현체 are built in, and the face is declared', async () => {
    globalThis.SillyTavern ??= { getContext: () => ({ extensionSettings: {} }) };
    const { BUILTIN_FONTS } = await import(src('st/look.js'));
    assert.deepEqual(BUILTIN_FONTS.map((f) => f.name), ['기본', '온글잎 박다현체']);
    assert.match(CSS, /@font-face\s*\{\s*font-family:\s*'OngleipParkDahyeon';[^}]*Ownglyph_ParkDaHyun\.woff2/);
});

test('shelf and tab bars take the wallpaper colour as glass, in day and night', () => {
    assert.match(CSS, /\.mb4-shelves, \.mb4-tabs[^{]*\{[^}]*background: var\(--glass\)[^}]*backdrop-filter: blur\(/);
    const day = CSS.match(/\.mb4-phone \{[^}]*--glass:[^;]*var\(--wall\)/), night = CSS.match(/\.mb4-phone\.mb4-dark \{[^}]*--glass:[^;]*var\(--wall\)/);
    assert.ok(day && night, '--glass follows --wall in both modes');
});

test('contacts: one shelf entry, the chat list has no tab row and holds the group room', async () => {
    const { SHELVES } = await import(src('apps/catalog.js'));
    const e = SHELVES.flatMap((s) => s.entries).find((x) => x.id === 'contacts');
    assert.deepEqual(e.apps, ['contacts', 'group', 'touch']);
    assert.ok(!e.front, 'contacts is not a «한눈에» page');
    page();
    const t = await setup({ apps: ['contacts', 'group', 'scene', 'people'], chat: chatOf([{ reply: 'a' }]) });
    const el = document.createElement('div');
    t.E.reg.get('contacts').render(el, await apiFor(t.E, 'contacts'));
    assert.equal(el.querySelector('.mb4-tabs'), null);
    assert.match(el.textContent, /단체방/);
});

// checklist item 6: these apps had no «직접 고치기» before 4.2
const EDIT = ['music', 'news', 'group', 'contacts', 'fortune', 'dice', 'choices', 'album', 'hypno', 'touch', 'twist', 'life', 'mind', 'todo', 'scene', 'calendar'];

test('every app from the «고치기 마저» list has an edit card once it has something saved', async () => {
    page();
    const t = await setup({ apps: [...EDIT, 'people', 'heart', 'wallet', 'stats'], chat: chatOf([{ reply: '3월 2일 아침, 빵집.' }, { user: '안녕하세요.' }, { reply: '"어서 와요." 그가 웃었다.' }]) });
    t.record(0, [['date', '3월 2일'], ['time', 'morning'], ['loc', '골목 > 빵집'], ['with', '=도윤'], ['npc', '도윤=빵집 주인'], ['weather', '맑음']]);
    t.record(2, [['promise', '도윤>하루=식빵, 내일', '내일'], ['heart', '도윤=+3']]);
    // things that only a tap saves: a text thread, a kept scene
    t.E.envOf('contacts').store.threads = { 도윤: [{ me: true, text: '문 열었어요?' }, { text: '네, 지금 열었어요.' }] };
    t.E.envOf('album').store.shots = [{ cap: '첫 빵', text: '갓 구운 식빵 냄새.' }];
    t.E.envOf('album').store._tab = 'shots';
    const missing = [];
    for (const id of EDIT) {
        const el = document.createElement('div');
        const api = await apiFor(t.E, id);
        t.E.reg.get(id).render(el, api);
        if (id === 'contacts' && !el.querySelector('.mb4-edcard')) {   // the edit card lives inside a conversation
            const open = el.querySelector('[data-act="open"], [data-who], .mbx-row:not([data-act="group"])');
            open?.click();
            t.E.reg.get(id).render(el, api);
        }
        if (!el.querySelector('.mb4-edcard')) missing.push(id);
    }
    assert.deepEqual(missing, [], `no edit card: ${missing.join(', ')}`);
});
