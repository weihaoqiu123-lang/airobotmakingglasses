import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, fabricationAt, rechargeSeconds, stageAt, productionSeconds } from '../src/order.js';

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

test('the one-minute production run passes through the ticket, fabrication, and packing stages', () => {
  assert.equal(productionSeconds, 60);
  assert.deepEqual([0, 10, 45, 59, 60].map(stageAt), ['ticket', 'making', 'packing', 'packing', 'complete']);
});

test('fabrication exposes the blank, frame, finish and logo in sequence', () => {
  assert.deepEqual([0, 10, 17, 26, 36, 41, 45].map(fabricationAt),
    ['blank', 'loading', 'cutting', 'color', 'marking', 'inspection', 'packing']);
  assert.equal(rechargeSeconds, 10);
});
