import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_CONTROLLER_GRACE_MS,
  DEFAULT_HOST_GRACE_MS,
  DEFAULT_ROOM_TTL_MS,
  DEFAULT_SOCKET_PORT,
} from '@motionplay/shared';

function loadEnvFile(): void {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

loadEnvFile();

const corsRaw = process.env.CORS_ORIGIN?.trim();

export const config = {
  port: readNumber('PORT', DEFAULT_SOCKET_PORT),
  host: process.env.HOST?.trim() || '0.0.0.0',
  corsOrigin: !corsRaw || corsRaw === '*' ? true : corsRaw.split(',').map((origin) => origin.trim()),
  roomTtlMs: readNumber('ROOM_TTL_MS', DEFAULT_ROOM_TTL_MS),
  hostGraceMs: readNumber('HOST_GRACE_MS', DEFAULT_HOST_GRACE_MS),
  controllerGraceMs: readNumber('CONTROLLER_GRACE_MS', DEFAULT_CONTROLLER_GRACE_MS),
  disconnectGraceMs: readNumber('DISCONNECT_GRACE_MS', 1500),
  sweepIntervalMs: readNumber('SWEEP_INTERVAL_MS', 15_000),
  tls:
    process.env.TLS_KEY_PATH && process.env.TLS_CERT_PATH
      ? { keyPath: process.env.TLS_KEY_PATH, certPath: process.env.TLS_CERT_PATH }
      : null,
};
