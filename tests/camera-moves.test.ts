import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraMoves, isCameraMove, moveCamera } from '../src/lib/camera-moves.ts';
import type { Vec3 } from '../src/lib/camera-moves.ts';

const start: Vec3 = [8, 5, 12], target: Vec3 = [0, 1, 0];
const distance = (a: Vec3) => Math.hypot(a[0] - target[0], a[1] - target[1], a[2] - target[2]);
// Positive values lie to the camera's right when it faces the target from `start`.
const sideways = (a: Vec3) => { const f = [target[0] - start[0], target[2] - start[2]]; return (a[0] - start[0]) * -f[1] + (a[2] - start[2]) * f[0]; };

test('every move begins at the staged camera and a locked camera never moves', () => {
  for (const move of cameraMoves) {
    const at = moveCamera(start, target, move.id, 0);
    assert.ok(Math.hypot(at[0] - start[0], at[1] - start[1], at[2] - start[2]) < 1e-9, move.id);
  }
  assert.deepEqual(moveCamera(start, target, 'static', 1), [...start]);
});

test('moves travel in the direction their names promise', () => {
  assert.ok(distance(moveCamera(start, target, 'push-in', 1)) < distance(start) * .7);
  assert.ok(distance(moveCamera(start, target, 'pull-out', 1)) > distance(start) * 1.4);
  assert.ok(sideways(moveCamera(start, target, 'orbit-left', 1)) < -1);
  assert.ok(sideways(moveCamera(start, target, 'orbit-right', 1)) > 1);
  assert.ok(Math.abs(distance(moveCamera(start, target, 'orbit-left', 1)) - distance(start)) < 1e-9, 'orbits keep their distance');
  assert.ok(moveCamera(start, target, 'crane-up', 1)[1] > start[1] + 2);
  assert.ok(moveCamera(start, target, 'crane-down', 1)[1] < start[1]);
});

test('moves ease, clamp time, and stay above the stage floor', () => {
  const quarter = distance(start) - distance(moveCamera(start, target, 'push-in', .25));
  const half = distance(start) - distance(moveCamera(start, target, 'push-in', .5));
  assert.ok(quarter < half / 2, 'the move eases in');
  assert.deepEqual(moveCamera(start, target, 'push-in', 4), moveCamera(start, target, 'push-in', 1));
  assert.deepEqual(moveCamera(start, target, 'push-in', Number.NaN), moveCamera(start, target, 'push-in', 0));
  const low: Vec3 = [9, 1.4, 9];
  assert.ok(moveCamera(low, target, 'crane-down', 1)[1] > target[1], 'a crane stops above the horizon');
  assert.equal(isCameraMove('orbit-right'), true);
  assert.equal(isCameraMove('dutch-tilt'), false);
});
