import { clamp } from '@motionplay/shared';

export const COURT = {
  length: 13.4,
  halfWidth: 2.59,
  netZ: 6.7,
  netHeight: 1.55,
} as const;

export type Side = 'player' | 'opponent';
export type ShotName = 'forehand' | 'backhand' | 'smash' | 'flick' | 'clear' | 'serve';

export interface Shuttle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export type FlightEvent = { type: 'fly' } | { type: 'net' } | { type: 'land'; hitterScores: boolean };

export function stepShuttle(shuttle: Shuttle, dt: number): Shuttle {
  const speed = Math.hypot(shuttle.vx, shuttle.vy, shuttle.vz);
  const drag = 0.04 * speed;
  const vx = shuttle.vx - shuttle.vx * drag * dt;
  const vy = shuttle.vy - shuttle.vy * drag * dt - 9.8 * dt;
  const vz = shuttle.vz - shuttle.vz * drag * dt;
  return {
    x: shuttle.x + vx * dt,
    y: shuttle.y + vy * dt,
    z: shuttle.z + vz * dt,
    vx,
    vy,
    vz,
  };
}

export function shotVelocity(
  kind: ShotName,
  intensity: number,
  quality: number,
  angle: number,
  direction: 1 | -1,
): Pick<Shuttle, 'vx' | 'vy' | 'vz'> {
  const power = 0.62 + clamp(intensity, 0, 1) * 0.5;
  const touch = 0.72 + clamp(quality, 0, 1) * 0.38;
  const aim = clamp(angle, -1, 1) * 3.1;
  const side = kind === 'backhand' ? -0.45 : kind === 'forehand' ? 0.45 : 0;
  let vz = 12.4;
  let vy = 3.1;
  if (kind === 'smash') {
    vz = 17.5;
    vy = -0.6 - clamp(intensity, 0, 1) * 3.2;
  } else if (kind === 'flick') {
    vz = 7.6;
    vy = 3.6;
  } else if (kind === 'clear') {
    vz = 10.8;
    vy = 7.6;
  } else if (kind === 'serve') {
    vz = 7.6;
    vy = 6.35;
  }
  return {
    vx: (aim + side) * (direction === 1 ? 1 : 0.85) * (kind === 'serve' ? 0.35 : 1),
    vy: vy * touch,
    vz: vz * power * touch * direction,
  };
}

export function inReach(shuttle: Shuttle, x: number, z: number, reach = 1.5): boolean {
  if (shuttle.y < 0.15 || shuttle.y > 3.1) return false;
  return Math.hypot(shuttle.x - x, shuttle.z - z) <= reach;
}

export function evaluateFlight(prev: Shuttle, next: Shuttle, hitter: Side): FlightEvent {
  const crossed = (prev.z - COURT.netZ) * (next.z - COURT.netZ) < 0;
  if (crossed && next.z !== prev.z) {
    const t = (COURT.netZ - prev.z) / (next.z - prev.z);
    const height = prev.y + (next.y - prev.y) * t;
    if (height < COURT.netHeight) return { type: 'net' };
  }
  if (next.y > 0) return { type: 'fly' };
  const inTarget =
    hitter === 'player'
      ? next.z > COURT.netZ && next.z <= COURT.length && Math.abs(next.x) <= COURT.halfWidth
      : next.z >= 0 && next.z < COURT.netZ && Math.abs(next.x) <= COURT.halfWidth;
  return { type: 'land', hitterScores: inTarget };
}

export function strikeShuttle(shuttle: Shuttle, kind: ShotName, intensity: number, quality: number, angle: number, hitter: Side): Shuttle {
  const velocity = shotVelocity(kind, intensity, quality, angle, hitter === 'player' ? 1 : -1);
  return { ...shuttle, ...velocity, y: Math.max(shuttle.y, 0.4) };
}

export function hitQuality(height: number): number {
  return clamp(1 - Math.abs(height - 1.45) / 1.5, 0.2, 1);
}
