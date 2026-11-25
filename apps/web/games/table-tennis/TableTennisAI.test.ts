import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpponent, trackOpponent, tuningFor } from './TableTennisAI';
import type { Ball } from './TableTennisPhysics';

const incoming: Ball = { x: 0.55, y: 1, z: 0.2, vx: 0, vy: 0.2, vz: 3, spin: 0, topspin: 0.4 };

test('the opponent moves toward the ball without teleporting', () => {
  const state = createOpponent();
  state.live = true;
  state.reaction = 0;
  const speed = tuningFor('easy').speed;
  const dt = 0.05;
  trackOpponent(
    state,
    { ball: incoming, hitter: 'player', bounces: { player: 0, opponent: 0 }, flight: 'rally', difficulty: 'easy' },
    dt,
    () => 0.5,
  );
  assert.ok(state.x > 0);
  assert.ok(state.x <= speed * dt + 0.0001);
});

test('advanced tracks faster than beginner and still respects the speed cap', () => {
  const beginner = createOpponent();
  const advanced = createOpponent();
  beginner.live = true;
  advanced.live = true;
  const ctx = { ball: incoming, hitter: 'player' as const, bounces: { player: 0, opponent: 0 }, flight: 'rally' as const };
  trackOpponent(beginner, { ...ctx, difficulty: 'easy' }, 0.2, () => 0.2);
  trackOpponent(advanced, { ...ctx, difficulty: 'hard' }, 0.2, () => 0.2);
  assert.ok(advanced.x > beginner.x);
  assert.ok(advanced.x <= tuningFor('hard').speed * 0.2 + 0.0001);
});
