import {
  MAX_SENSITIVITY,
  MIN_SENSITIVITY,
  clamp,
  clampUnit,
  emptyControllerState,
  smoothValue,
} from '@motionplay/shared';
import type { Axis3, ControllerState, GestureSample, GestureType, OrientationSample } from '@motionplay/shared';
import { CalibrationManager, type CalibrationResult } from './calibration/calibrationManager.js';
import type { CalibrationPhase } from './calibration/calibrationManager.js';
import { GestureRecognizer } from './gestures/gestureRecognizer.js';
import type { MotionFrame } from './gestures/gestureTypes.js';
import { PointerTracker, type PointerGesture, type SwipeDirection } from './input/pointerTracker.js';
import { LowPass } from './processing/sensorFilter.js';
import { normalizeMotion, orientMotion } from './processing/motionNormalizer.js';
import { GravitySeparator, resolveAcceleration } from './sensors/accelerometer.js';
import { createBrowserSensorSource, type SensorSource } from './sensors/browserSensors.js';
import type { SensorCapabilities } from './sensors/sensorCapabilities.js';
import type { ControllerEngineEvent, PermissionStatus, Scheduler } from './types/inputEvents.js';
import type { RawSensorSample } from './types/sensorData.js';

const ZERO_EULER: OrientationSample = { alpha: 0, beta: 0, gamma: 0 };
const ZERO_AXIS: Axis3 = { x: 0, y: 0, z: 0 };
const UP: Axis3 = { x: 0, y: 1, z: 0 };

const SWIPE_GESTURE: Record<SwipeDirection, GestureType> = {
  left: 'LEFT_MOVEMENT',
  right: 'RIGHT_MOVEMENT',
  forward: 'FORWARD_MOVEMENT',
  backward: 'BACKWARD_MOVEMENT',
};

export interface MotionControllerOptions {
  source?: SensorSource;
  clock?: () => number;
  scheduler?: Scheduler;
}

function timeoutScheduler(): Scheduler {
  const handles = new Set<ReturnType<typeof setTimeout>>();
  return {
    delay(ms, fn) {
      const handle = setTimeout(() => {
        handles.delete(handle);
        fn();
      }, ms);
      handles.add(handle);
    },
    clear() {
      for (const handle of handles) clearTimeout(handle);
      handles.clear();
    },
  };
}

function normalizeUp(gravity: Axis3 | null): Axis3 | null {
  if (!gravity) return null;
  const magnitude = Math.hypot(gravity.x, gravity.y, gravity.z);
  if (magnitude < 5 || magnitude > 15) return null;
  return { x: -gravity.x / magnitude, y: -gravity.y / magnitude, z: -gravity.z / magnitude };
}

/**
 * Turns phone sensors and touch into a game-agnostic controller stream.
 * Games should consume ControllerState and gesture events, never these sensor APIs.
 */
export class MotionController {
  private readonly source: SensorSource;
  private readonly clock: () => number;
  private readonly scheduler: Scheduler;
  private readonly calibration = new CalibrationManager();
  private readonly gestures = new GestureRecognizer();
  private readonly pointers = new PointerTracker();
  private readonly gravity = new GravitySeparator();
  private readonly filterA = new LowPass(0.35);
  private readonly filterB = new LowPass(0.35);
  private readonly filterG = new LowPass(0.35);
  private readonly rateA = new LowPass(0.55);
  private readonly rateB = new LowPass(0.55);
  private readonly rateG = new LowPass(0.55);
  private readonly listeners = new Set<(event: ControllerEngineEvent) => void>();

  private running = false;
  private permission: PermissionStatus = 'unknown';
  private capabilities: SensorCapabilities;
  private sensitivity = 1;
  private deadZone = 0.04;
  private portrait = true;
  private sequence = 0;
  private state: ControllerState = emptyControllerState();
  private rawOrientation: OrientationSample | null = null;
  private filteredOrientation: OrientationSample | null = null;
  private rotation: OrientationSample = { ...ZERO_EULER };
  private linear: Axis3 = { ...ZERO_AXIS };
  private up: Axis3 = { ...UP };
  private rotationAvailable = false;
  private accelerationAvailable = false;
  private smoothedH = 0;
  private smoothedV = 0;
  private smoothedAngle = 0;
  private stick: { x: number | null; y: number | null } = { x: null, y: null };
  private motionSamples = 0;
  private sawRotation = false;
  private sawLinear = false;
  private sawGravity = false;
  private touchCooldownUntil = 0;

  constructor(options: MotionControllerOptions = {}) {
    this.source = options.source ?? createBrowserSensorSource();
    this.clock = options.clock ?? Date.now;
    this.scheduler = options.scheduler ?? timeoutScheduler();
    this.capabilities = this.source.probe();
  }

  initialize(): SensorCapabilities {
    this.capabilities = this.source.probe();
    this.emit({ type: 'capabilities', capabilities: this.capabilities });
    return this.getCapabilities();
  }

  async requestPermissions(): Promise<PermissionStatus> {
    const status = await this.source.requestPermissions();
    this.permission = status;
    this.emit({ type: 'permission', status });
    if (status === 'denied') {
      this.emit({ type: 'error', message: 'Motion access was denied. Use the touch controls on this screen.' });
    } else if (status === 'unsupported') {
      this.emit({ type: 'error', message: 'This browser has no motion sensors. Use the touch controls.' });
    } else if (status === 'insecure') {
      this.emit({ type: 'error', message: 'Motion sensors need a secure page. Use the touch controls on this connection.' });
    }
    return status;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.source.start((sample) => this.pushSample(sample));
  }

  stop(): void {
    this.running = false;
    this.source.stop();
    this.scheduler.clear();
    this.pointers.cancel();
  }

  calibrate(): CalibrationResult {
    const result = this.calibration.recenter(this.rawOrientation, this.clock());
    this.afterCalibration(result);
    return result;
  }

  beginCalibration(): void {
    this.calibration.begin();
    this.emitCalibration();
  }

  captureNeutral(): CalibrationResult {
    const result = this.calibration.captureNeutral(this.rawOrientation, this.clock());
    this.afterCalibration(result);
    return result;
  }

  beginSwingCapture(): void {
    this.calibration.beginSwingCapture(this.clock());
    this.emitCalibration();
  }

  finishSwingCapture(): CalibrationResult {
    const result = this.calibration.finishSwingCapture(this.clock());
    this.afterCalibration(result);
    return result;
  }

  completeWithDefaults(): CalibrationResult {
    const result = this.calibration.completeWithDefaults(this.clock());
    this.afterCalibration(result);
    return result;
  }

  getCapabilities(): SensorCapabilities {
    return { ...this.capabilities };
  }

  getCalibration() {
    return { phase: this.calibration.getPhase(), profile: this.calibration.getProfile() };
  }

  getPermission(): PermissionStatus {
    return this.permission;
  }

  subscribe(listener: (event: ControllerEngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSensitivity(value: number): void {
    this.sensitivity = clamp(value, MIN_SENSITIVITY, MAX_SENSITIVITY);
    this.republish(this.clock());
  }

  setDeadZone(value: number): void {
    this.deadZone = clamp(value, 0, 0.3);
    this.republish(this.clock());
  }

  setPortrait(portrait: boolean): void {
    if (this.portrait === portrait) return;
    this.portrait = portrait;
    this.republish(this.clock());
  }

  getState(): ControllerState {
    return this.state;
  }

  setPointerMovement(horizontal: number | null, vertical: number | null): void {
    this.stick = {
      x: horizontal === null ? null : clampUnit(horizontal),
      y: vertical === null ? null : clampUnit(vertical),
    };
    this.republish(this.clock());
  }

  setButton(button: 'action' | 'special', pressed: boolean): void {
    if (this.state.buttons[button] === pressed) return;
    const timestamp = this.clock();
    const sequence = this.nextSequence();
    this.state = {
      ...this.state,
      buttons: { ...this.state.buttons, [button]: pressed },
      sequence,
      timestamp,
    };
    this.emit({ type: 'button', button, pressed, sequence, timestamp });
    this.emit({ type: 'state', state: this.state });
  }

  triggerGesture(type: GestureType, intensity = 0.7, confidence = 1): GestureSample | null {
    const timestamp = this.clock();
    if (timestamp < this.touchCooldownUntil) return null;
    this.touchCooldownUntil = timestamp + 180;
    const gesture: GestureSample = {
      type,
      intensity: clamp(intensity, 0, 1),
      confidence: clamp(confidence, 0, 1),
      source: 'touch',
    };
    this.emit({ type: 'gesture', gesture, sequence: this.nextSequence(), timestamp });
    return gesture;
  }

  pointerDown(x: number, y: number): void {
    this.pointers.down(x, y, this.clock());
  }

  pointerMove(x: number, y: number): void {
    this.pointers.move(x, y);
  }

  pointerUp(x: number, y: number): PointerGesture | null {
    const gesture = this.pointers.up(x, y, this.clock());
    if (!gesture) return null;
    if (gesture.kind === 'tap') this.pulse('action');
    else if (gesture.kind === 'doubletap' || gesture.kind === 'longpress') this.pulse('special');
    else if (gesture.kind === 'swipe' && gesture.direction) this.applySwipe(gesture.direction);
    return gesture;
  }

  pointerCancel(): void {
    this.pointers.cancel();
  }

  /** Feeds one sensor sample. Browser listeners call this; tests call it directly. */
  pushSample(sample: RawSensorSample): ControllerEngineEvent[] {
    const emitted: ControllerEngineEvent[] = [];
    const listen = (event: ControllerEngineEvent) => emitted.push(event);
    this.listeners.add(listen);
    this.ingest(sample);
    this.listeners.delete(listen);
    return emitted;
  }

  private ingest(sample: RawSensorSample): void {
    this.noteCapabilities(sample);
    if (sample.orientation) {
      const alpha = sample.orientation.alpha;
      const beta = sample.orientation.beta;
      const gamma = sample.orientation.gamma;
      if (alpha !== null && beta !== null && gamma !== null && [alpha, beta, gamma].every(Number.isFinite)) {
        this.rawOrientation = { alpha, beta, gamma };
        this.filteredOrientation = {
          alpha: this.filterA.push(alpha),
          beta: this.filterB.push(beta),
          gamma: this.filterG.push(gamma),
        };
      }
    }

    const rotationSample = sample.rotationRate;
    if (
      rotationSample &&
      rotationSample.alpha !== null &&
      rotationSample.beta !== null &&
      rotationSample.gamma !== null &&
      [rotationSample.alpha, rotationSample.beta, rotationSample.gamma].every(Number.isFinite)
    ) {
      this.rotation = {
        alpha: this.rateA.push(rotationSample.alpha),
        beta: this.rateB.push(rotationSample.beta),
        gamma: this.rateG.push(rotationSample.gamma),
      };
      this.rotationAvailable = true;
    }

    const resolved = resolveAcceleration(sample.acceleration, sample.accelerationIncludingGravity, this.gravity);
    this.linear = resolved.linear;
    this.accelerationAvailable = resolved.available;
    const up = normalizeUp(resolved.gravity);
    if (up) this.up = up;

    if (this.calibration.isCapturingSwing()) {
      this.calibration.observeSwing(Math.hypot(this.rotation.alpha, this.rotation.beta, this.rotation.gamma), sample.timestamp);
    }

    this.publish(sample.timestamp, true);
  }

  private republish(timestamp: number): void {
    this.publish(timestamp, false);
  }

  private publish(timestamp: number, fromSensor: boolean): void {
    const orientation = this.filteredOrientation ?? this.calibration.getProfile().neutral;
    const oriented = orientMotion({
      orientation,
      rotation: this.rotationAvailable ? this.rotation : ZERO_EULER,
      linear: this.accelerationAvailable ? this.linear : ZERO_AXIS,
      neutral: this.calibration.getProfile().neutral,
      portrait: this.portrait,
    });
    const normalized = normalizeMotion({
      oriented,
      sensitivity: this.sensitivity,
      deadZone: this.deadZone,
    });
    this.smoothedH = smoothValue(this.smoothedH, normalized.horizontal, 0.5);
    this.smoothedV = smoothValue(this.smoothedV, normalized.vertical, 0.5);
    this.smoothedAngle = smoothValue(this.smoothedAngle, normalized.racketAngle, 0.45);

    const sequence = this.nextSequence();
    this.state = {
      orientation: normalized.orientation,
      rotation: normalized.rotation,
      acceleration: normalized.acceleration,
      movement: {
        horizontal: this.stick.x ?? this.smoothedH,
        vertical: this.stick.y ?? this.smoothedV,
      },
      racketAngle: this.smoothedAngle,
      buttons: this.state.buttons,
      sensors: {
        orientation: this.filteredOrientation !== null,
        rotation: this.rotationAvailable && this.capabilities.rotationRate === true,
        acceleration: this.accelerationAvailable,
      },
      sequence,
      timestamp,
    };
    this.emit({ type: 'state', state: this.state });

    if (!fromSensor || !this.rotationAvailable) return;
    const frame: MotionFrame = {
      t: timestamp,
      beta: oriented.verticalDeg,
      rotation: normalized.rotation,
      linear: normalized.acceleration,
      up: this.portrait ? this.up : { x: -this.up.y, y: this.up.x, z: this.up.z },
    };
    const gesture = this.gestures.push(frame);
    if (!gesture) return;
    this.emit({ type: 'gesture', gesture, sequence: this.nextSequence(), timestamp });
  }

  private noteCapabilities(sample: RawSensorSample): void {
    let changed = false;
    const next = { ...this.capabilities };
    if (sample.acceleration || sample.accelerationIncludingGravity || sample.rotationRate) {
      this.motionSamples += 1;
    }
    if (sample.rotationRate && [sample.rotationRate.alpha, sample.rotationRate.beta, sample.rotationRate.gamma].some((value) => typeof value === 'number' && Number.isFinite(value))) {
      this.sawRotation = true;
      if (next.rotationRate !== true) {
        next.rotationRate = true;
        changed = true;
      }
    } else if (!this.sawRotation && this.motionSamples >= 12 && next.rotationRate !== false) {
      next.rotationRate = false;
      changed = true;
    }
    if (sample.acceleration && [sample.acceleration.x, sample.acceleration.y, sample.acceleration.z].some((value) => typeof value === 'number')) {
      this.sawLinear = true;
      if (next.linearAcceleration !== true) {
        next.linearAcceleration = true;
        changed = true;
      }
    } else if (!this.sawLinear && this.motionSamples >= 12 && next.linearAcceleration !== false) {
      next.linearAcceleration = false;
      changed = true;
    }
    if (
      sample.accelerationIncludingGravity &&
      [sample.accelerationIncludingGravity.x, sample.accelerationIncludingGravity.y, sample.accelerationIncludingGravity.z].some((value) => typeof value === 'number')
    ) {
      this.sawGravity = true;
      if (next.accelerationIncludingGravity !== true) {
        next.accelerationIncludingGravity = true;
        changed = true;
      }
    } else if (!this.sawGravity && this.motionSamples >= 12 && next.accelerationIncludingGravity !== false) {
      next.accelerationIncludingGravity = false;
      changed = true;
    }
    if (!changed) return;
    this.capabilities = next;
    this.emit({ type: 'capabilities', capabilities: this.getCapabilities() });
  }

  private applySwipe(direction: SwipeDirection): void {
    this.triggerGesture(SWIPE_GESTURE[direction], 0.7, 0.8);
    const impulse =
      direction === 'left'
        ? { x: -0.85, y: 0 }
        : direction === 'right'
          ? { x: 0.85, y: 0 }
          : direction === 'forward'
            ? { x: 0, y: 0.85 }
            : { x: 0, y: -0.85 };
    this.stick = impulse;
    this.republish(this.clock());
    this.scheduler.delay(160, () => {
      if (this.stick.x === impulse.x && this.stick.y === impulse.y) {
        this.stick = { x: null, y: null };
        this.republish(this.clock());
      }
    });
  }

  private pulse(button: 'action' | 'special'): void {
    this.setButton(button, true);
    this.scheduler.delay(120, () => this.setButton(button, false));
  }

  private afterCalibration(result: CalibrationResult): void {
    this.gestures.setThresholds(result.profile.thresholds);
    this.smoothedH = 0;
    this.smoothedV = 0;
    this.smoothedAngle = 0;
    this.emitCalibration();
    if (!result.ok && result.reason) this.emit({ type: 'error', message: result.reason });
  }

  private emitCalibration(): void {
    this.emit({
      type: 'calibration',
      phase: this.calibration.getPhase(),
      profile: this.calibration.getProfile(),
    });
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private emit(event: ControllerEngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export type { CalibrationPhase };
