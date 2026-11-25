import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MotionController } from './MotionController.js';
import { GravitySeparator, resolveAcceleration } from './sensors/accelerometer.js';
import { shortestAngleDelta } from './sensors/orientation.js';
import { LowPass } from './processing/sensorFilter.js';
import { normalizeMotion, orientMotion } from './processing/motionNormalizer.js';
import { GestureRecognizer } from './gestures/gestureRecognizer.js';
import type { MotionFrame } from './gestures/gestureTypes.js';
import { thresholdsFromPeak } from './gestures/gestureTypes.js';
import { CalibrationManager } from './calibration/calibrationManager.js';
import { PointerTracker } from './input/pointerTracker.js';
import { mapBadminton, mapTableTennis } from './index.js';
import { emptyControllerState } from '@motionplay/shared';
import type { GestureSample } from '@motionplay/shared';
import type { SensorCapabilities } from './sensors/sensorCapabilities.js';
import type { RawSensorSample } from './types/sensorData.js';
import type { Scheduler } from './types/inputEvents.js';

const ZERO = { alpha: 0, beta: 0, gamma: 0 };

function frame(partial: Partial<MotionFrame> & Pick<MotionFrame, 't'>): MotionFrame {
  return {
    beta: 0,
    rotation: { alpha: 0, beta: 0, gamma: 0 },
    linear: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    ...partial,
  };
}

function swing(recognizer: GestureRecognizer, rotation: MotionFrame['rotation'], beta: number, duration: number, start = 0): GestureSample | null {
  let hit: GestureSample | null = null;
  for (let t = 0; t < duration; t += 16) {
    hit = recognizer.push(frame({ t: start + t, beta, rotation })) ?? hit;
  }
  return recognizer.push(frame({ t: start + duration, beta })) ?? hit;
}

class ManualScheduler implements Scheduler {
  private queue: Array<{ at: number; fn: () => void }> = [];
  now = 0;

  delay(ms: number, fn: () => void): void {
    this.queue.push({ at: this.now + ms, fn });
  }

  clear(): void {
    this.queue = [];
  }

  flush(ms: number): void {
    this.now += ms;
    const due = this.queue.filter((item) => item.at <= this.now);
    this.queue = this.queue.filter((item) => item.at > this.now);
    for (const item of due) item.fn();
  }
}

function sample(partial: Partial<RawSensorSample>): RawSensorSample {
  return {
    timestamp: 0,
    orientation: null,
    rotationRate: null,
    acceleration: null,
    accelerationIncludingGravity: null,
    ...partial,
  };
}

test('shortestAngleDelta wraps a heading instead of reporting a full turn', () => {
  assert.equal(shortestAngleDelta(10, 350), 20);
  assert.equal(shortestAngleDelta(350, 10), -20);
});

test('low pass eases toward the sample', () => {
  const filter = new LowPass(0.5);
  assert.equal(filter.push(0), 0);
  assert.equal(filter.push(10), 5);
});

test('gravity stays in the baseline and does not become linear acceleration', () => {
  const separator = new GravitySeparator();
  const still = { x: 0, y: -9.8, z: 0 };
  const first = resolveAcceleration(null, still, separator);
  assert.deepEqual(first.linear, { x: 0, y: 0, z: 0 });
  assert.equal(first.estimated, true);
  const settled = resolveAcceleration(null, still, separator);
  assert.ok(Math.abs(settled.linear.y) < 0.01);
  const spiked = resolveAcceleration(null, { x: 0, y: 2, z: 0 }, separator);
  assert.ok(spiked.linear.y > 8);
  const deviceLinear = resolveAcceleration({ x: 1, y: 2, z: 3 }, still, separator);
  assert.deepEqual(deviceLinear.linear, { x: 1, y: 2, z: 3 });
  assert.equal(deviceLinear.estimated, false);
});

test('portrait tilt normalizes to a full horizontal deflection', () => {
  const oriented = orientMotion({
    orientation: { alpha: 0, beta: 0, gamma: 26 },
    rotation: ZERO,
    linear: { x: 0, y: 0, z: 0 },
    neutral: ZERO,
    portrait: true,
  });
  const motion = normalizeMotion({ oriented, sensitivity: 1, deadZone: 0 });
  assert.equal(motion.horizontal, 1);
  assert.equal(motion.vertical, 0);
});

test('landscape tilt uses the pitched axis for horizontal movement', () => {
  const oriented = orientMotion({
    orientation: { alpha: 0, beta: 26, gamma: 0 },
    rotation: ZERO,
    linear: { x: 0, y: 0, z: 0 },
    neutral: ZERO,
    portrait: false,
  });
  const motion = normalizeMotion({ oriented, sensitivity: 1, deadZone: 0 });
  assert.equal(motion.horizontal, 1);
});

test('a forehand is one gesture, and the rest of that swing does not fire again', () => {
  const recognizer = new GestureRecognizer();
  const first = swing(recognizer, { alpha: 0, beta: 0, gamma: 320 }, 0, 96);
  assert.equal(first?.type, 'FOREHAND_SWING');
  let extras = 0;
  for (let t = 120; t < 420; t += 16) {
    if (recognizer.push(frame({ t, rotation: { alpha: 0, beta: 0, gamma: 320 } }))) extras += 1;
  }
  assert.equal(extras, 0);
  for (let t = 420; t < 760; t += 16) recognizer.push(frame({ t }));
  const second = swing(recognizer, { alpha: 0, beta: 0, gamma: -320 }, 0, 96, 760);
  assert.equal(second?.type, 'BACKHAND_SWING');
});

test('an overhead pitch is a smash, and a tiny wobble is not a shot', () => {
  const recognizer = new GestureRecognizer();
  const smash = swing(recognizer, { alpha: 0, beta: 460, gamma: 20 }, -28, 96);
  assert.equal(smash?.type, 'OVERHEAD_SMASH');
  assert.ok((smash?.intensity ?? 0) > 0.5);

  const quiet = new GestureRecognizer();
  const wobble = swing(quiet, { alpha: 0, beta: 0, gamma: 40 }, 0, 120);
  assert.equal(wobble, null);
});

test('an ambiguous spin does not become a shot', () => {
  const recognizer = new GestureRecognizer();
  const mixed = swing(recognizer, { alpha: 200, beta: 200, gamma: 200 }, 0, 100);
  assert.equal(mixed, null);
});

test('a short yaw burst is a flick and a long twist is not', () => {
  const flick = swing(new GestureRecognizer(), { alpha: 340, beta: 0, gamma: 0 }, 0, 80);
  assert.equal(flick?.type, 'QUICK_FLICK');
  const steer = swing(new GestureRecognizer(), { alpha: 340, beta: 0, gamma: 0 }, 0, 220);
  assert.equal(steer, null);
});

test('a sideways acceleration burst is a movement gesture', () => {
  const recognizer = new GestureRecognizer();
  let hit: GestureSample | null = null;
  for (let t = 0; t < 64; t += 16) {
    hit = recognizer.push(frame({ t, linear: { x: 12, y: 0, z: 0 } })) ?? hit;
  }
  hit = recognizer.push(frame({ t: 80 })) ?? hit;
  assert.equal(hit?.type, 'RIGHT_MOVEMENT');
});

test('calibration raises the swing threshold from the sample swing', () => {
  const manager = new CalibrationManager();
  manager.begin();
  const neutral = manager.captureNeutral({ alpha: 20, beta: 40, gamma: -5 }, 10);
  assert.equal(neutral.ok, true);
  manager.beginSwingCapture(20);
  manager.observeSwing(40, 30);
  const weak = manager.finishSwingCapture(40);
  assert.equal(weak.ok, false);
  manager.beginSwingCapture(50);
  manager.observeSwing(360, 80);
  const strong = manager.finishSwingCapture(100);
  assert.equal(strong.ok, true);
  assert.ok(strong.profile.thresholds.swingDegPerSec > 200);
  assert.deepEqual(thresholdsFromPeak(360).swingDegPerSec, strong.profile.thresholds.swingDegPerSec);
});

test('pointer taps, double taps, and swipes stay distinct', () => {
  const pointer = new PointerTracker();
  pointer.down(0, 0, 0);
  assert.equal(pointer.up(4, 2, 80)?.kind, 'tap');
  pointer.down(0, 0, 200);
  assert.equal(pointer.up(1, 1, 260)?.kind, 'doubletap');
  pointer.down(0, 0, 1_000);
  assert.equal(pointer.up(80, 4, 1_100)?.direction, 'right');
  pointer.down(10, 10, 2_000);
  assert.equal(pointer.up(12, 12, 2_600)?.kind, 'longpress');
});

test('badminton keeps depth and table tennis stays on the line', () => {
  const state = emptyControllerState();
  state.movement = { horizontal: 0.4, vertical: -0.2 };
  const gesture: GestureSample = { type: 'FOREHAND_SWING', intensity: 0.8, confidence: 0.9, source: 'motion' };
  assert.equal(mapBadminton(state, gesture).moveY, -0.2);
  assert.equal(mapBadminton(state, gesture).shot, 'forehand');
  assert.equal(mapTableTennis(state, gesture).moveY, 0);
  assert.equal(mapTableTennis(state, null).shot, null);
});

test('the controller reaches a calibrated tilt and emits one forehand', () => {
  const scheduler = new ManualScheduler();
  let clock = 1_000;
  const controller = new MotionController({ clock: () => clock, scheduler });
  controller.initialize();
  controller.setDeadZone(0);
  controller.pushSample(sample({ timestamp: clock, orientation: { alpha: 0, beta: 0, gamma: 0 } }));
  controller.calibrate();
  let horizontal = 0;
  for (let i = 0; i < 10; i += 1) {
    clock += 16;
    const events = controller.pushSample(
      sample({ timestamp: clock, orientation: { alpha: 0, beta: 0, gamma: 26 } }),
    );
    const state = events.find((event) => event.type === 'state');
    if (state && state.type === 'state') horizontal = state.state.movement.horizontal;
  }
  assert.ok(horizontal > 0.9);

  const gestures: GestureSample[] = [];
  const collect = (events: ReturnType<MotionController['pushSample']>) => {
    for (const event of events) {
      if (event.type === 'gesture') gestures.push(event.gesture);
    }
  };
  for (let i = 0; i < 8; i += 1) {
    clock += 16;
    collect(
      controller.pushSample(
        sample({
          timestamp: clock,
          orientation: { alpha: 0, beta: 0, gamma: 26 },
          rotationRate: { alpha: 0, beta: 0, gamma: 500 },
        }),
      ),
    );
  }
  for (let i = 0; i < 6; i += 1) {
    clock += 16;
    collect(
      controller.pushSample(
        sample({
          timestamp: clock,
          orientation: { alpha: 0, beta: 0, gamma: 26 },
          rotationRate: { alpha: 0, beta: 0, gamma: 0 },
        }),
      ),
    );
  }
  assert.equal(gestures.length, 1);
  assert.equal(gestures[0]?.type, 'FOREHAND_SWING');
  clock += 40;
  const again = controller.pushSample(
    sample({
      timestamp: clock,
      orientation: { alpha: 0, beta: 0, gamma: 26 },
      rotationRate: { alpha: 0, beta: 0, gamma: 500 },
    }),
  );
  assert.equal(again.some((event) => event.type === 'gesture'), false);
});

test('touch fallback pulses the action button and does not invent rotation', () => {
  const scheduler = new ManualScheduler();
  const controller = new MotionController({ clock: () => scheduler.now, scheduler });
  controller.pointerDown(0, 0);
  scheduler.now = 90;
  const gesture = controller.pointerUp(2, 1);
  assert.equal(gesture?.kind, 'tap');
  assert.equal(controller.getState().buttons.action, true);
  assert.equal(controller.getState().sensors.rotation, false);
  scheduler.flush(120);
  assert.equal(controller.getState().buttons.action, false);
});

test('missing rotation is reported as unavailable instead of a live sensor', () => {
  const controller = new MotionController({ clock: () => 0 });
  let capabilities: SensorCapabilities | null = null;
  controller.subscribe((event) => {
    if (event.type === 'capabilities') capabilities = event.capabilities;
  });
  for (let i = 0; i < 12; i += 1) {
    controller.pushSample(
      sample({
        timestamp: i,
        accelerationIncludingGravity: { x: 0, y: -9.8, z: 0 },
      }),
    );
  }
  assert.equal(capabilities?.rotationRate, false);
  assert.equal(capabilities?.linearAcceleration, false);
  assert.equal(capabilities?.accelerationIncludingGravity, true);
  assert.equal(controller.getState().sensors.rotation, false);
});
