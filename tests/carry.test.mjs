// 📦 Carrying on from earlier Meatballs, and the Korean repeat finder. All data here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatOf, src } from './harness.mjs';

test('third-generation dates come over, including one set before the first reply', async () => {
    const M = await import(src('st/migrate.js'));
    const { fingerprint } = await import(src('core/text.js'));
    const chat = chatOf([{ reply: '첫 답' }, { user: '다음' }, { reply: '둘째 답' }]);
    const fp = (m) => `a.${fingerprint(m)}`;
    const md = { meatball_status3: {
        pre: [{ k: 'date', date: { m: 11, d: 25, wd: 3 }, force: true, by: 'user' }],
        ev: { [fp(chat[2])]: [{ k: 'time', days: 1, tod: 'morning' }, { k: 'date', date: { m: 11, part: 'late' } }] },
    } };
    const got = M.collect(md, chat, '하루');
    assert.deepEqual(got.records[fingerprint(chat[0])].L[0], ['date', 'November 25 (Wednesday)']);
    assert.ok(got.records[fingerprint(chat[2])].L.some(([k, v]) => k === 'date' && v === 'late November'));
});

test('Korean replies that keep writing the same thing are noticed', async () => {
    const { koRepeated } = await import(src('apps/echo.js'));
    const a = '그는 잠시 말을 멈추고 입술을 깨물었다. 창밖으로 비가 내렸다. 방 안은 조용했고 시계 소리만 들렸다. 그녀는 고개를 들어 그를 바라보았다.';
    const b = '그녀가 다가오자 그는 입술을 깨물었다. 복도 끝에서 누군가 웃는 소리가 났다. 오래된 전등이 깜빡였고 바닥은 차가웠다. 그는 대답하지 않았다.';
    assert.ok(koRepeated([a, b]).some((p) => p.includes('깨물었다')));
    const c = '아침이 밝았다. 그녀는 창문을 열었다. 새가 지저귀었다. 커피 향이 부엌에 가득했다. 오늘은 장을 보러 가야 했다.';
    assert.deepEqual(koRepeated([a, c]), []);
});
