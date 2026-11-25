import type { ControllerState, GestureSample } from '@motionplay/shared';

export type ShotKind = 'forehand' | 'backhand' | 'smash' | 'flick';

export interface RacketCommand {
  moveX: number;
  moveY: number;
  racketAngle: number;
  shot: ShotKind | null;
  intensity: number;
  confidence: number;
  defend: boolean;
  hop: boolean;
}

const SHOTS: Partial<Record<GestureSample['type'], ShotKind>> = {
  FOREHAND_SWING: 'forehand',
  BACKHAND_SWING: 'backhand',
  OVERHEAD_SMASH: 'smash',
  QUICK_FLICK: 'flick',
};

export function commandFromState(state: ControllerState, gesture: GestureSample | null, depth: boolean): RacketCommand {
  return {
    moveX: state.movement.horizontal,
    moveY: depth ? state.movement.vertical : 0,
    racketAngle: state.racketAngle,
    shot: gesture ? (SHOTS[gesture.type] ?? null) : null,
    intensity: gesture?.intensity ?? 0,
    confidence: gesture?.confidence ?? 0,
    defend: state.buttons.special || gesture?.type === 'SPECIAL_ACTION',
    hop: gesture?.type === 'JUMP',
  };
}
