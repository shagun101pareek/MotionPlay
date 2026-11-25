import type { Axis3 } from '@motionplay/shared';
import { readAxis } from '../types/sensorData.js';

/**
 * Separates a slow gravity estimate from accelerationIncludingGravity.
 * The result is an approximation of linear acceleration, not a position.
 */
export class GravitySeparator {
  private gravity: Axis3 = { x: 0, y: 0, z: 0 };
  private primed = false;

  push(includingGravity: Axis3, blend = 0.08): { gravity: Axis3; linear: Axis3 } {
    if (!this.primed) {
      this.gravity = { ...includingGravity };
      this.primed = true;
      return {
        gravity: { ...this.gravity },
        linear: { x: 0, y: 0, z: 0 },
      };
    }
    this.gravity = {
      x: this.gravity.x + blend * (includingGravity.x - this.gravity.x),
      y: this.gravity.y + blend * (includingGravity.y - this.gravity.y),
      z: this.gravity.z + blend * (includingGravity.z - this.gravity.z),
    };
    return {
      gravity: { ...this.gravity },
      linear: {
        x: includingGravity.x - this.gravity.x,
        y: includingGravity.y - this.gravity.y,
        z: includingGravity.z - this.gravity.z,
      },
    };
  }

  reset(): void {
    this.primed = false;
    this.gravity = { x: 0, y: 0, z: 0 };
  }
}

export interface ResolvedAcceleration {
  linear: Axis3;
  gravity: Axis3 | null;
  available: boolean;
  /** True when linear acceleration was estimated by removing a gravity baseline. */
  estimated: boolean;
}

/**
 * Prefer the browser's linear acceleration when it exists.
 * accelerationIncludingGravity is never treated as linear acceleration.
 */
export function resolveAcceleration(
  linearSample: { x: number | null; y: number | null; z: number | null } | null,
  includingGravitySample: { x: number | null; y: number | null; z: number | null } | null,
  separator: GravitySeparator,
): ResolvedAcceleration {
  const linear = readAxis(linearSample);
  if (linear) {
    return { linear, gravity: null, available: true, estimated: false };
  }
  const includingGravity = readAxis(includingGravitySample);
  if (includingGravity) {
    const separated = separator.push(includingGravity);
    return {
      linear: separated.linear,
      gravity: separated.gravity,
      available: true,
      estimated: true,
    };
  }
  return {
    linear: { x: 0, y: 0, z: 0 },
    gravity: null,
    available: false,
    estimated: false,
  };
}
