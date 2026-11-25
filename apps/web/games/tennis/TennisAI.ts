import type { Difficulty } from '@motionplay/shared';
import { clamp } from '@motionplay/shared';
import { aiTuning } from '../engine/difficulty';
import { TENNIS, type Ball } from './TennisPhysics';

export function planTennis(ball: Ball, difficulty: Difficulty): { x: number; z: number; attack: 'clear' | 'smash' | 'flick' } {
  const tuning = aiTuning(difficulty);
  const x = clamp(ball.x + (Math.random() - 0.5) * tuning.error * 2, -TENNIS.halfWidth + 0.4, TENNIS.halfWidth - 0.4);
  const z = clamp(Math.max(TENNIS.netZ + 2, Math.min(ball.z, TENNIS.length - 1.2)), TENNIS.netZ + 1.5, TENNIS.length - 1);
  const attack = ball.y > 2.2 && Math.random() < tuning.smashChance ? 'smash' : Math.random() < 0.18 ? 'flick' : 'clear';
  return { x, z, attack };
}
