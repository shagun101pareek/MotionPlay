import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TABLE,
  canStrike,
  emptyFacts,
  onBounce,
  ruleDead,
  ruleNet,
  serveStrike,
  serverFor,
  stepTableTennis,
  strike,
  tossBall,
  winnerOf,
  type Ball,
} from './TableTennisPhysics';

function flight(ball: Ball, until: 'player' | 'opponent', seconds = 2.8) {
  let sample = ball;
  const bounces = { player: 0, opponent: 0 };
  let net = false;
  let floor = false;
  let minClear = Infinity;
  for (let i = 0; i < seconds * 120; i += 1) {
    const prev = sample;
    const step = stepTableTennis(sample, 1 / 120);
    sample = step.ball;
    if ((prev.z < 0 && sample.z >= 0) || (prev.z > 0 && sample.z <= 0)) {
      const t = (0 - prev.z) / (sample.z - prev.z || 1);
      minClear = Math.min(minClear, prev.y + (sample.y - prev.y) * t);
    }
    if (step.event === 'net') net = true;
    if (step.event === 'floor') floor = true;
    if (step.event === 'table' && step.side) bounces[step.side] += 1;
    if (net || floor) break;
    if (bounces[until] >= 1) break;
  }
  return { ball: sample, bounces, net, floor, minClear };
}

test('gravity pulls the ball down', () => {
  const next = stepTableTennis({ x: 0, y: 1.2, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, topspin: 0 }, 0.1);
  assert.ok(next.ball.vy < -0.5);
  assert.equal(next.event, 'none');
});

test('the ball bounces on the table and not beside it', () => {
  const on = stepTableTennis({ x: 0, y: TABLE.surfaceY + 0.08, z: 0.2, vx: 0, vy: -1, vz: 0, spin: 0, topspin: 0 }, 0.05);
  assert.equal(on.event, 'table');
  assert.ok(on.ball.vy > 0);
  let off = stepTableTennis({ x: 1.4, y: TABLE.surfaceY + 0.08, z: 0.2, vx: 0, vy: -1, vz: 0, spin: 0, topspin: 0 }, 1 / 120);
  for (let i = 0; i < 90 && off.event !== 'floor'; i += 1) off = stepTableTennis(off.ball, 1 / 120);
  assert.equal(off.event, 'floor');
});

test('a low ball is stopped by the net', () => {
  const hit = stepTableTennis({ x: 0, y: TABLE.surfaceY + 0.06, z: -0.05, vx: 0, vy: 0, vz: 2, spin: 0, topspin: 0 }, 0.08);
  assert.equal(hit.event, 'net');
  assert.ok(hit.ball.z < 0);
});

test('a legal serve bounces once on each half', () => {
  const served = serveStrike(tossBall('player', 0), {
    kind: 'forehand',
    intensity: 0.55,
    angle: 0,
    aimError: 0,
    height: 0.4,
    side: 'player',
  });
  const result = flight(served, 'opponent');
  assert.equal(result.bounces.player, 1, `own bounce missing, z=${result.ball.z.toFixed(2)} clear=${result.minClear.toFixed(2)}`);
  assert.equal(result.bounces.opponent, 1, `far bounce missing, z=${result.ball.z.toFixed(2)} net=${result.net}`);
  assert.equal(result.net, false);
});

test('a centered forehand clears the net and lands on the far half', () => {
  const hit = strike(
    { x: 0, y: 1.02, z: -1.05, vx: 0, vy: -0.2, vz: -2.4, spin: 0, topspin: 0.2 },
    { kind: 'forehand', intensity: 0.66, angle: 0, aimError: 0, height: 0.45, side: 'player' },
  );
  assert.ok(hit.vz > 0);
  const result = flight(hit, 'opponent');
  assert.equal(result.net, false, `net, clear=${result.minClear.toFixed(2)}`);
  assert.ok(result.minClear > TABLE.surfaceY + TABLE.netHeight - 0.02);
  assert.equal(result.bounces.opponent, 1, `z=${result.ball.z.toFixed(2)} bounces=${JSON.stringify(result.bounces)}`);
  assert.equal(result.bounces.player, 0);
});

test('an opponent return comes back to the player half', () => {
  const hit = strike(
    { x: -0.1, y: 1.0, z: 1.05, vx: 0, vy: 0.1, vz: 2.2, spin: 0, topspin: 0.2 },
    { kind: 'backhand', intensity: 0.6, angle: 0.1, aimError: 0, height: 0.4, side: 'opponent' },
  );
  assert.ok(hit.vz < 0);
  const result = flight(hit, 'player');
  assert.equal(result.net, false);
  assert.equal(result.bounces.player, 1);
});

test('the player can strike after a bounce on their side', () => {
  const ball: Ball = { x: 0.1, y: 0.95, z: -1.05, vx: 0, vy: 0.4, vz: -2.5, spin: 0, topspin: 0.2 };
  assert.equal(canStrike(ball, 0.05, 'player', true, { player: 1, opponent: 0 }), true);
  assert.equal(canStrike(ball, 0.05, 'player', true, { player: 0, opponent: 0 }), false);
});

test('sidespin curves the ball', () => {
  let ball: Ball = { x: 0, y: 1.1, z: -1, vx: 0, vy: 0.2, vz: 4, spin: 2.5, topspin: 0 };
  for (let i = 0; i < 30; i += 1) ball = stepTableTennis(ball, 1 / 120).ball;
  assert.ok(ball.x > 0.015);
});

test('rally rules award the double bounce, the net, and a let', () => {
  const rally = emptyFacts('rally', 'player');
  const first = onBounce(rally, 'opponent');
  assert.equal(first.ruling.result, 'play');
  const second = onBounce(first.facts, 'opponent');
  assert.equal(second.ruling.winner, 'player');
  assert.equal(ruleNet(rally).winner, 'opponent');
  const serve = emptyFacts('serve', 'player');
  serve.letClip = true;
  const own = onBounce(serve, 'player');
  const clipped = onBounce(own.facts, 'opponent');
  assert.equal(clipped.ruling.result, 'let');
  assert.equal(ruleDead(emptyFacts('rally', 'player')).winner, 'opponent');
});

test('the match is first to 11, win by 2, with alternating serves', () => {
  assert.equal(winnerOf(11, 9), 'player');
  assert.equal(winnerOf(10, 10), null);
  assert.equal(winnerOf(12, 10), 'player');
  assert.equal(winnerOf(9, 11), 'opponent');
  assert.equal(serverFor(0, 0), 'player');
  assert.equal(serverFor(2, 0), 'opponent');
  assert.equal(serverFor(10, 10), 'player');
  assert.equal(serverFor(11, 10), 'opponent');
});
