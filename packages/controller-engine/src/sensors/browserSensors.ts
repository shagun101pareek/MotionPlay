import type { SensorCapabilities } from './sensorCapabilities.js';
import { unavailableCapabilities } from './sensorCapabilities.js';
import type { RawSensorSample } from '../types/sensorData.js';

export interface SensorSource {
  probe(): SensorCapabilities;
  requestPermissions(): Promise<'granted' | 'denied' | 'unsupported' | 'insecure'>;
  start(onSample: (sample: RawSensorSample) => void): void;
  stop(): void;
}

interface MotionEventLike {
  acceleration: { x: number | null; y: number | null; z: number | null } | null;
  accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null } | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  timeStamp: number;
}

interface OrientationEventLike {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  timeStamp: number;
}

interface PermissionedEventTarget {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

type Listener = (event: Event) => void;

interface BrowserHost {
  isSecureContext: boolean;
  orientationEvent: PermissionedEventTarget | undefined;
  motionEvent: PermissionedEventTarget | undefined;
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  now(): number;
}

function browserHost(): BrowserHost | null {
  if (typeof window === 'undefined') return null;
  const host = window as Window & {
    DeviceOrientationEvent?: PermissionedEventTarget;
    DeviceMotionEvent?: PermissionedEventTarget;
  };
  return {
    isSecureContext: window.isSecureContext,
    orientationEvent: host.DeviceOrientationEvent,
    motionEvent: host.DeviceMotionEvent,
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
    now: () => Date.now(),
  };
}

async function ask(target: PermissionedEventTarget | undefined): Promise<'granted' | 'denied' | 'missing'> {
  if (!target) return 'missing';
  if (typeof target.requestPermission !== 'function') return 'granted';
  try {
    const result = await target.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export class BrowserSensorSource implements SensorSource {
  private orientation: OrientationEventLike | null = null;
  private motion: MotionEventLike | null = null;
  private onOrientation: Listener | null = null;
  private onMotion: Listener | null = null;
  private emit: ((sample: RawSensorSample) => void) | null = null;

  constructor(private readonly host: BrowserHost | null = browserHost()) {}

  probe(): SensorCapabilities {
    if (!this.host) return unavailableCapabilities(false);
    const permissionRequired =
      typeof this.host.orientationEvent?.requestPermission === 'function' ||
      typeof this.host.motionEvent?.requestPermission === 'function';
    return {
      secureContext: this.host.isSecureContext,
      permissionRequired,
      orientation: Boolean(this.host.orientationEvent),
      motion: Boolean(this.host.motionEvent),
      rotationRate: null,
      linearAcceleration: null,
      accelerationIncludingGravity: null,
    };
  }

  async requestPermissions(): Promise<'granted' | 'denied' | 'unsupported' | 'insecure'> {
    if (!this.host) return 'unsupported';
    if (!this.host.isSecureContext) return 'insecure';
    if (!this.host.orientationEvent && !this.host.motionEvent) return 'unsupported';
    const [orientation, motion] = await Promise.all([ask(this.host.orientationEvent), ask(this.host.motionEvent)]);
    if (orientation === 'denied' || motion === 'denied') return 'denied';
    if (orientation === 'missing' && motion === 'missing') return 'unsupported';
    return 'granted';
  }

  start(onSample: (sample: RawSensorSample) => void): void {
    this.stop();
    if (!this.host) return;
    this.emit = onSample;
    this.onOrientation = (event) => {
      const reading = event as unknown as OrientationEventLike;
      this.orientation = reading;
      this.publish();
    };
    this.onMotion = (event) => {
      const reading = event as unknown as MotionEventLike;
      this.motion = reading;
      this.publish();
    };
    this.host.addEventListener('deviceorientation', this.onOrientation);
    this.host.addEventListener('devicemotion', this.onMotion);
  }

  stop(): void {
    if (this.host && this.onOrientation) this.host.removeEventListener('deviceorientation', this.onOrientation);
    if (this.host && this.onMotion) this.host.removeEventListener('devicemotion', this.onMotion);
    this.onOrientation = null;
    this.onMotion = null;
    this.emit = null;
    this.orientation = null;
    this.motion = null;
  }

  private publish(): void {
    if (!this.emit || !this.host) return;
    const motion = this.motion;
    const orientation = this.orientation;
    this.emit({
      timestamp: this.host.now(),
      orientation: orientation
        ? { alpha: orientation.alpha, beta: orientation.beta, gamma: orientation.gamma }
        : null,
      rotationRate: motion?.rotationRate
        ? {
            alpha: motion.rotationRate.alpha,
            beta: motion.rotationRate.beta,
            gamma: motion.rotationRate.gamma,
          }
        : null,
      acceleration: motion?.acceleration
        ? { x: motion.acceleration.x, y: motion.acceleration.y, z: motion.acceleration.z }
        : null,
      accelerationIncludingGravity: motion?.accelerationIncludingGravity
        ? {
            x: motion.accelerationIncludingGravity.x,
            y: motion.accelerationIncludingGravity.y,
            z: motion.accelerationIncludingGravity.z,
          }
        : null,
    });
  }
}

export function createBrowserSensorSource(): SensorSource {
  return new BrowserSensorSource();
}
