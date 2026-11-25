import { MAX_SENSITIVITY, MIN_SENSITIVITY, applyDeadzone, clamp, clampUnit } from '@motionplay/shared';
import type { Axis3, OrientationSample } from '@motionplay/shared';
import { shortestAngleDelta } from '../sensors/orientation.js';

const HORIZONTAL_DEGREES = 26;
const VERTICAL_DEGREES = 32;
const TWIST_DEGREES = 42;
const MAX_RATE = 2000;
const MAX_ACCEL = 80;

export interface OrientedMotion {
  horizontalDeg: number;
  verticalDeg: number;
  twistDeg: number;
  rotation: OrientationSample;
  linear: Axis3;
}

/**
 * Portrait: gamma is left/right tilt, beta is forward/back, alpha is twist.
 * Landscape swaps the tilt axes so a sideways phone still steers left and right.
 * This is a calibrated orientation mapping, not absolute tracking.
 */
export function orientMotion(input: {
  orientation: OrientationSample;
  rotation: OrientationSample;
  linear: Axis3;
  neutral: OrientationSample;
  portrait: boolean;
}): OrientedMotion {
  const alpha = shortestAngleDelta(input.orientation.alpha, input.neutral.alpha);
  const beta = shortestAngleDelta(input.orientation.beta, input.neutral.beta);
  const gamma = shortestAngleDelta(input.orientation.gamma, input.neutral.gamma);
  if (input.portrait) {
    return {
      horizontalDeg: gamma,
      verticalDeg: beta,
      twistDeg: alpha,
      rotation: input.rotation,
      linear: input.linear,
    };
  }
  return {
    horizontalDeg: beta,
    verticalDeg: -gamma,
    twistDeg: alpha,
    rotation: {
      alpha: input.rotation.alpha,
      beta: -input.rotation.gamma,
      gamma: input.rotation.beta,
    },
    linear: {
      x: -input.linear.y,
      y: input.linear.x,
      z: input.linear.z,
    },
  };
}

function scaleDegrees(delta: number, sensitivity: number, fullScale: number, deadZone: number): number {
  const span = fullScale / clamp(sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY);
  return applyDeadzone(clampUnit(delta / span), deadZone);
}

export function normalizeMotion(input: {
  oriented: OrientedMotion;
  sensitivity: number;
  deadZone: number;
}): {
  orientation: OrientationSample;
  rotation: OrientationSample;
  acceleration: Axis3;
  horizontal: number;
  vertical: number;
  racketAngle: number;
} {
  const dead = input.deadZone;
  return {
    orientation: {
      alpha: clamp(input.oriented.twistDeg, -180, 180),
      beta: clamp(input.oriented.verticalDeg, -180, 180),
      gamma: clamp(input.oriented.horizontalDeg, -180, 180),
    },
    rotation: {
      alpha: clamp(input.oriented.rotation.alpha, -MAX_RATE, MAX_RATE),
      beta: clamp(input.oriented.rotation.beta, -MAX_RATE, MAX_RATE),
      gamma: clamp(input.oriented.rotation.gamma, -MAX_RATE, MAX_RATE),
    },
    acceleration: {
      x: clamp(input.oriented.linear.x, -MAX_ACCEL, MAX_ACCEL),
      y: clamp(input.oriented.linear.y, -MAX_ACCEL, MAX_ACCEL),
      z: clamp(input.oriented.linear.z, -MAX_ACCEL, MAX_ACCEL),
    },
    horizontal: scaleDegrees(input.oriented.horizontalDeg, input.sensitivity, HORIZONTAL_DEGREES, dead),
    vertical: scaleDegrees(input.oriented.verticalDeg, input.sensitivity, VERTICAL_DEGREES, dead),
    racketAngle: scaleDegrees(input.oriented.twistDeg, input.sensitivity, TWIST_DEGREES, dead),
  };
}
