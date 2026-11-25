import type { OrientationSample } from '@motionplay/shared';
import { readEuler } from '../types/sensorData.js';

export function readRotationRate(sample: {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
} | null): OrientationSample | null {
  return readEuler(sample);
}
