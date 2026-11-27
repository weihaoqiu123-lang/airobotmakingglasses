import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createArmSolver, upperArmLength, forearmLength } from '../src/arm.js';

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' differs from ' + expected);
}

test('upper arm and forearm keep their physical lengths at every reach', () => {
  for (const side of [-1, 1]) {
    const shoulder = new Vector3(side * .54, 1.38, .018);
    const solve = createArmSolver(shoulder, side);
    for (const target of [
      new Vector3(side * .71, .71, .26),
      new Vector3(side * .40, 1.63, .96),
      new Vector3(side * .64, 1.20, 2.50),
      shoulder.clone(),
    ]) {
      const { elbow, wrist } = solve(target, 0);
      near(shoulder.distanceTo(elbow), upperArmLength);
      near(elbow.distanceTo(wrist), forearmLength);
      if (target.z > 2) assert.ok(wrist.distanceTo(target) > 1);
    }
  }
});

test('folding the elbows narrows the pose for the charging bay', () => {
  const shoulder = new Vector3(.54, 1.38, .018);
  const solve = createArmSolver(shoulder, 1);
  const target = new Vector3(.57, .83, .44);
  const open = solve(target, 0).elbow.x;
  const tucked = solve(target, 1).elbow.x;
  assert.ok(tucked < open - .16);
});
