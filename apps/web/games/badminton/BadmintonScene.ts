import Phaser from 'phaser';
import type { Difficulty } from '@motionplay/shared';
import { clamp } from '@motionplay/shared';
import { mapBadminton } from '@motionplay/controller-engine';
import { drawAthlete } from '../engine/athlete';
import { aiTuning } from '../engine/difficulty';
import { playTone } from '../engine/tone';
import { approach, gameAudio, gameBus, gameCommands, gameInput, requestGameAction } from '@/lib/gameBridge';
import { planOpponent, type OpponentPlan } from './BadmintonAI';
import { createRallyKeys, readHand, type RallyKeys } from './BadmintonController';
import {
  COURT,
  evaluateFlight,
  hitQuality,
  inReach,
  stepShuttle,
  strikeShuttle,
  type ShotName,
  type Shuttle,
  type Side,
} from './BadmintonPhysics';

const WIDTH = 960;
const HEIGHT = 540;

interface Spark {
  x: number;
  y: number;
  life: number;
  color: number;
}

function project(x: number, y: number, z: number): { sx: number; sy: number; scale: number } {
  const t = clamp(z / COURT.length, 0, 1);
  const scale = 1.08 - t * 0.64;
  return {
    sx: WIDTH / 2 + x * 92 * scale,
    sy: 508 - t * 400 - y * 46 * scale,
    scale,
  };
}

function held(x: number, z: number): Shuttle {
  return { x, y: 1.15, z, vx: 0, vy: 0, vz: 0 };
}

export class BadmintonScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private difficulty: Difficulty = 'medium';
  private keys?: RallyKeys;
  private axis = { x: 0, y: 0 };
  private player = { x: 0, z: 1.35 };
  private opponent = { x: 0, z: COURT.length - 1.3 };
  private shuttle = held(0, 1.35);
  private hitter: Side = 'player';
  private server: Side = 'player';
  private scores = { player: 0, opponent: 0 };
  private phase: 'waiting' | 'serve' | 'rally' | 'point' | 'matchover' = 'waiting';
  private paused = false;
  private lock = 0;
  private pointTimer = 0;
  private serveTimer = 0.7;
  private swing = 0;
  private oppSwing = 0;
  private trail: Array<{ x: number; y: number; z: number }> = [];
  private sparks: Spark[] = [];
  private plan: OpponentPlan = { aimX: 0, attack: 'clear' };
  private audio: AudioContext | null = null;
  private message = 'Hold a shot until the shuttle is in reach';

  constructor() {
    super('badminton');
  }

  init(data: { difficulty?: Difficulty } = {}): void {
    this.difficulty = data.difficulty ?? 'medium';
  }

  create(): void {
    this.graphics = this.add.graphics();
    if (this.input.keyboard) this.keys = createRallyKeys(this.input.keyboard);
    this.resetMatch(false);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 32) / 1000;
    this.consumeCommands();
    const command = readHand(this.keys, this.axis, dt);
    if (command.pause) {
      if (this.paused) requestGameAction('resume');
      else if (this.phase === 'rally' || this.phase === 'serve' || this.phase === 'point') requestGameAction('pause');
    }
    if (command.restart) requestGameAction('restart');
    if (command.serve && this.phase === 'waiting') requestGameAction('start');

    this.player.x = approach(this.player.x, command.moveX * (COURT.halfWidth - 0.45), 7.5, dt);
    this.player.z = approach(this.player.z, clamp(1.15 + command.moveY * 1.7, 0.55, 4.6), 6.2, dt);
    this.swing = Math.max(0, this.swing - dt * 3.2);
    this.oppSwing = Math.max(0, this.oppSwing - dt * 3.2);
    this.lock = Math.max(0, this.lock - dt);
    gameInput.expire(200);

    if (!this.paused && this.phase === 'serve') this.updateServe(command, dt);
    if (!this.paused && this.phase === 'rally') this.updateRally(command, dt);
    if (!this.paused && this.phase === 'point') {
      this.pointTimer -= dt;
      if (this.pointTimer <= 0) this.beginServe();
    }
    this.sparks = this.sparks.filter((spark) => {
      spark.life -= dt;
      spark.y -= 18 * dt;
      return spark.life > 0;
    });
    this.draw(command.racketAngle);
  }

  private consumeCommands(): void {
    for (const command of gameCommands.drain()) {
      if (command === 'start') this.beginServe();
      if (command === 'pause') this.pause();
      if (command === 'restart') this.resetMatch(true);
    }
  }

  private pause(): void {
    if (this.paused || this.phase === 'waiting' || this.phase === 'matchover') return;
    this.paused = true;
    gameBus.publish({ phase: 'paused', detail: 'Paused' });
  }

  private resetMatch(start: boolean): void {
    this.scores = { player: 0, opponent: 0 };
    this.server = 'player';
    this.paused = false;
    this.player = { x: 0, z: 1.35 };
    this.opponent = { x: 0, z: COURT.length - 1.3 };
    gameBus.publish({ player: 0, opponent: 0, winner: null, speed: 0, detail: '' });
    if (start) this.beginServe();
    else {
      this.phase = 'waiting';
      this.shuttle = held(0, 1.35);
      gameBus.publish({ phase: 'waiting', detail: 'Ready' });
    }
  }

  private beginServe(): void {
    this.phase = 'serve';
    this.paused = false;
    this.trail = [];
    this.serveTimer = this.server === 'player' ? 0 : 0.85;
    const holder = this.server === 'player' ? this.player : this.opponent;
    this.shuttle = held(holder.x, holder.z);
    this.hitter = this.server;
    this.message = this.server === 'player' ? 'Tap the phone or press Space to serve' : 'Opponent serving';
    gameBus.publish({ phase: 'serve', detail: 'Serve', winner: null });
  }

  private updateServe(command: ReturnType<typeof readHand>, dt: number): void {
    if (this.server === 'player') {
      this.shuttle = held(this.player.x, this.player.z);
      const gesture = gameInput.latest(200);
      if (command.serve || command.keyShot || gesture) {
        gameInput.takeLatest(200);
        this.launch('serve', command.serve ? 0.55 : (gesture?.intensity ?? 0.7), command.racketAngle, 'player');
      }
      return;
    }
    this.shuttle = held(this.opponent.x, this.opponent.z);
    this.serveTimer -= dt;
    if (this.serveTimer <= 0) this.launch('serve', 0.6, 0, 'opponent');
  }

  private updateRally(command: ReturnType<typeof readHand>, dt: number): void {
    const tuning = aiTuning(this.difficulty);
    const desired = planOpponent(this.shuttle, this.difficulty, this.plan);
    this.plan = desired.plan;
    this.opponent.x = approach(this.opponent.x, desired.x, tuning.speed, dt);
    this.opponent.z = approach(this.opponent.z, desired.z, tuning.speed * 0.72, dt);

    if (this.lock <= 0 && this.shuttle.z < COURT.netZ && this.shuttle.vz < 2) {
      const gesture = gameInput.latest(200);
      const mapped = mapBadminton(gameInput.sample(), gesture);
      const shot = command.keyShot ?? mapped.shot;
      if ((shot || command.defend) && inReach(this.shuttle, this.player.x, this.player.z)) {
        gameInput.takeLatest(200);
        const kind: ShotName = command.defend && !shot ? 'clear' : (shot ?? 'clear');
        this.launch(kind, command.defend && !shot ? 0.35 : (gesture?.intensity ?? 0.8), command.racketAngle, 'player');
      }
    } else if (this.lock <= 0 && this.shuttle.z > COURT.netZ && this.shuttle.vz > -2 && inReach(this.shuttle, this.opponent.x, this.opponent.z, 1.35)) {
      this.launch(this.plan.attack, this.difficulty === 'hard' ? 0.82 : 0.62, clamp((this.player.x - this.opponent.x) / 4, -1, 1), 'opponent');
    }

    const prev = this.shuttle;
    const next = stepShuttle(this.shuttle, dt);
    const event = evaluateFlight(prev, next, this.hitter);
    if (event.type === 'net') {
      this.finishPoint(this.hitter === 'player' ? 'opponent' : 'player', 'Net');
      return;
    }
    if (event.type === 'land') {
      this.shuttle = { ...next, y: 0, vx: 0, vy: 0, vz: 0 };
      this.finishPoint(event.hitterScores ? this.hitter : this.hitter === 'player' ? 'opponent' : 'player', event.hitterScores ? 'In' : 'Out');
      return;
    }
    this.shuttle = next;
    this.trail.unshift({ x: next.x, y: next.y, z: next.z });
    if (this.trail.length > 8) this.trail.pop();
    gameBus.publish({ speed: Math.round(Math.hypot(next.vx, next.vy, next.vz) * 10) / 10 });
  }

  private launch(kind: ShotName, intensity: number, angle: number, side: Side): void {
    const quality = hitQuality(this.shuttle.y);
    this.shuttle = strikeShuttle(this.shuttle, kind, intensity, quality, angle, side);
    this.hitter = side;
    this.lock = 0.42;
    this.phase = 'rally';
    if (side === 'player') this.swing = 1;
    else this.oppSwing = 1;
    this.flash(side === 'player' ? this.player.x : this.opponent.x, side === 'player' ? this.player.z : this.opponent.z, kind === 'smash' ? 0xffd166 : 0xf4f1ea);
    this.message = kind === 'smash' ? 'Smash' : kind === 'backhand' ? 'Backhand' : kind === 'forehand' ? 'Forehand' : kind === 'flick' ? 'Drop' : 'Clear';
    gameBus.publish({ phase: 'playing', detail: this.message, speed: Math.round(Math.abs(this.shuttle.vz)) });
    this.audio = playTone(this.audio, kind === 'smash' ? 620 : 440, 0.05, gameAudio.muted);
    if (kind === 'smash') this.cameras.main.shake(70, 0.003);
  }

  private finishPoint(scorer: Side, reason: string): void {
    this.scores[scorer] += 1;
    const winner = this.won(scorer) ? scorer : null;
    this.trail = [];
    gameBus.publish({ player: this.scores.player, opponent: this.scores.opponent });
    if (winner) {
      this.phase = 'matchover';
      gameBus.publish({ phase: 'matchover', winner, detail: reason });
      this.audio = playTone(this.audio, winner === 'player' ? 720 : 180, 0.2, gameAudio.muted);
      return;
    }
    this.server = scorer === 'player' ? 'opponent' : 'player';
    this.phase = 'point';
    this.pointTimer = 0.9;
    gameBus.publish({ phase: 'playing', detail: reason });
    this.audio = playTone(this.audio, scorer === 'player' ? 640 : 220, 0.07, gameAudio.muted);
  }

  private won(scorer: Side): boolean {
    const score = this.scores[scorer];
    const other = scorer === 'player' ? this.scores.opponent : this.scores.player;
    return score >= 15 || (score >= 11 && score - other >= 2);
  }

  private flash(x: number, z: number, color: number): void {
    const point = project(x, 1.2, z);
    for (let i = 0; i < 8; i += 1) this.sparks.push({ x: point.sx + (Math.random() - 0.5) * 24, y: point.sy, life: 0.28, color });
  }

  private draw(racketAngle: number): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(0x07080d, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x10182a, 1);
    g.fillRect(0, 70, WIDTH, HEIGHT);

    const corners = [
      project(-COURT.halfWidth, 0, 0),
      project(COURT.halfWidth, 0, 0),
      project(COURT.halfWidth, 0, COURT.length),
      project(-COURT.halfWidth, 0, COURT.length),
    ];
    g.fillStyle(0x1f6b45, 1);
    g.beginPath();
    g.moveTo(corners[0].sx, corners[0].sy);
    corners.slice(1).forEach((corner) => g.lineTo(corner.sx, corner.sy));
    g.closePath();
    g.fillPath();
    g.lineStyle(3, 0xf4f1ea, 0.9);
    g.strokePath();

    this.courtLine(-COURT.halfWidth, COURT.netZ, COURT.halfWidth, COURT.netZ, 0xf4f1ea, 0.35);
    const serviceNear = COURT.netZ - 1.98;
    const serviceFar = COURT.netZ + 1.98;
    this.courtLine(-COURT.halfWidth, serviceNear, COURT.halfWidth, serviceNear, 0xf4f1ea, 0.55);
    this.courtLine(-COURT.halfWidth, serviceFar, COURT.halfWidth, serviceFar, 0xf4f1ea, 0.55);
    this.courtLine(0, serviceNear, 0, 0.7, 0xf4f1ea, 0.4);
    this.courtLine(0, serviceFar, 0, COURT.length - 0.7, 0xf4f1ea, 0.4);

    const netLeft = project(-3.05, 0, COURT.netZ);
    const netRight = project(3.05, 0, COURT.netZ);
    const netTopL = project(-3.05, COURT.netHeight, COURT.netZ);
    const netTopR = project(3.05, COURT.netHeight, COURT.netZ);
    g.lineStyle(2, 0xd7deea, 0.8);
    g.beginPath();
    g.moveTo(netLeft.sx, netLeft.sy);
    g.lineTo(netTopL.sx, netTopL.sy);
    g.lineTo(netTopR.sx, netTopR.sy);
    g.lineTo(netRight.sx, netRight.sy);
    g.strokePath();
    g.lineStyle(1, 0xd7deea, 0.35);
    for (let i = 1; i < 8; i += 1) {
      const x = -3.05 + (6.1 * i) / 8;
      const foot = project(x, 0, COURT.netZ);
      const top = project(x, COURT.netHeight, COURT.netZ);
      g.beginPath();
      g.moveTo(foot.sx, foot.sy);
      g.lineTo(top.sx, top.sy);
      g.strokePath();
    }

    const opp = project(this.opponent.x, 0, this.opponent.z);
    const you = project(this.player.x, 0, this.player.z);
    drawAthlete(g, opp.sx, opp.sy, opp.scale * 0.92, 0xe7edf5, this.oppSwing, 0, -1);
    drawAthlete(g, you.sx, you.sy, you.scale, 0x8d7bff, this.swing, racketAngle, 1);

    this.trail.forEach((point, index) => {
      const mapped = project(point.x, point.y, point.z);
      g.fillStyle(0xf7f4ea, (1 - index / this.trail.length) * 0.28);
      g.fillCircle(mapped.sx, mapped.sy, 4 * mapped.scale);
    });
    const bird = project(this.shuttle.x, Math.max(this.shuttle.y, 0), this.shuttle.z);
    const shadow = project(this.shuttle.x, 0, this.shuttle.z);
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(shadow.sx, shadow.sy, 14 * shadow.scale, 6 * shadow.scale);
    this.drawShuttle(bird.sx, bird.sy, bird.scale);

    for (const spark of this.sparks) {
      g.fillStyle(spark.color, Math.min(1, spark.life * 3));
      g.fillCircle(spark.x, spark.y, 3);
    }
  }

  private courtLine(x1: number, z1: number, x2: number, z2: number, color: number, alpha: number): void {
    const a = project(x1, 0, z1);
    const b = project(x2, 0, z2);
    this.graphics.lineStyle(2, color, alpha);
    this.graphics.beginPath();
    this.graphics.moveTo(a.sx, a.sy);
    this.graphics.lineTo(b.sx, b.sy);
    this.graphics.strokePath();
  }

  private drawShuttle(x: number, y: number, scale: number): void {
    const g = this.graphics;
    const s = Math.max(0.45, scale);
    g.fillStyle(0xf7f4ea, 0.95);
    g.fillTriangle(x, y - 12 * s, x - 7 * s, y + 2 * s, x + 7 * s, y + 2 * s);
    g.fillStyle(0xf2f6fb, 0.55);
    g.fillTriangle(x, y - 12 * s, x - 4 * s, y, x + 4 * s, y);
    g.fillStyle(0xd7c4a3, 1);
    g.fillCircle(x, y + 3 * s, 3.2 * s);
  }
}
