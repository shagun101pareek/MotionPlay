import type { Axis3, OrientationSample } from '@motionplay/shared';

export interface RawSensorSample {
  timestamp: number;
  orientation: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  acceleration: { x: number | null; y: number | null; z: number | null } | null;
  accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null } | null;
}

export function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readEuler(source: {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
} | null): OrientationSample | null {
  if (!source) return null;
  const alpha = finiteOrNull(source.alpha);
  const beta = finiteOrNull(source.beta);
  const gamma = finiteOrNull(source.gamma);
  if (alpha === null || beta === null || gamma === null) return null;
  return { alpha, beta, gamma };
}

export function readAxis(source: { x: number | null; y: number | null; z: number | null } | null): Axis3 | null {
  if (!source) return null;
  const x = finiteOrNull(source.x);
  const y = finiteOrNull(source.y);
  const z = finiteOrNull(source.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}
