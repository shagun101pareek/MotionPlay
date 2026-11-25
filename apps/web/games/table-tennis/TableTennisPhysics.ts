import { clamp } from '@motionplay/shared';

/** Official table dimensions, in meters. The player stands on the negative-Z end. */
export const TABLE = {
  length: 2.74,
  width: 1.525,
  halfLength: 1.37,
  halfWidth: 0.7625,
  surfaceY: 0.76,
  netHeight: 0.1525,
  netOverhang: 0.1525,
  ballRadius: 0.02,
  gravity: 9.81,
  drag: 0.04,
  magnus: 0.16,
  restitution: 0.86,
  matchPoints: 11,
  winBy: 2,
} as const;

export const STRIKE_REACH = 0.92;

export type Side = 'player' | 'opponent';
export type TableShot = 'forehand' | 'backhand' | 'smash' | 'flick';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  topspin: number;
}

export interface ShotInput {
  kind: TableShot;
  intensity: number;
  angle: number;
  aimError: number;
  height: number;
  side: Side;
}

export interface StepEvent {
  ball: Ball;
  event: 'none' | 'table' | 'net' | 'floor';
  side: Side | null;
  letClip: boolean;
}

export type Flight = 'serve' | 'rally';

export interface RallyFacts {
  flight: Flight;
  hitter: Side;
  bounces: Record<Side, number>;
  letClip: boolean;
}

export interface Ruling {
  result: 'play' | 'let' | 'point';
  winner: Side | null;
  reason: string;
}

const PLAY: Ruling = { result: 'play', winner: null, reason: '' };

export function otherSide(side: Side): Side {
  return side === 'player' ? 'opponent' : 'player';
}

export function tableSide(z: number): Side {
  return z < 0 ? 'player' : 'opponent';
}

export function onTable(x: number, z: number): boolean {
  return Math.abs(x) <= TABLE.halfWidth && Math.abs(z) <= TABLE.halfLength;
}

export function emptyFacts(flight: Flight, hitter: Side): RallyFacts {
  return { flight, hitter, bounces: { player: 0, opponent: 0 }, letClip: false };
}

export function tossBall(side: Side, x: number): Ball {
  const sign = side === 'player' ? -1 : 1;
  return {
    x: clamp(x, -TABLE.halfWidth, TABLE.halfWidth),
    y: TABLE.surfaceY + 0.28,
    z: sign * (TABLE.halfLength + 0.18),
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    topspin: 0,
  };
}

export function serveStrike(ball: Ball, shot: ShotInput): Ball {
  const sign = shot.side === 'player' ? 1 : -1;
  const intensity = clamp(shot.intensity, 0.35, 1);
  return {
    x: ball.x,
    y: Math.max(ball.y, TABLE.surfaceY + 0.26),
    z: ball.z,
    vx: shot.aimError * 0.55 + shot.angle * 0.35,
    vy: 0.85 + shot.height * 0.2,
    vz: sign * (2.45 + intensity * 0.35),
    spin: shot.angle * 0.9,
    topspin: 0.55 + intensity * 0.25,
  };
}

export function strike(ball: Ball, shot: ShotInput): Ball {
  const sign = shot.side === 'player' ? 1 : -1;
  const intensity = clamp(shot.intensity, 0.2, 1);
  const contactZ =
    shot.side === 'player'
      ? Math.min(ball.z, -0.25)
      : Math.max(ball.z, 0.25);
  const contactY = Math.max(ball.y, TABLE.surfaceY + TABLE.ballRadius + 0.08);
  // Aim for a landing on the far half so returns stay in play.
  const deep = shot.kind === 'smash' ? 0.95 : shot.kind === 'flick' ? 0.55 : 0.72;
  const targetZ = sign * (TABLE.halfLength * deep);
  const travel = Math.max(0.55, Math.abs(targetZ - contactZ));
  const flight = shot.kind === 'smash' ? 0.48 - intensity * 0.06 : shot.kind === 'flick' ? 0.72 : 0.58 - intensity * 0.04;
  const vz = sign * (travel / Math.max(0.4, flight));
  const spin = shot.angle * 1.6 + (shot.kind === 'forehand' ? 0.12 : shot.kind === 'backhand' ? -0.12 : 0);
  const vx = shot.aimError * (TABLE.halfWidth * 0.55) / flight + spin * 0.12;
  const peak = shot.kind === 'smash' ? 0.22 : 0.34 + shot.height * 0.12;
  const vy = (TABLE.surfaceY + peak - contactY + 0.5 * TABLE.gravity * flight * flight) / flight;
  const netClear = TABLE.surfaceY + TABLE.netHeight + 0.06 - contactY;
  const timeToNet = Math.max(0.1, Math.abs(contactZ) / Math.abs(vz));
  const needArc = (netClear + 0.5 * TABLE.gravity * timeToNet * timeToNet) / timeToNet + 0.2;
  return {
    x: ball.x,
    y: contactY,
    z: contactZ,
    vx,
    vy: Math.max(vy, needArc, 0.9),
    vz: clamp(vz, -7.2, 7.2),
    spin,
    topspin: shot.kind === 'smash' ? 0.7 : 0.95 + intensity * 0.25,
  };
}

/** True when the ball is in a hittable pocket for this side. */
export function canStrike(ball: Ball, aimX: number, side: Side, requireBounce = true, bounces?: Record<Side, number>): boolean {
  if (requireBounce && bounces && bounces[side] < 1) return false;
  const depth =
    side === 'player'
      ? ball.z < 0.05 && ball.z > -TABLE.halfLength - 0.75
      : ball.z > 0.35 && ball.z < TABLE.halfLength + 0.75;
  const coming =
    side === 'player'
      ? ball.vz < 2.4 || ball.z < -0.35
      : ball.vz > -2.4 || ball.z > 0.35;
  const height = ball.y > TABLE.surfaceY - 0.02 && ball.y < TABLE.surfaceY + 1.05;
  return depth && coming && height && Math.abs(ball.x - aimX) <= STRIKE_REACH;
}

export function stepTableTennis(ball: Ball, dt: number): StepEvent {
  if (dt <= 0) return { ball, event: 'none', side: null, letClip: false };
  const prev = ball;
  let next = integrate(ball, dt);
  let event: StepEvent['event'] = 'none';
  let side: Side | null = null;
  let letClip = false;

  if ((prev.z < 0 && next.z >= 0) || (prev.z > 0 && next.z <= 0)) {
    const dz = next.z - prev.z;
    const t = dz === 0 ? 0 : (0 - prev.z) / dz;
    const x = prev.x + (next.x - prev.x) * t;
    const y = prev.y + (next.y - prev.y) * t;
    const netTop = TABLE.surfaceY + TABLE.netHeight;
    const halfNet = TABLE.halfWidth + TABLE.netOverhang;
    if (Math.abs(x) <= halfNet + TABLE.ballRadius && y <= netTop + TABLE.ballRadius * 0.6 && y >= TABLE.surfaceY - 0.01) {
      if (y >= netTop - 0.018) {
        letClip = true;
        next = { ...next, vy: next.vy * 0.95, vz: next.vz * 0.98 };
      } else {
        next = {
          ...next,
          x,
          y,
          z: Math.sign(prev.z || 1) * (TABLE.ballRadius + 0.01),
          vz: -next.vz * 0.22,
          vy: Math.min(next.vy, 0) * 0.3,
          vx: next.vx * 0.45,
          topspin: next.topspin * 0.2,
          spin: next.spin * 0.2,
        };
        event = 'net';
      }
    }
  }

  const surface = TABLE.surfaceY + TABLE.ballRadius;
  if (next.y <= surface && next.vy <= 0 && onTable(next.x, next.z) && prev.y >= surface - 0.004) {
    const travel = Math.sign(next.vz || prev.vz || 1);
    next = {
      ...next,
      y: surface,
      vy: Math.abs(next.vy) * TABLE.restitution,
      vx: next.vx * 0.92 + next.spin * 0.03,
      vz: next.vz * 0.95 + next.topspin * 0.28 * travel,
      topspin: next.topspin * 0.55,
      spin: next.spin * 0.7,
    };
    if (event !== 'net') {
      event = 'table';
      side = tableSide(next.z === 0 ? prev.z : next.z);
    }
  }

  if (next.y <= TABLE.ballRadius && next.vy <= 0 && !onTable(next.x, next.z) && prev.y > TABLE.ballRadius + 0.001) {
    next = {
      ...next,
      y: TABLE.ballRadius,
      vy: Math.abs(next.vy) * 0.18,
      vx: next.vx * 0.45,
      vz: next.vz * 0.45,
    };
    if (event === 'none') event = 'floor';
  }

  return { ball: next, event, side, letClip };
}

export function onBounce(facts: RallyFacts, side: Side): { facts: RallyFacts; ruling: Ruling } {
  const next: RallyFacts = {
    ...facts,
    bounces: { ...facts.bounces, [side]: facts.bounces[side] + 1 },
  };
  return { facts: next, ruling: judgeBounce(next, side) };
}

export function ruleNet(facts: RallyFacts): Ruling {
  return { result: 'point', winner: otherSide(facts.hitter), reason: 'Net' };
}

export function ruleDead(facts: RallyFacts): Ruling {
  const receiver = otherSide(facts.hitter);
  if (facts.bounces[receiver] >= 1) return { result: 'point', winner: facts.hitter, reason: 'Point' };
  if (facts.flight === 'serve' && facts.bounces[facts.hitter] < 1) {
    return { result: 'point', winner: receiver, reason: 'Fault' };
  }
  return { result: 'point', winner: receiver, reason: 'Out' };
}

export function winnerOf(player: number, opponent: number): Side | null {
  if (player >= TABLE.matchPoints && player - opponent >= TABLE.winBy) return 'player';
  if (opponent >= TABLE.matchPoints && opponent - player >= TABLE.winBy) return 'opponent';
  return null;
}

export function serverFor(player: number, opponent: number, initial: Side = 'player'): Side {
  const total = player + opponent;
  const deuce = player >= TABLE.matchPoints - 1 && opponent >= TABLE.matchPoints - 1;
  const turns = deuce ? total : Math.floor(total / 2);
  return turns % 2 === 0 ? initial : otherSide(initial);
}

export function predictLandingX(ball: Ball, side: Side): number {
  let sample = ball;
  for (let i = 0; i < 90; i += 1) {
    const step = stepTableTennis(sample, 1 / 90);
    sample = step.ball;
    if (!Number.isFinite(sample.x)) return 0;
    if (step.event === 'table' && step.side === side) return clamp(sample.x, -TABLE.halfWidth, TABLE.halfWidth);
    if (step.event === 'floor' || step.event === 'net') break;
  }
  return clamp(sample.x, -TABLE.halfWidth, TABLE.halfWidth);
}

function judgeBounce(facts: RallyFacts, side: Side): Ruling {
  const receiver = otherSide(facts.hitter);
  if (facts.flight === 'serve') {
    if (side === facts.hitter && facts.bounces[facts.hitter] > 1) return { result: 'point', winner: receiver, reason: 'Fault' };
    if (side === receiver && facts.bounces[facts.hitter] < 1) return { result: 'point', winner: receiver, reason: 'Fault' };
    if (side === receiver && facts.bounces[receiver] > 1) return { result: 'point', winner: facts.hitter, reason: 'Point' };
    if (side === receiver && facts.letClip && facts.bounces[facts.hitter] >= 1 && facts.bounces[receiver] === 1) {
      return { result: 'let', winner: null, reason: 'Let' };
    }
    return PLAY;
  }
  if (side === facts.hitter) return { result: 'point', winner: receiver, reason: 'Out' };
  if (facts.bounces[receiver] > 1) return { result: 'point', winner: facts.hitter, reason: 'Double bounce' };
  return PLAY;
}

function integrate(ball: Ball, dt: number): Ball {
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const drag = TABLE.drag * speed;
  let vx = ball.vx - ball.vx * drag * dt;
  let vy = ball.vy - ball.vy * drag * dt;
  let vz = ball.vz - ball.vz * drag * dt;
  const planar = Math.hypot(vx, vz);
  vy -= TABLE.gravity * dt;
  vy -= ball.topspin * TABLE.magnus * planar * dt;
  vx += ball.spin * TABLE.magnus * vz * dt;
  vz -= ball.spin * TABLE.magnus * vx * dt * 0.12;
  const nextSpeed = Math.hypot(vx, vy, vz);
  if (nextSpeed > 18) {
    const scale = 18 / nextSpeed;
    vx *= scale;
    vy *= scale;
    vz *= scale;
  }
  return {
    ...ball,
    x: ball.x + vx * dt,
    y: ball.y + vy * dt,
    z: ball.z + vz * dt,
    vx,
    vy,
    vz,
  };
}
