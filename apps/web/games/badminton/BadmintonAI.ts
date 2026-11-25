import type { Difficulty } from '@motionplay/shared';
import { clamp } from '@motionplay/shared';
import { aiTuning } from '../engine/difficulty';
import { COURT, type ShotName, type Shuttle } from './BadmintonPhysics';

export interface OpponentPlan {
  aimX: number;
  attack: ShotName;
}

export function planOpponent(shuttle: Shuttle, difficulty: Difficulty, plan: OpponentPlan): { x: number; z: number; plan: OpponentPlan } {
  const tuning = aiTuning(difficulty);
  const next = { ...plan };
  if (shuttle.z > COURT.netZ && shuttle.vz > 0) {
    next.aimX = clamp(shuttle.x + (Math.random() - 0.5) * tuning.error * 1.8, -COURT.halfWidth + 0.35, COURT.halfWidth - 0.35);
    if (shuttle.y > 2.1 && Math.random() < tuning.smashChance) next.attack = 'smash';
    else if (Math.random() < 0.2) next.attack = 'flick';
    else next.attack = 'clear';
  }
  const x = next.aimX;
  const z = clamp(Math.max(COURT.netZ + 1.35, Math.min(shuttle.z - 0.2, COURT.length - 1.1)), COURT.netZ + 1.1, COURT.length - 0.7);
  return { x, z, plan: next };
}
