import { clamp } from '@motionplay/shared';
import { shotVelocity, type ShotName } from '../badminton/BadmintonPhysics';

export const TENNIS = {
  length: 23.77,
  halfWidth: 4.115,
  netZ: 11.885,
  netHeight: 0.914,
  serviceZ: 18.28,
} as const;

export type Side = 'player' | 'opponent';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export function stepTennis(ball: Ball, dt: number): Ball {
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const drag = 0.012 * speed;
  const vx = ball.vx - ball.vx * drag * dt;
  const vy = ball.vy - ball.vy * drag * dt - 9.8 * dt;
  const vz = ball.vz - ball.vz * drag * dt;
  return { x: ball.x + vx * dt, y: ball.y + vy * dt, z: ball.z + vz * dt, vx, vy, vz };
}

export function bounceBall(ball: Ball): Ball {
  return { ...ball, y: 0, vy: Math.abs(ball.vy) * 0.74, vx: ball.vx * 0.99, vz: ball.vz * 0.992 };
}

export function inCourt(ball: Ball): boolean {
  return ball.z >= 0 && ball.z <= TENNIS.length && Math.abs(ball.x) <= TENNIS.halfWidth;
}

export function inServiceBox(ball: Ball, server: Side): boolean {
  if (Math.abs(ball.x) > TENNIS.halfWidth) return false;
  if (server === 'player') return ball.z > TENNIS.netZ && ball.z < TENNIS.serviceZ;
  return ball.z < TENNIS.netZ && ball.z > TENNIS.length - TENNIS.serviceZ;
}

export function strikeBall(ball: Ball, kind: ShotName, intensity: number, angle: number, side: Side): Ball {
  const pace = kind === 'flick' ? 'flick' : kind;
  const velocity = shotVelocity(pace, intensity, 0.85, angle, side === 'player' ? 1 : -1);
  const scaled = {
    vx: velocity.vx * 1.35,
    vy: kind === 'smash' ? velocity.vy : velocity.vy * 0.72 + 2.4,
    vz: velocity.vz * 1.45,
  };
  return { ...ball, ...scaled, y: Math.max(ball.y, 0.5) };
}

export function netFault(prev: Ball, next: Ball): boolean {
  const crossed = (prev.z - TENNIS.netZ) * (next.z - TENNIS.netZ) < 0;
  if (!crossed || next.z === prev.z) return false;
  const t = (TENNIS.netZ - prev.z) / (next.z - prev.z);
  const height = prev.y + (next.y - prev.y) * t;
  return height < TENNIS.netHeight;
}

export function reachable(ball: Ball, x: number, z: number): boolean {
  return ball.y > 0.2 && ball.y < 3.2 && Math.hypot(ball.x - x, ball.z - z) < 1.8;
}

export function clampPlayer(z: number): number {
  return clamp(z, 0.8, 9.2);
}
