import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, receiptFor, recordDispatch, pairRate, pairPhaseAt, rechargeSeconds } from '../src/order.js';

test('a submitted order snapshots the confirmed custom design and derives the demo total', () => {
  const design = { frame: 'round', color: 'forest', logo: 'data:image/png;base64,test', logoName: 'club.png', quantity: 3 };
  const order = createOrder(design, 'FO-1234');
  design.quantity = 1;
  design.color = 'carbon';
  assert.deepEqual(order, {
    id: 'FO-1234',
    design: { frame: 'round', color: 'forest', logo: 'data:image/png;base64,test', logoName: 'club.png', quantity: 3 },
    total: 897,
  });
});

test('a bad design cannot start a production order', () => {
  const design = { frame: 'round', color: 'forest', logo: '', logoName: '', quantity: 1 };
  for (const invalid of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: 100 }, { frame: 'missing' }, { color: 'missing' }]) {
    assert.throws(() => createOrder({ ...design, ...invalid }, 'FO-1234'), RangeError);
  }
});

test('ticket size, time, and surprise match quantity and reaction boundaries', () => {
  assert.deepEqual(receiptFor(1), receiptFor(5));
  assert.deepEqual(receiptFor(6), { length: 1.02, seconds: 1.84, reaction: 1 });
  assert.deepEqual(receiptFor(40), { length: 1.7, seconds: 3.2, reaction: 2 });
  assert.deepEqual(receiptFor(99), { length: 2.88, seconds: 5.56, reaction: 3 });
  assert.deepEqual([5, 6, 20, 21, 50, 51].map(q => receiptFor(q).reaction), [0, 1, 1, 2, 2, 3]);
});

test('one pair proceeds from drawer loading through dispatch', () => {
  assert.deepEqual([0, 6, 10, 14, 17, 20.5, 22, 24, 28].map(pairPhaseAt),
    ['loading', 'cutting', 'temples', 'assembly', 'color', 'marking', 'inspection', 'packing', 'conveyor']);
  assert.equal(rechargeSeconds, 10);
});

test('dispatch counts every carton and never advances beyond the actual order', () => {
  for (const total of [1, 5, 6, 40, 99]) {
    let completed = 0;
    for (let box = 1; box <= total; box++) {
      completed = recordDispatch(completed, total);
      assert.equal(completed, box);
    }
    assert.equal(recordDispatch(completed, total), total);
  }
});

test('large orders keep the first pair at normal speed unless manually changed', () => {
  assert.deepEqual([pairRate(5, 1), pairRate(6, 0), pairRate(6, 1), pairRate(40, 9)], [1, 1, 4, 4]);
  assert.equal(pairRate(40, 9, 1), 1);
  assert.equal(pairRate(1, 0, 4), 4);
});
