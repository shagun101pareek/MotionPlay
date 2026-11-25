export type PointerKind = 'tap' | 'doubletap' | 'longpress' | 'swipe';
export type SwipeDirection = 'left' | 'right' | 'forward' | 'backward';

export interface PointerGesture {
  kind: PointerKind;
  direction?: SwipeDirection;
  x: number;
  y: number;
  t: number;
}

const TAP_MS = 280;
const DOUBLE_MS = 320;
const LONG_MS = 450;
const SLOP = 18;
const SWIPE = 42;

/**
 * Touch-surface gestures. Coordinates are CSS pixels relative to the surface.
 * A swipe along Y is forward/back; along X is left/right.
 */
export class PointerTracker {
  private active = false;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private lastX = 0;
  private lastY = 0;
  private lastTapAt = 0;

  down(x: number, y: number, t: number): void {
    this.active = true;
    this.startX = x;
    this.startY = y;
    this.lastX = x;
    this.lastY = y;
    this.startT = t;
  }

  move(x: number, y: number): void {
    if (!this.active) return;
    this.lastX = x;
    this.lastY = y;
  }

  up(x: number, y: number, t: number): PointerGesture | null {
    if (!this.active) return null;
    this.active = false;
    this.lastX = x;
    this.lastY = y;
    const dx = x - this.startX;
    const dy = y - this.startY;
    const distance = Math.hypot(dx, dy);
    const duration = t - this.startT;

    if (distance >= SWIPE) {
      const direction: SwipeDirection =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'backward' : 'forward';
      return { kind: 'swipe', direction, x, y, t };
    }
    if (distance <= SLOP && duration >= LONG_MS) {
      return { kind: 'longpress', x, y, t };
    }
    if (distance <= SLOP && duration <= TAP_MS) {
      const doubled = this.lastTapAt > 0 && t - this.lastTapAt <= DOUBLE_MS;
      this.lastTapAt = doubled ? 0 : t;
      return { kind: doubled ? 'doubletap' : 'tap', x, y, t };
    }
    return null;
  }

  cancel(): void {
    this.active = false;
  }
}
