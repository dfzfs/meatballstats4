// 📖 The reader: recorded answers go through the same checks as live ones (no model call).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf, src } from './harness.mjs';

test('a reply is read once and its lines are kept', async () => {
    const t = await setup({ apps: ['scene', 'todo'], chat: chatOf([{ reply: '저녁 9시, 카페.' }, { user: '내일 아침에 올게요.' }]),
        answers: ['<mb>\nloc: 카페\ntime: night\npromise: 도윤>하루=빵 같이 먹기, 내일 아침 | "내일 아침에 다시 뵙죠"\n</mb>'] });
    const calls = await t.arrive('"좋아요. 내일 아침에 다시 뵙죠."');
    assert.equal(calls, 1);
    assert.equal(t.state('scene').loc, '카페');
    assert.equal(t.state('todo').open.length, 1);
});

test('«당신» written as a name is the person\'s own character', async () => {
    const { meToUser } = await import(src('core/parse.js'));
    assert.equal(meToUser('carry', '당신=소금빵', '하루'), '하루=소금빵');
    assert.equal(meToUser('call', '도윤>당신=손님', '하루'), '도윤>하루=손님');
    assert.equal(meToUser('with', '=도윤, 당신', '하루'), '=도윤');
    assert.equal(meToUser('with', '+당신', '하루'), null);
    assert.equal(meToUser('loc', '당신의 집', '하루'), '당신의 집');
    // and in records already kept
    const t = await setup({ apps: ['look', 'people'], chat: chatOf([{ reply: 'a' }]) });
    t.record(0, [['carry', '당신=소금빵'], ['npc', '당신=손님']]);
    assert.deepEqual(Object.keys(t.state('look').who), ['하루']);
    assert.deepEqual(Object.keys(t.state('people').list), []);
});

test('a connection error while catching up leaves the replies unread', async () => {
    const t = await setup({ apps: ['scene'], chat: chatOf([{ reply: 'a' }, { user: 'b' }, { reply: 'c' }]) });
    t.E.host.classify = async () => { throw new Error('timeout'); };
    await t.E.fill({ batch: 3 });
    assert.equal(t.E.log().filter((e) => e.read).length, 0);
});

test('a move line without a quote is dropped, with one it is kept', async () => {
    const t = await setup({ apps: ['bonds'], chat: chatOf([{ user: '같이 걸을래요?' }]),
        answers: ['<mb>\nmove: 도윤>하루=closer / -\n</mb>', '<mb>\nmove: 도윤>하루=closer / 손을 놓지 않음 | "그는 잡은 손을 놓지 않았다"\n</mb>'] });
    await t.arrive('도윤이 하루를 보며 웃었다. 그는 잡은 손을 놓지 않았다.');
    assert.equal(Object.values(t.state('bonds').pairs)[0]?.moves?.length ?? 0, 0);
    await t.E.reread(t.chat.length - 1);
    assert.equal(Object.values(t.state('bonds').pairs)[0].moves.length, 1);
});
