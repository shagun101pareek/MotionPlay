import { clamp } from '@motionplay/shared';
import type { GestureType } from '@motionplay/shared';

export interface GestureThresholds {
  swingDegPerSec: number;
  smashDegPerSec: number;
  flickDegPerSec: number;
  minDurationMs: number;
  cooldownMs: number;
  minConfidence: number;
  movementAccel: number;
}

export const DEFAULT_THRESHOLDS: GestureThresholds = {
  swingDegPerSec: 220,
  smashDegPerSec: 340,
  flickDegPerSec: 260,
  minDurationMs: 48,
  cooldownMs: 300,
  minConfidence: 0.55,
  movementAccel: 8,
};

export function thresholdsFromPeak(peakDegPerSec: number): GestureThresholds {
  const swing = clamp(peakDegPerSec * 0.62, 150, 480);
  return {
    swingDegPerSec: swing,
    smashDegPerSec: clamp(peakDegPerSec * 0.9, swing + 40, 760),
    flickDegPerSec: clamp(peakDegPerSec * 0.72, 170, 560),
    minDurationMs: 48,
    cooldownMs: 300,
    minConfidence: 0.55,
    movementAccel: 8,
  };
}

export interface MotionFrame {
  t: number;
  /** Relative pitch, degrees. Negative means the phone is tipped back from the calibrated neutral. */
  beta: number;
  rotation: { alpha: number; beta: number; gamma: number };
  linear: { x: number; y: number; z: number };
  /** Unit vector that points "up" for this grip. Defaults to device +Y. */
  up: { x: number; y: number; z: number };
}

const SWING_GESTURES = new Set<GestureType>([
  'FOREHAND_SWING',
  'BACKHAND_SWING',
  'OVERHEAD_SMASH',
  'QUICK_FLICK',
]);

export function isSwingGesture(type: GestureType): boolean {
  return SWING_GESTURES.has(type);
}
