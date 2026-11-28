// Hiding messages (the eye button, /hide) only takes them out of the prompt. What was recorded for them
// must still count: the relationship sheet and every other ledger state stay as they were.
// Every name and line here is made up for testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf } from './harness.mjs';

const story = () => chatOf([
    { user: '같이 걷자' }, { reply: '둘은 나란히 걸었다.' },
    { user: '손 잡아도 돼?' }, { reply: '그가 손을 내밀었다.' },
    { user: '고마워' }, { reply: '그는 웃었다.' },
]);
const hide = (chat, from, to) => { for (let i = from; i <= to; i++) chat[i].is_system = true; };

test('hiding old messages keeps the relationship sheet', async () => {
    const chat = story();
    const t = await setup({ apps: ['bonds'], chat });
    t.record(1, [['touch', '도윤>하루=holding hands', '']]);
    t.record(3, [['feel', '도윤>하루=attraction', '']]);
    const before = JSON.stringify(t.state('bonds'));
    assert.ok(Object.keys(t.state('bonds').pairs).length > 0, 'the pair exists before hiding');
    hide(chat, 0, 3); t.E.touch();
    assert.equal(JSON.stringify(t.state('bonds')), before, 'same sheet after hiding');
});

test('hidden replies are not read again and do not count as unread', async () => {
    const chat = story();
    const t = await setup({ apps: ['bonds'], chat });
    hide(chat, 0, 3); t.E.touch();
    assert.equal(t.E.unreadCount(), 1, 'only the visible reply is unread');
});

test('real system notices are still skipped', async () => {
    const chat = story();
    chat.splice(2, 0, { is_user: false, is_system: true, name: 'SillyTavern System', mes: '알림', extra: { type: 'narrator' } });
    const { isReply, isStory } = await import('../src/core/text.js');
    assert.equal(isReply(chat[2]), false);
    assert.equal(isStory(chat[2]), false);
    chat[1].is_system = true;
    assert.equal(isStory(chat[1]), true, 'a hidden reply is still part of the story');
});
