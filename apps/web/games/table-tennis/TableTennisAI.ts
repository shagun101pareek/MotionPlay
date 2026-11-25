import type { Difficulty } from '@motionplay/shared';
import { clamp } from '@motionplay/shared';
import {
  STRIKE_REACH,
  TABLE,
  canStrike,
  predictLandingX,
  type Ball,
  type Flight,
  type ShotInput,
  type Side,
  type TableShot,
} from './TableTennisPhysics';

export type OpponentAnim =
  | 'idle'
  | 'ready'
  | 'move'
  | 'forehand-prep'
  | 'backhand-prep'
  | 'forehand'
  | 'backhand'
  | 'recover'
  | 'win'
  | 'lose';

export interface OpponentState {
  x: number;
  targetX: number;
  reaction: number;
  replan: number;
  cooldown: number;
  swing: number;
  swinging: boolean;
  live: boolean;
  mistake: boolean;
  hand: 'forehand' | 'backhand';
  anim: OpponentAnim;
}

export interface AiContext {
  ball: Ball;
  hitter: Side;
  bounces: Record<Side, number>;
  flight: Flight | 'idle';
  difficulty: Difficulty;
}

interface Tuning {
  speed: number;
  reaction: number;
  error: number;
  miss: number;
  smash: number;
}

export function createOpponent(): OpponentState {
  return {
    x: 0,
    targetX: 0,
    reaction: 0,
    replan: 0,
    cooldown: 0,
    swing: 0,
    swinging: false,
    live: false,
    mistake: false,
    hand: 'forehand',
    anim: 'ready',
  };
}

export function tuningFor(difficulty: Difficulty): Tuning {
  if (difficulty === 'easy') return { speed: 1.55, reaction: 0.18, error: 0.28, miss: 0.12, smash: 0.04 };
  if (difficulty === 'hard') return { speed: 3.1, reaction: 0.04, error: 0.06, miss: 0.02, smash: 0.22 };
  return { speed: 2.2, reaction: 0.09, error: 0.14, miss: 0.05, smash: 0.1 };
}

export function trackOpponent(state: OpponentState, ctx: AiContext, dt: number, random: () => number = Math.random): void {
  const tuning = tuningFor(ctx.difficulty);
  state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.swinging) {
    state.swing = Math.min(1, state.swing + dt / 0.14);
    state.anim = state.hand;
    if (state.swing >= 1) state.swinging = false;
    return;
  }
  if (state.swing > 0) {
    state.swing = Math.max(0, state.swing - dt / 0.24);
    state.anim = 'recover';
    state.x = approach(state.x, state.targetX, tuning.speed, dt);
    return;
  }

  const incoming = ctx.flight !== 'idle' && ctx.hitter === 'player' && (ctx.ball.vz > 0.1 || ctx.ball.z > 0);
  if (!incoming) {
    state.live = false;
    state.targetX = approach(state.targetX, 0, 1.1, dt);
    state.x = approach(state.x, state.targetX, tuning.speed * 0.8, dt);
    state.anim = Math.abs(state.x - state.targetX) > 0.08 ? 'move' : 'ready';
    return;
  }

  if (!state.live) {
    state.live = true;
    state.reaction = tuning.reaction;
    state.replan = 0;
    state.mistake = random() < tuning.miss;
  }
  if (state.reaction > 0) {
    state.reaction -= dt;
    state.anim = 'ready';
    return;
  }

  state.replan -= dt;
  if (state.replan <= 0) {
    const predicted = predictLandingX(ctx.ball, 'opponent');
    const urgency = clamp((ctx.ball.z + TABLE.halfLength) / TABLE.length, 0, 1);
    const error = (random() - 0.5) * 2 * tuning.error * (1 - urgency * 0.75);
    state.targetX = clamp(predicted + error, -TABLE.halfWidth + 0.04, TABLE.halfWidth - 0.04);
    state.replan = 0.1;
  }
  state.hand = ctx.ball.x < state.x ? 'forehand' : 'backhand';
  state.x = approach(state.x, state.targetX, tuning.speed, dt);
  const moving = Math.abs(state.targetX - state.x) > 0.06;
  state.anim = moving ? 'move' : state.hand === 'backhand' ? 'backhand-prep' : 'forehand-prep';
}

export function opponentStrike(state: OpponentState, ctx: AiContext, random: () => number = Math.random): ShotInput | null {
  if (state.cooldown > 0 || state.swinging || !state.live || state.reaction > 0) return null;
  if (ctx.hitter !== 'player' || ctx.bounces.opponent < 1) return null;
  if (!canStrike(ctx.ball, state.x, 'opponent', true, ctx.bounces)) return null;

  // Mistakes still swing, but send a weak or wide ball instead of skipping contact entirely.
  const missContact = state.mistake && random() < 0.35;
  state.cooldown = 0.28;
  state.swinging = true;
  state.swing = 0;
  state.hand = ctx.ball.x < state.x ? 'forehand' : 'backhand';
  state.anim = state.hand;
  if (missContact) return null;

  const tuning = tuningFor(ctx.difficulty);
  const kind: TableShot =
    !state.mistake && ctx.ball.y > TABLE.surfaceY + 0.45 && random() < tuning.smash
      ? 'smash'
      : state.hand === 'backhand'
        ? 'backhand'
        : 'forehand';
  const aimError = state.mistake
    ? (random() > 0.5 ? 1 : -1) * (0.55 + random() * 0.35)
    : clamp((ctx.ball.x - state.x) / STRIKE_REACH, -1, 1) * 0.22;
  return {
    kind,
    intensity: kind === 'smash' ? 0.78 : 0.52 + random() * 0.28,
    angle: (random() - 0.5) * (state.mistake ? 0.9 : 0.35),
    aimError,
    height: 0.35 + random() * 0.3,
    side: 'opponent',
  };
}

function approach(current: number, target: number, speed: number, dt: number): number {
  const delta = target - current;
  const step = speed * dt;
  if (Math.abs(delta) <= step) return target;
  return current + Math.sign(delta) * step;
}
