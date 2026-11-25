import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateFlight, shotVelocity, stepShuttle, type Shuttle } from './BadmintonPhysics';

function fly(shuttle: Shuttle, seconds: number): { shuttle: Shuttle; event: ReturnType<typeof evaluateFlight> } {
  let current = shuttle;
  let event: ReturnType<typeof evaluateFlight> = { type: 'fly' };
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    const next = stepShuttle(current, dt);
    event = evaluateFlight(current, next, 'player');
    current = next.y < 0 ? { ...next, y: 0, vy: 0, vz: 0, vx: 0 } : next;
    if (event.type !== 'fly') break;
  }
  return { shuttle: current, event };
}

test('a badminton serve clears the net and lands in the opposite court', () => {
  const velocity = shotVelocity('serve', 0.7, 0.8, 0, 1);
  const result = fly({ x: 0, y: 1.15, z: 1.25, ...velocity }, 4);
  assert.equal(result.event.type, 'land');
  if (result.event.type !== 'land') return;
  assert.equal(result.event.hitterScores, true);
  assert.ok(result.shuttle.z > 6.7);
});

test('a shuttle below the net is a fault', () => {
  const event = evaluateFlight({ x: 0, y: 0.4, z: 6.2, vx: 0, vy: 0, vz: 8 }, { x: 0, y: 0.4, z: 7.2, vx: 0, vy: 0, vz: 8 }, 'player');
  assert.equal(event.type, 'net');
});

test('gravity brings a still shuttle to the ground', () => {
  const result = fly({ x: 0, y: 2, z: 3, vx: 0, vy: 0, vz: 0 }, 2);
  assert.equal(result.event.type, 'land');
});
