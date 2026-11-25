import { INPUT_MIN_INTERVAL_MS } from '@motionplay/shared';

/**
 * Drops controller samples that arrive faster than the game can use.
 * Silent drops avoid flooding the phone with error events.
 */
export class InputGate {
  private readonly last = new Map<string, number>();

  constructor(private readonly minIntervalMs = INPUT_MIN_INTERVAL_MS) {}

  allow(socketId: string, now = Date.now()): boolean {
    const previous = this.last.get(socketId) ?? 0;
    if (now - previous < this.minIntervalMs) return false;
    this.last.set(socketId, now);
    return true;
  }

  clear(socketId: string): void {
    this.last.delete(socketId);
  }
}
