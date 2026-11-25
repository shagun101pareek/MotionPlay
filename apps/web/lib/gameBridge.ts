import { clamp, clampUnit, INPUT_STALE_MS, emptyControllerState } from '@motionplay/shared';
import type { ControllerState, GestureSample } from '@motionplay/shared';

export type MatchPhase = 'waiting' | 'serve' | 'playing' | 'paused' | 'point' | 'matchover';
export type GameCommand = 'start' | 'pause' | 'restart';

export interface GameSnapshot {
  player: number;
  opponent: number;
  phase: MatchPhase;
  winner: 'player' | 'opponent' | null;
  speed: number;
  detail: string;
  playerLabel: string;
  opponentLabel: string;
  server: 'player' | 'opponent' | null;
}

const initialSnapshot: GameSnapshot = {
  player: 0,
  opponent: 0,
  phase: 'waiting',
  winner: null,
  speed: 0,
  detail: '',
  playerLabel: '',
  opponentLabel: '',
  server: null,
};

let snapshot: GameSnapshot = initialSnapshot;
const snapshotListeners = new Set<() => void>();

function sameSnapshot(next: GameSnapshot): boolean {
  return (
    next.player === snapshot.player &&
    next.opponent === snapshot.opponent &&
    next.phase === snapshot.phase &&
    next.winner === snapshot.winner &&
    next.speed === snapshot.speed &&
    next.detail === snapshot.detail &&
    next.playerLabel === snapshot.playerLabel &&
    next.opponentLabel === snapshot.opponentLabel &&
    next.server === snapshot.server
  );
}

export const gameBus = {
  getSnapshot(): GameSnapshot {
    return snapshot;
  },
  publish(partial: Partial<GameSnapshot>): void {
    const next = { ...snapshot, ...partial };
    if (sameSnapshot(next)) return;
    snapshot = next;
    snapshotListeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    snapshotListeners.add(listener);
    return () => snapshotListeners.delete(listener);
  },
  reset(): void {
    snapshot = initialSnapshot;
    snapshotListeners.forEach((listener) => listener());
  },
};

interface TimedGesture extends GestureSample {
  receivedAt: number;
}

const inputState = {
  state: emptyControllerState(),
  updatedAt: 0,
  connected: false,
  disconnectedAt: 0,
  lastSequence: 0,
  gestures: [] as TimedGesture[],
  actionEdge: false,
};

function fresh(now: number): boolean {
  if (inputState.connected && now - inputState.updatedAt < INPUT_STALE_MS) return true;
  return !inputState.connected && inputState.disconnectedAt > 0 && now - inputState.disconnectedAt < INPUT_STALE_MS;
}

function accept(sequence: number): boolean {
  if (sequence < inputState.lastSequence) return false;
  inputState.lastSequence = sequence;
  return true;
}

export const gameInput = {
  setState(next: ControllerState): void {
    if (!accept(next.sequence)) return;
    if (next.buttons.action && !inputState.state.buttons.action) inputState.actionEdge = true;
    inputState.state = next;
    inputState.updatedAt = performance.now();
    inputState.connected = true;
    inputState.disconnectedAt = 0;
  },
  setButton(button: 'action' | 'special', pressed: boolean, sequence: number): void {
    if (!accept(sequence)) return;
    if (button === 'action' && pressed && !inputState.state.buttons.action) inputState.actionEdge = true;
    inputState.state = {
      ...inputState.state,
      buttons: { ...inputState.state.buttons, [button]: pressed },
      sequence,
    };
    inputState.updatedAt = performance.now();
    inputState.connected = true;
    inputState.disconnectedAt = 0;
  },
  pushGesture(gesture: GestureSample, sequence: number): void {
    if (!accept(sequence)) return;
    inputState.gestures.push({ ...gesture, receivedAt: performance.now() });
    if (inputState.gestures.length > 6) inputState.gestures.shift();
    inputState.updatedAt = performance.now();
    inputState.connected = true;
  },
  expire(maxAge = 450, now = performance.now()): void {
    inputState.gestures = inputState.gestures.filter((gesture) => now - gesture.receivedAt <= maxAge);
  },
  latest(maxAge = 180, now = performance.now()): GestureSample | null {
    const freshGesture = inputState.gestures.filter((gesture) => now - gesture.receivedAt <= maxAge);
    return freshGesture[freshGesture.length - 1] ?? null;
  },
  takeLatest(maxAge = 180, now = performance.now()): GestureSample | null {
    const gesture = this.latest(maxAge, now);
    inputState.gestures = [];
    return gesture;
  },
  consumeAction(): boolean {
    const edge = inputState.actionEdge;
    inputState.actionEdge = false;
    return edge;
  },
  sample(now = performance.now()): ControllerState {
    if (fresh(now)) return inputState.state;
    return {
      ...inputState.state,
      movement: { horizontal: 0, vertical: 0 },
      buttons: { action: false, special: false },
    };
  },
  setConnected(connected: boolean): void {
    inputState.connected = connected;
    if (!connected) inputState.disconnectedAt = performance.now();
  },
  position(now = performance.now()): number {
    return this.sample(now).movement.horizontal;
  },
  reset(): void {
    inputState.state = emptyControllerState();
    inputState.updatedAt = 0;
    inputState.connected = false;
    inputState.disconnectedAt = 0;
    inputState.lastSequence = 0;
    inputState.gestures = [];
    inputState.actionEdge = false;
  },
};

const queue: GameCommand[] = [];

export const gameCommands = {
  push(command: GameCommand): void {
    queue.push(command);
  },
  drain(): GameCommand[] {
    return queue.splice(0, queue.length);
  },
};

export const gameAudio = {
  muted: false,
};

type ActionName = GameCommand | 'resume';
const actionListeners = new Set<(action: ActionName) => void>();

export function requestGameAction(action: ActionName): void {
  actionListeners.forEach((listener) => listener(action));
}

export function onGameAction(listener: (action: ActionName) => void): () => void {
  actionListeners.add(listener);
  return () => actionListeners.delete(listener);
}

export function approach(current: number, target: number, speed: number, dt: number): number {
  const delta = target - current;
  if (Math.abs(delta) < 0.001) return target;
  return current + clamp(delta, -speed * dt, speed * dt);
}

export function axisFromKeys(axis: number, negative: boolean, positive: boolean, dt: number): number {
  if (negative === positive) return axis * Math.exp(-6 * dt);
  return clampUnit(axis + (negative ? -1 : 1) * dt * 2.8);
}
