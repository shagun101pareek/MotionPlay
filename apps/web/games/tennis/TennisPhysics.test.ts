import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inServiceBox, netFault, stepTennis, strikeBall } from './TennisPhysics';

test('a tennis serve can reach the service box', () => {
  let ball = strikeBall({ x: 0, y: 1.4, z: 1.2, vx: 0, vy: 0, vz: 0 }, 'serve', 0.75, 0, 'player');
  let landed = false;
  for (let i = 0; i < 400; i += 1) {
    const next = stepTennis(ball, 1 / 120);
    if (next.y <= 0) {
      landed = inServiceBox({ ...next, y: 0 }, 'player');
      ball = next;
      break;
    }
    ball = next;
  }
  assert.equal(landed, true);
});

test('a ball through the net is a fault', () => {
  assert.equal(
    netFault({ x: 0, y: 0.4, z: 11.2, vx: 0, vy: 0, vz: 12 }, { x: 0, y: 0.4, z: 12.4, vx: 0, vy: 0, vz: 12 }),
    true,
  );
});
