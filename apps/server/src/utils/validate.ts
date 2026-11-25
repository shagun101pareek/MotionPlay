import {
  BUTTON_MIN_INTERVAL_MS,
  GESTURE_MIN_INTERVAL_MS,
  INPUT_MIN_INTERVAL_MS,
  MAX_CLOCK_SKEW_MS,
  MAX_CONTROL_KEYS,
  clamp,
  clampUnit,
  isDifficulty,
  isGameId,
  isGestureSource,
  isGestureType,
  isPlayMode,
  isValidRoomId,
  normalizeRoomId,
} from '@motionplay/shared';
import type {
  ControllerButtonPayload,
  ControllerInputPayload,
  ControllerGesturePayload,
  ControllerState,
  CreateRoomPayload,
  JoinRoomPayload,
  RoomCommandPayload,
} from '@motionplay/shared';
import { InputGate } from '../middleware/rateLimit.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyCount(value: unknown, depth = 0): number {
  if (!isRecord(value) || depth > 4) return 0;
  const keys = Object.keys(value);
  if (keys.length > MAX_CONTROL_KEYS) return MAX_CONTROL_KEYS + 1;
  let count = keys.length;
  for (const key of keys) count += keyCount(value[key], depth + 1);
  return count;
}

function roomIdOf(raw: Record<string, unknown>): string | null {
  if (typeof raw.roomId !== 'string') return null;
  const roomId = normalizeRoomId(raw.roomId);
  return isValidRoomId(roomId) ? roomId : null;
}

function finite(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clamp(value, min, max);
}

function unit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clampUnit(value);
}

function timestampOf(value: unknown, now: number): number | null {
  if (value === undefined) return now;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value - now) > MAX_CLOCK_SKEW_MS) return now;
  return value;
}

function sequenceOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
  return value;
}

function euler(value: unknown, limit: number): { alpha: number; beta: number; gamma: number } | null {
  if (!isRecord(value)) return null;
  const alpha = finite(value.alpha, -limit, limit);
  const beta = finite(value.beta, -limit, limit);
  const gamma = finite(value.gamma, -limit, limit);
  if (alpha === null || beta === null || gamma === null) return null;
  return { alpha, beta, gamma };
}

function axis(value: unknown): { x: number; y: number; z: number } | null {
  if (!isRecord(value)) return null;
  const x = finite(value.x, -80, 80);
  const y = finite(value.y, -80, 80);
  const z = finite(value.z, -80, 80);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function flags(value: unknown): ControllerState['sensors'] | null {
  if (!isRecord(value)) return null;
  if (typeof value.orientation !== 'boolean') return null;
  if (typeof value.rotation !== 'boolean') return null;
  if (typeof value.acceleration !== 'boolean') return null;
  return { orientation: value.orientation, rotation: value.rotation, acceleration: value.acceleration };
}

function buttons(value: unknown): ControllerState['buttons'] | null {
  if (!isRecord(value)) return null;
  if (typeof value.action !== 'boolean' || typeof value.special !== 'boolean') return null;
  return { action: value.action, special: value.special };
}

function stateOf(value: unknown, now: number): ControllerState | null {
  if (!isRecord(value) || keyCount(value) > MAX_CONTROL_KEYS) return null;
  const orientation = euler(value.orientation, 180);
  const rotation = euler(value.rotation, 2000);
  const acceleration = axis(value.acceleration);
  if (!orientation || !rotation || !acceleration || !isRecord(value.movement)) return null;
  const horizontal = unit(value.movement.horizontal);
  const vertical = unit(value.movement.vertical);
  const racketAngle = unit(value.racketAngle);
  const sensorFlags = flags(value.sensors);
  const pressed = buttons(value.buttons);
  const sequence = sequenceOf(value.sequence);
  const timestamp = timestampOf(value.timestamp, now);
  if (horizontal === null || vertical === null || racketAngle === null || !sensorFlags || !pressed || sequence === null || timestamp === null) {
    return null;
  }
  return {
    orientation,
    rotation,
    acceleration,
    movement: { horizontal, vertical },
    racketAngle,
    buttons: pressed,
    sensors: sensorFlags,
    sequence,
    timestamp,
  };
}

function legacyState(raw: Record<string, unknown>, now: number): ControllerState | null {
  const position = unit(raw.position);
  const tilt = unit(raw.tilt);
  const timestamp = timestampOf(raw.timestamp, now);
  if (position === null || tilt === null || timestamp === null) return null;
  return {
    orientation: { alpha: 0, beta: 0, gamma: tilt * 26 },
    rotation: { alpha: 0, beta: 0, gamma: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    movement: { horizontal: position, vertical: 0 },
    racketAngle: tilt,
    buttons: { action: false, special: false },
    sensors: { orientation: true, rotation: false, acceleration: false },
    sequence: timestamp,
    timestamp,
  };
}

export function sanitizeControllerInput(raw: unknown, now = Date.now()): ControllerInputPayload | null {
  if (!isRecord(raw) || keyCount(raw) > MAX_CONTROL_KEYS) return null;
  const roomId = roomIdOf(raw);
  if (!roomId) return null;
  if (isRecord(raw.state)) {
    const state = stateOf(raw.state, now);
    return state ? { roomId, state } : null;
  }
  if ('position' in raw || 'tilt' in raw) {
    const state = legacyState(raw, now);
    return state ? { roomId, state } : null;
  }
  return null;
}

export function sanitizeControllerGesture(raw: unknown, now = Date.now()): ControllerGesturePayload | null {
  if (!isRecord(raw) || keyCount(raw) > MAX_CONTROL_KEYS || !isRecord(raw.gesture)) return null;
  const roomId = roomIdOf(raw);
  if (!roomId) return null;
  if (!isGestureType(raw.gesture.type) || !isGestureSource(raw.gesture.source)) return null;
  const intensity = unit(raw.gesture.intensity);
  const confidence = unit(raw.gesture.confidence);
  const sequence = sequenceOf(raw.sequence);
  const timestamp = timestampOf(raw.timestamp, now);
  if (intensity === null || confidence === null || sequence === null || timestamp === null) return null;
  if (intensity < 0 || confidence < 0) return null;
  return {
    roomId,
    gesture: { type: raw.gesture.type, intensity, confidence, source: raw.gesture.source },
    sequence,
    timestamp,
  };
}

export function sanitizeControllerButton(raw: unknown, now = Date.now()): ControllerButtonPayload | null {
  if (!isRecord(raw) || keyCount(raw) > MAX_CONTROL_KEYS) return null;
  const roomId = roomIdOf(raw);
  if (!roomId) return null;
  if (raw.button !== 'action' && raw.button !== 'special') return null;
  if (typeof raw.pressed !== 'boolean') return null;
  const sequence = sequenceOf(raw.sequence);
  const timestamp = timestampOf(raw.timestamp, now);
  if (sequence === null || timestamp === null) return null;
  return { roomId, button: raw.button, pressed: raw.pressed, sequence, timestamp };
}

export function parseCreateRoom(raw: unknown): CreateRoomPayload | null {
  if (raw == null) return { gameId: 'table-tennis', mode: 'single', difficulty: 'medium' };
  if (!isRecord(raw)) return null;
  const gameId = raw.gameId === undefined ? 'table-tennis' : raw.gameId;
  const mode = raw.mode === undefined ? 'single' : raw.mode;
  const difficulty = raw.difficulty === undefined ? 'medium' : raw.difficulty;
  if (!isGameId(gameId) || !isPlayMode(mode) || !isDifficulty(difficulty)) return null;
  return { gameId, mode, difficulty };
}

export function parseJoin(raw: unknown): JoinRoomPayload | null {
  if (!isRecord(raw)) return null;
  const roomId = roomIdOf(raw);
  if (!roomId) return null;
  if (raw.role !== 'host' && raw.role !== 'controller') return null;
  const sessionToken =
    typeof raw.sessionToken === 'string' && /^[a-f0-9]{16,64}$/i.test(raw.sessionToken) ? raw.sessionToken : undefined;
  return { roomId, role: raw.role, sessionToken };
}

export function parseRoomCommand(raw: unknown): RoomCommandPayload | null {
  if (!isRecord(raw)) return null;
  const roomId = roomIdOf(raw);
  if (!roomId) return null;
  return { roomId };
}

export function createInputGates(): { state: InputGate; gesture: InputGate; button: InputGate } {
  return {
    state: new InputGate(INPUT_MIN_INTERVAL_MS),
    gesture: new InputGate(GESTURE_MIN_INTERVAL_MS),
    button: new InputGate(BUTTON_MIN_INTERVAL_MS),
  };
}
