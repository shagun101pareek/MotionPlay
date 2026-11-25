export const ROOM_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_ID_LENGTH = 8;
export const ROOM_ID_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;

export const INPUT_MIN = -1;
export const INPUT_MAX = 1;
export const INPUT_SEND_EPSILON = 0.012;
export const INPUT_MIN_INTERVAL_MS = 16;
export const INPUT_HEARTBEAT_MS = 400;
export const INPUT_STALE_MS = 1200;
export const STATE_SEND_INTERVAL_MS = 33;
export const GESTURE_MIN_INTERVAL_MS = 90;
export const BUTTON_MIN_INTERVAL_MS = 40;
export const MAX_CONTROL_KEYS = 40;
export const MAX_CLOCK_SKEW_MS = 30_000;

export const DEFAULT_ROOM_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_HOST_GRACE_MS = 60 * 1000;
export const DEFAULT_CONTROLLER_GRACE_MS = 15 * 1000;
export const DEFAULT_SOCKET_PORT = 4000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampUnit(value: number): number {
  return clamp(value, INPUT_MIN, INPUT_MAX);
}

export function normalizeRoomId(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidRoomId(value: string): boolean {
  return ROOM_ID_PATTERN.test(normalizeRoomId(value));
}
