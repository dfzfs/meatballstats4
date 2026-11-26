// 💰 Money: counted by code; «not enough money» only once the amount is actually known.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, chatOf } from './harness.mjs';

test('no «no money left» when the starting money was never set', async () => {
    const t = await setup({ apps: ['wallet'], chat: chatOf([{ reply: 'a' }]) });
    t.record(0, [['cash', '-5600 | 빵']]);
    const n = t.note();
    assert.doesNotMatch(n.now, /no money|afford/);
    assert.doesNotMatch(n.state, /has -?5,600/);
});

test('with a starting amount, spending more than there is is flagged', async () => {
    const t = await setup({ apps: ['wallet'], chat: chatOf([{ reply: 'a' }]) });
    t.md.apps.wallet = { startCash: 3000 };
    t.record(0, [['cash', '-5600 | 빵']]);
    assert.match(t.note().now, /could not really afford|no money left/);
});

test('a loan grows with interest every 30 story days', async () => {
    const { owedNow } = await import(new URL('../src/apps/wallet.js', import.meta.url).href);
    assert.equal(owedNow({ owed: 10000, rate: 10, from: 1 }, 31), 11000);
    assert.equal(owedNow({ owed: 10000, rate: 0, from: 1 }, 90), 10000);
});
