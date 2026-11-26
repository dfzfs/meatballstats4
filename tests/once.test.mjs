// 🎲 One-time things ride with the next reply once — and again with every reroll of that reply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf } from './harness.mjs';

const has = (t, re) => re.test(t.note().now);

test('a die verdict survives a reroll and is gone after the next reply', async () => {
    const t = await setup({ apps: ['dice'], chat: chatOf([{ reply: 'a' }, { user: 'b' }]) });
    t.md.apps.dice = { roll: { n: 2, mod: 0, target: 12, what: '문 열기' } };
    t.E.touch();
    assert.ok(has(t, /A die decided/));
    await t.arrive('c');                       // the reply it was for
    t.setGen('swipe'); t.E.touch();
    assert.ok(has(t, /A die decided/), 'reroll keeps it');
    t.setGen(''); t.say('d'); t.setGen('normal'); t.E.touch();
    assert.ok(!has(t, /A die decided/), 'a new reply does not');
});

test('an answered confession card survives a reroll', async () => {
    const t = await setup({ apps: ['bonds', 'heart'], chat: chatOf([{ reply: 'a' }, { user: 'b' }]) });
    t.md.apps.heart = { card: { kind: 'confess', who: '도윤', yes: true, at: 0 } };
    t.E.touch();
    assert.ok(has(t, /ACCEPTS/));
    await t.arrive('c');
    t.setGen('regenerate'); t.E.touch();
    assert.ok(has(t, /ACCEPTS/));
});
