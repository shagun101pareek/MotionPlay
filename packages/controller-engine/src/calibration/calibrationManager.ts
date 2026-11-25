import type { OrientationSample } from '@motionplay/shared';
import { DEFAULT_THRESHOLDS, thresholdsFromPeak, type GestureThresholds } from '../gestures/gestureTypes.js';

export type CalibrationPhase = 'uncalibrated' | 'neutral' | 'swing' | 'ready';

export interface CalibrationProfile {
  neutral: OrientationSample;
  thresholds: GestureThresholds;
  swingPeakDegPerSec: number;
  swingCaptured: boolean;
  updatedAt: number;
}

export interface CalibrationResult {
  ok: boolean;
  reason?: string;
  profile: CalibrationProfile;
}

const IDENTITY: OrientationSample = { alpha: 0, beta: 0, gamma: 0 };

export function defaultProfile(now = 0): CalibrationProfile {
  return {
    neutral: { ...IDENTITY },
    thresholds: { ...DEFAULT_THRESHOLDS },
    swingPeakDegPerSec: 0,
    swingCaptured: false,
    updatedAt: now,
  };
}

export class CalibrationManager {
  private profile: CalibrationProfile = defaultProfile();
  private phase: CalibrationPhase = 'uncalibrated';
  private swingPeak = 0;
  private capturingSwing = false;
  private swingStartedAt = 0;

  getPhase(): CalibrationPhase {
    return this.phase;
  }

  getProfile(): CalibrationProfile {
    return {
      ...this.profile,
      neutral: { ...this.profile.neutral },
      thresholds: { ...this.profile.thresholds },
    };
  }

  begin(): void {
    this.phase = 'neutral';
    this.capturingSwing = false;
    this.swingPeak = 0;
  }

  captureNeutral(orientation: OrientationSample | null, now: number): CalibrationResult {
    if (!orientation) {
      return { ok: false, reason: 'No orientation sample yet. Hold the phone still and try again.', profile: this.getProfile() };
    }
    this.profile = {
      ...this.profile,
      neutral: { ...orientation },
      updatedAt: now,
    };
    this.phase = 'swing';
    return { ok: true, profile: this.getProfile() };
  }

  beginSwingCapture(now: number): void {
    this.capturingSwing = true;
    this.swingPeak = 0;
    this.swingStartedAt = now;
    this.phase = 'swing';
  }

  observeSwing(magnitude: number, now: number): void {
    if (!this.capturingSwing) return;
    if (now - this.swingStartedAt > 2_500) return;
    if (magnitude > this.swingPeak) this.swingPeak = magnitude;
  }

  finishSwingCapture(now: number): CalibrationResult {
    this.capturingSwing = false;
    if (this.swingPeak < 90) {
      return {
        ok: false,
        reason: 'That motion was too small to measure. Swing once more, or continue with the default thresholds.',
        profile: this.getProfile(),
      };
    }
    this.profile = {
      ...this.profile,
      thresholds: thresholdsFromPeak(this.swingPeak),
      swingPeakDegPerSec: this.swingPeak,
      swingCaptured: true,
      updatedAt: now,
    };
    this.phase = 'ready';
    return { ok: true, profile: this.getProfile() };
  }

  completeWithDefaults(now: number): CalibrationResult {
    this.capturingSwing = false;
    this.profile = {
      ...this.profile,
      thresholds: this.profile.swingCaptured ? this.profile.thresholds : { ...DEFAULT_THRESHOLDS },
      updatedAt: now,
    };
    this.phase = 'ready';
    return { ok: true, profile: this.getProfile() };
  }

  recenter(orientation: OrientationSample | null, now: number): CalibrationResult {
    if (!orientation) {
      return { ok: false, reason: 'Turn motion on and hold the phone still, then set the center.', profile: this.getProfile() };
    }
    this.profile = { ...this.profile, neutral: { ...orientation }, updatedAt: now };
    if (this.phase === 'uncalibrated' || this.phase === 'neutral') this.phase = 'ready';
    return { ok: true, profile: this.getProfile() };
  }

  isCapturingSwing(): boolean {
    return this.capturingSwing;
  }
}
