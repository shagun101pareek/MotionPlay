import { clamp } from '@motionplay/shared';
import type { GestureSample } from '@motionplay/shared';
import { DEFAULT_THRESHOLDS, type GestureThresholds, type MotionFrame } from './gestureTypes.js';

interface Peaks {
  alpha: number;
  beta: number;
  gamma: number;
  minBeta: number;
}

const QUIET = 0.45;

/**
 * Classifies one physical motion into at most one gesture.
 * A swing is armed while angular speed stays high and is emitted once, on the way back down.
 * Further samples from that same swing are ignored until the phone is quiet and the cooldown ends.
 */
export class GestureRecognizer {
  private thresholds: GestureThresholds;
  private tracking = false;
  private trackStarted = 0;
  private peaks: Peaks = { alpha: 0, beta: 0, gamma: 0, minBeta: 0 };
  private cooldownUntil = 0;
  private released = true;
  private moveTracking = false;
  private moveStarted = 0;
  private movePeak = { x: 0, y: 0, z: 0, up: 0 };
  private moveCooldownUntil = 0;
  private moveReleased = true;

  constructor(thresholds: GestureThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  setThresholds(thresholds: GestureThresholds): void {
    this.thresholds = thresholds;
  }

  reset(): void {
    this.tracking = false;
    this.cooldownUntil = 0;
    this.released = true;
    this.moveTracking = false;
    this.moveCooldownUntil = 0;
    this.moveReleased = true;
  }

  push(frame: MotionFrame): GestureSample | null {
    const angular = Math.hypot(frame.rotation.alpha, frame.rotation.beta, frame.rotation.gamma);
    const swingLine = this.thresholds.swingDegPerSec;

    if (frame.t < this.cooldownUntil) {
      if (angular < swingLine * QUIET) this.released = true;
      return null;
    }
    if (!this.released) {
      if (angular < swingLine * QUIET) this.released = true;
      else return null;
    }

    if (angular >= swingLine) {
      this.observeSwing(frame);
      return null;
    }

    if (this.tracking) {
      const duration = frame.t - this.trackStarted;
      this.tracking = false;
      if (duration >= this.thresholds.minDurationMs) {
        const gesture = this.classifySwing(duration);
        if (gesture) {
          this.cooldownUntil = frame.t + this.thresholds.cooldownMs;
          this.released = false;
          return gesture;
        }
      }
    }

    return this.observeMovement(frame, angular, swingLine);
  }

  private observeSwing(frame: MotionFrame): void {
    if (!this.tracking) {
      this.tracking = true;
      this.trackStarted = frame.t;
      this.peaks = { alpha: 0, beta: 0, gamma: 0, minBeta: frame.beta };
    }
    this.peaks.minBeta = Math.min(this.peaks.minBeta, frame.beta);
    if (Math.abs(frame.rotation.alpha) > Math.abs(this.peaks.alpha)) this.peaks.alpha = frame.rotation.alpha;
    if (Math.abs(frame.rotation.beta) > Math.abs(this.peaks.beta)) this.peaks.beta = frame.rotation.beta;
    if (Math.abs(frame.rotation.gamma) > Math.abs(this.peaks.gamma)) this.peaks.gamma = frame.rotation.gamma;
  }

  private classifySwing(duration: number): GestureSample | null {
    const absA = Math.abs(this.peaks.alpha);
    const absB = Math.abs(this.peaks.beta);
    const absG = Math.abs(this.peaks.gamma);
    const peak = Math.max(absA, absB, absG);
    if (peak < this.thresholds.swingDegPerSec * 0.75) return null;
    const dominance = peak / (absA + absB + absG + 0.001);
    const margin = clamp((peak - this.thresholds.swingDegPerSec) / this.thresholds.swingDegPerSec, 0, 1.5) / 1.5;
    const confidence = clamp(0.35 + 0.4 * dominance + 0.25 * margin, 0, 1);
    if (confidence < this.thresholds.minConfidence) return null;

    let type: GestureSample['type'] | null = null;
    if (absB >= absG && absB >= absA && (this.peaks.minBeta < -12 || absB >= this.thresholds.smashDegPerSec)) {
      type = 'OVERHEAD_SMASH';
    } else if (absG >= absA && absG >= absB) {
      type = this.peaks.gamma >= 0 ? 'FOREHAND_SWING' : 'BACKHAND_SWING';
    } else if (absA >= absB && absA >= absG && duration <= 140 && absA >= this.thresholds.flickDegPerSec) {
      type = 'QUICK_FLICK';
    }
    if (!type) return null;

    return {
      type,
      intensity: clamp(peak / (this.thresholds.smashDegPerSec * 1.35), 0.15, 1),
      confidence,
      source: 'motion',
    };
  }

  private observeMovement(frame: MotionFrame, angular: number, swingLine: number): GestureSample | null {
    if (angular > swingLine * 0.7) return null;
    if (frame.t < this.moveCooldownUntil) {
      const mag = Math.hypot(frame.linear.x, frame.linear.y, frame.linear.z);
      if (mag < this.thresholds.movementAccel * 0.5) this.moveReleased = true;
      return null;
    }
    if (!this.moveReleased) {
      const mag = Math.hypot(frame.linear.x, frame.linear.y, frame.linear.z);
      if (mag < this.thresholds.movementAccel * 0.5) this.moveReleased = true;
      return null;
    }

    const { x, y, z } = frame.linear;
    const mag = Math.hypot(x, y, z);
    const vertical = x * frame.up.x + y * frame.up.y + z * frame.up.z;
    if (mag < this.thresholds.movementAccel) {
      if (this.moveTracking) {
        const duration = frame.t - this.moveStarted;
        this.moveTracking = false;
        if (duration >= 40) {
          const gesture = this.classifyMovement();
          if (gesture) {
            this.moveCooldownUntil = frame.t + 360;
            this.moveReleased = false;
            return gesture;
          }
        }
      }
      return null;
    }

    if (!this.moveTracking) {
      this.moveTracking = true;
      this.moveStarted = frame.t;
      this.movePeak = { x: 0, y: 0, z: 0, up: 0 };
    }
    if (Math.abs(x) > Math.abs(this.movePeak.x)) this.movePeak.x = x;
    if (Math.abs(y) > Math.abs(this.movePeak.y)) this.movePeak.y = y;
    if (Math.abs(z) > Math.abs(this.movePeak.z)) this.movePeak.z = z;
    if (Math.abs(vertical) > Math.abs(this.movePeak.up)) this.movePeak.up = vertical;
    return null;
  }

  private classifyMovement(): GestureSample | null {
    const absX = Math.abs(this.movePeak.x);
    const absZ = Math.abs(this.movePeak.z);
    const vertical = this.movePeak.up;
    const peak = Math.max(absX, absZ, Math.abs(vertical));
    if (peak < this.thresholds.movementAccel) return null;
    let type: GestureSample['type'];
    if (vertical > this.thresholds.movementAccel * 0.85 && vertical >= absX && vertical >= absZ) type = 'JUMP';
    else if (absX >= absZ) type = this.movePeak.x >= 0 ? 'RIGHT_MOVEMENT' : 'LEFT_MOVEMENT';
    else type = this.movePeak.z >= 0 ? 'BACKWARD_MOVEMENT' : 'FORWARD_MOVEMENT';
    return {
      type,
      intensity: clamp(peak / (this.thresholds.movementAccel * 2.2), 0.2, 1),
      confidence: 0.62,
      source: 'motion',
    };
  }
}
