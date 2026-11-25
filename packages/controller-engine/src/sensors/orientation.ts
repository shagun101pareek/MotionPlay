import type { OrientationSample } from '@motionplay/shared';
import { readEuler } from '../types/sensorData.js';

/** Shortest signed difference, in degrees, so a heading wrap does not look like a full turn. */
export function shortestAngleDelta(current: number, baseline: number): number {
  let delta = current - baseline;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

export function readOrientation(sample: {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
} | null): OrientationSample | null {
  return readEuler(sample);
}
