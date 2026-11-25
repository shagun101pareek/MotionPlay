import Phaser from 'phaser';
import type { Difficulty } from '@motionplay/shared';
import { clamp } from '@motionplay/shared';
import { mapTennis } from '@motionplay/controller-engine';
import { drawAthlete } from '../engine/athlete';
import { aiTuning } from '../engine/difficulty';
import { playTone } from '../engine/tone';
import { approach, gameAudio, gameBus, gameCommands, gameInput, requestGameAction } from '@/lib/gameBridge';
import { createRallyKeys, readTennis, type RallyKeys } from './TennisController';
import { planTennis } from './TennisAI';
import {
  TENNIS,
  bounceBall,
  clampPlayer,
  inCourt,
  inServiceBox,
  netFault,
  reachable,
  stepTennis,
  strikeBall,
  type Ball,
  type Side,
} from './TennisPhysics';
import type { ShotName } from '../badminton/BadmintonPhysics';

const WIDTH = 960;
const HEIGHT = 540;

function project(x: number, y: number, z: number): { sx: number; sy: number; scale: number } {
  const t = clamp(z / TENNIS.length, 0, 1);
  const scale = 1.05 - t * 0.62;
  return { sx: WIDTH / 2 + x * 58 * scale, sy: 512 - t * 410 - y * 44 * scale, scale };
}

function scoreName(points: number, advantage: Side | null, side: Side): string {
  if (advantage === side) return 'Ad';
  if (advantage && advantage !== side) return '40';
  return ['0', '15', '30', '40'][Math.min(points, 3)] ?? '40';
}

export class TennisScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private difficulty: Difficulty = 'medium';
  private keys?: RallyKeys;
  private axis = { x: 0, y: 0 };
  private player = { x: 0, z: 1.4 };
  private opponent = { x: 0, z: TENNIS.length - 1.5 };
  private ball: Ball = { x: 0, y: 1.2, z: 1.4, vx: 0, vy: 0, vz: 0 };
  private scores = { player: 0, opponent: 0 };
  private advantage: Side | null = null;
  private server: Side = 'player';
  private hitter: Side = 'player';
  private phase: 'waiting' | 'serve' | 'rally' | 'point' | 'matchover' = 'waiting';
  private paused = false;
  private serving = false;
  private bounces = 0;
  private lock = 0;
  private pointTimer = 0;
  private serveTimer = 0.8;
  private swing = 0;
  private oppSwing = 0;
  private trail: Ball[] = [];
  private audio: AudioContext | null = null;

  constructor() {
    super('tennis');
  }

  init(data: { difficulty?: Difficulty } = {}): void {
    this.difficulty = data.difficulty ?? 'medium';
  }

  create(): void {
    this.graphics = this.add.graphics();
    if (this.input.keyboard) this.keys = createRallyKeys(this.input.keyboard);
    this.publishScore('waiting', 'Ready');
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 32) / 1000;
    for (const command of gameCommands.drain()) {
      if (command === 'start') this.beginServe();
      if (command === 'pause') this.pause();
      if (command === 'restart') this.reset(true);
    }
    const hand = readTennis(this.keys, this.axis, dt);
    if (hand.pause) {
      if (this.paused) requestGameAction('resume');
      else if (this.phase !== 'waiting' && this.phase !== 'matchover') requestGameAction('pause');
    }
    if (hand.restart) requestGameAction('restart');
    if (hand.serve && this.phase === 'waiting') requestGameAction('start');

    this.player.x = approach(this.player.x, hand.moveX * (TENNIS.halfWidth - 0.5), 8, dt);
    this.player.z = approach(this.player.z, clampPlayer(1.5 + hand.moveY * 3.2), 7, dt);
    this.swing = Math.max(0, this.swing - dt * 3);
    this.oppSwing = Math.max(0, this.oppSwing - dt * 3);
    this.lock = Math.max(0, this.lock - dt);
    gameInput.expire(200);

    if (!this.paused && this.phase === 'serve') this.updateServe(hand, dt);
    if (!this.paused && this.phase === 'rally') this.updateRally(hand, dt);
    if (!this.paused && this.phase === 'point') {
      this.pointTimer -= dt;
      if (this.pointTimer <= 0) this.beginServe();
    }
    this.draw(hand.racketAngle);
  }

  private publishScore(phase: 'waiting' | 'serve' | 'playing' | 'paused' | 'matchover', detail: string, winner: Side | null = null): void {
    gameBus.publish({
      player: this.scores.player,
      opponent: this.scores.opponent,
      playerLabel: scoreName(this.scores.player, this.advantage, 'player'),
      opponentLabel: scoreName(this.scores.opponent, this.advantage, 'opponent'),
      phase,
      detail,
      winner,
      speed: Math.round(Math.abs(this.ball.vz)),
    });
  }

  private pause(): void {
    if (this.paused || this.phase === 'waiting' || this.phase === 'matchover') return;
    this.paused = true;
    this.publishScore('paused', 'Paused');
  }

  private reset(start: boolean): void {
    this.scores = { player: 0, opponent: 0 };
    this.advantage = null;
    this.server = 'player';
    this.paused = false;
    if (start) this.beginServe();
    else {
      this.phase = 'waiting';
      this.ball = { x: 0, y: 1.2, z: 1.4, vx: 0, vy: 0, vz: 0 };
      this.publishScore('waiting', 'Ready');
    }
  }

  private beginServe(): void {
    this.phase = 'serve';
    this.paused = false;
    this.serving = true;
    this.bounces = 0;
    this.serveTimer = this.server === 'player' ? 0 : 0.9;
    const holder = this.server === 'player' ? this.player : this.opponent;
    this.ball = { x: holder.x, y: 1.3, z: holder.z, vx: 0, vy: 0, vz: 0 };
    this.hitter = this.server;
    this.trail = [];
    this.publishScore('serve', 'Serve');
  }

  private updateServe(hand: ReturnType<typeof readTennis>, dt: number): void {
    if (this.server === 'player') {
      this.ball = { ...this.ball, x: this.player.x, y: 1.3, z: this.player.z, vx: 0, vy: 0, vz: 0 };
      if (hand.serve || hand.keyShot || gameInput.latest(200)) {
        gameInput.takeLatest(200);
        this.hit('serve', 0.7, hand.racketAngle, 'player');
      }
      return;
    }
    this.ball = { ...this.ball, x: this.opponent.x, y: 1.3, z: this.opponent.z, vx: 0, vy: 0, vz: 0 };
    this.serveTimer -= dt;
    if (this.serveTimer <= 0) this.hit('serve', 0.66, 0, 'opponent');
  }

  private updateRally(hand: ReturnType<typeof readTennis>, dt: number): void {
    const tuning = aiTuning(this.difficulty);
    const plan = planTennis(this.ball, this.difficulty);
    this.opponent.x = approach(this.opponent.x, plan.x, tuning.speed, dt);
    this.opponent.z = approach(this.opponent.z, plan.z, tuning.speed * 0.65, dt);

    if (this.lock <= 0 && this.ball.vz < 2 && reachable(this.ball, this.player.x, this.player.z) && this.ball.z < TENNIS.netZ + 0.4) {
      const gesture = gameInput.latest(200);
      const shot = hand.keyShot ?? mapTennis(gameInput.sample(), gesture).shot;
      if (shot || hand.defend) {
        gameInput.takeLatest(200);
        const kind: ShotName = this.player.z > 6 && shot === 'flick' ? 'flick' : shot === 'smash' ? 'smash' : shot === 'backhand' ? 'backhand' : shot === 'forehand' ? 'forehand' : 'clear';
        this.hit(kind, gesture?.intensity ?? 0.75, hand.racketAngle, 'player');
        return;
      }
    }
    if (this.lock <= 0 && this.ball.vz > -2 && reachable(this.ball, this.opponent.x, this.opponent.z) && this.ball.z > TENNIS.netZ - 0.4) {
      this.hit(plan.attack, 0.7, clamp((this.player.x - this.opponent.x) / 5, -1, 1), 'opponent');
      return;
    }

    const prev = this.ball;
    const next = stepTennis(this.ball, dt);
    if (netFault(prev, next)) {
      this.point(this.hitter === 'player' ? 'opponent' : 'player', 'Net');
      return;
    }
    if (next.y <= 0) {
      const landed = bounceBall(next);
      if (!inCourt(landed) || (this.serving && !inServiceBox(landed, this.server))) {
        this.ball = landed;
        this.point(this.hitter === 'player' ? 'opponent' : 'player', this.serving ? 'Fault' : 'Out');
        return;
      }
      const receiverSide: Side = landed.z > TENNIS.netZ ? 'opponent' : 'player';
      if (receiverSide === this.hitter) {
        this.point(this.hitter === 'player' ? 'opponent' : 'player', 'Out');
        return;
      }
      this.bounces += 1;
      this.serving = false;
      if (this.bounces >= 2) {
        this.point(this.hitter, 'Double bounce');
        return;
      }
      this.ball = landed;
      this.audio = playTone(this.audio, 180, 0.03, gameAudio.muted);
    } else {
      this.ball = next;
    }
    this.trail.unshift(this.ball);
    if (this.trail.length > 10) this.trail.pop();
  }

  private hit(kind: ShotName, intensity: number, angle: number, side: Side): void {
    this.ball = strikeBall(this.ball, kind, intensity, angle, side);
    this.hitter = side;
    this.lock = 0.4;
    this.bounces = 0;
    this.phase = 'rally';
    if (side === 'player') this.swing = 1;
    else this.oppSwing = 1;
    const label = kind === 'flick' ? 'Volley' : kind === 'smash' ? 'Smash' : kind === 'backhand' ? 'Backhand' : kind === 'forehand' ? 'Forehand' : kind === 'serve' ? 'Serve' : 'Drive';
    this.publishScore('playing', label);
    this.audio = playTone(this.audio, kind === 'smash' ? 300 : 220, 0.05, gameAudio.muted);
    if (kind === 'smash') this.cameras.main.shake(70, 0.003);
  }

  private point(scorer: Side, reason: string): void {
    if (this.scores.player >= 3 && this.scores.opponent >= 3) {
      if (this.advantage === scorer) {
        this.scores[scorer] += 1;
        this.win(scorer, reason);
        return;
      }
      this.advantage = this.advantage && this.advantage !== scorer ? null : scorer;
    } else {
      this.scores[scorer] += 1;
      const other = scorer === 'player' ? this.scores.opponent : this.scores.player;
      if (this.scores[scorer] >= 4 && this.scores[scorer] - other >= 2) {
        this.win(scorer, reason);
        return;
      }
    }
    this.server = scorer === 'player' ? 'opponent' : 'player';
    this.phase = 'point';
    this.pointTimer = 0.95;
    this.trail = [];
    this.publishScore('playing', reason);
    this.audio = playTone(this.audio, scorer === 'player' ? 520 : 160, 0.08, gameAudio.muted);
  }

  private win(scorer: Side, reason: string): void {
    this.phase = 'matchover';
    this.publishScore('matchover', reason, scorer);
    this.audio = playTone(this.audio, scorer === 'player' ? 680 : 140, 0.2, gameAudio.muted);
  }

  private draw(angle: number): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(0x07080d, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    const corners = [
      project(-TENNIS.halfWidth, 0, 0),
      project(TENNIS.halfWidth, 0, 0),
      project(TENNIS.halfWidth, 0, TENNIS.length),
      project(-TENNIS.halfWidth, 0, TENNIS.length),
    ];
    g.fillStyle(0x2f7a45, 1);
    g.beginPath();
    g.moveTo(corners[0].sx, corners[0].sy);
    corners.slice(1).forEach((corner) => g.lineTo(corner.sx, corner.sy));
    g.closePath();
    g.fillPath();
    g.lineStyle(3, 0xf4f1ea, 0.92);
    g.strokePath();
    this.line(-TENNIS.halfWidth, TENNIS.length - TENNIS.serviceZ, TENNIS.halfWidth, TENNIS.length - TENNIS.serviceZ);
    this.line(-TENNIS.halfWidth, TENNIS.serviceZ, TENNIS.halfWidth, TENNIS.serviceZ);
    this.line(0, 1, 0, TENNIS.length - TENNIS.serviceZ);
    this.line(0, TENNIS.serviceZ, 0, TENNIS.length - 1);

    const netL = project(-5.5, 0, TENNIS.netZ);
    const netR = project(5.5, 0, TENNIS.netZ);
    const topL = project(-5.5, TENNIS.netHeight, TENNIS.netZ);
    const topR = project(5.5, TENNIS.netHeight, TENNIS.netZ);
    g.fillStyle(0xd5deea, 0.28);
    g.beginPath();
    g.moveTo(netL.sx, netL.sy);
    g.lineTo(topL.sx, topL.sy);
    g.lineTo(topR.sx, topR.sy);
    g.lineTo(netR.sx, netR.sy);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, 0xf4f1ea, 0.8);
    g.strokePath();

    const opp = project(this.opponent.x, 0, this.opponent.z);
    const you = project(this.player.x, 0, this.player.z);
    drawAthlete(g, opp.sx, opp.sy, opp.scale, 0xe7edf5, this.oppSwing, 0, -1);
    drawAthlete(g, you.sx, you.sy, you.scale, 0x3ec6ff, this.swing, angle, 1);

    this.trail.forEach((point, index) => {
      const mapped = project(point.x, point.y, point.z);
      g.fillStyle(0xc6f54e, (1 - index / this.trail.length) * 0.25);
      g.fillCircle(mapped.sx, mapped.sy, 4 * mapped.scale);
    });
    const ball = project(this.ball.x, Math.max(this.ball.y, 0), this.ball.z);
    const shadow = project(this.ball.x, 0, this.ball.z);
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(shadow.sx, shadow.sy, 16 * shadow.scale, 6 * shadow.scale);
    g.fillStyle(0xd6f25c, 1);
    g.fillCircle(ball.sx, ball.sy, 6 * ball.scale);
    g.lineStyle(1.5, 0xf4f1ea, 0.8);
    g.strokeCircle(ball.sx, ball.sy, 6 * ball.scale);
  }

  private line(x1: number, z1: number, x2: number, z2: number): void {
    const a = project(x1, 0, z1);
    const b = project(x2, 0, z2);
    this.graphics.lineStyle(2, 0xf4f1ea, 0.75);
    this.graphics.beginPath();
    this.graphics.moveTo(a.sx, a.sy);
    this.graphics.lineTo(b.sx, b.sy);
    this.graphics.strokePath();
  }
}
