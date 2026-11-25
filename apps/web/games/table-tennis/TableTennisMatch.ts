import type { Difficulty } from '@motionplay/shared';
import { clamp } from '@motionplay/shared';
import { approach, gameBus, gameCommands, requestGameAction, type MatchPhase } from '@/lib/gameBridge';
import { createOpponent, opponentStrike, trackOpponent, type OpponentAnim, type OpponentState } from './TableTennisAI';
import { getTableAudio, type TableSound } from './TableTennisAudio';
import { createTableInput, type TableInput } from './TableTennisController';
import {
  TABLE,
  STRIKE_REACH,
  canStrike,
  emptyFacts,
  onBounce,
  ruleDead,
  ruleNet,
  serveStrike,
  serverFor,
  stepTableTennis,
  strike,
  tossBall,
  winnerOf,
  type Ball,
  type RallyFacts,
  type Ruling,
  type Side,
  type TableShot,
} from './TableTennisPhysics';

export interface TableFrame {
  ball: Ball;
  trail: Array<{ x: number; y: number; z: number }>;
  playerX: number;
  playerY: number;
  playerAngle: number;
  strokeKind: TableShot | null;
  strokeAge: number;
  opponentX: number;
  opponentAnim: OpponentAnim;
  opponentSwing: number;
  opponentHand: 'forehand' | 'backhand';
  impact: number;
  phase: MatchPhase;
}

interface PendingSwing {
  kind: TableShot;
  intensity: number;
  age: number;
}

export class TableTennisMatch {
  readonly frame: TableFrame;
  private readonly input: ReturnType<typeof createTableInput>;
  private readonly opponent: OpponentState;
  private ball: Ball;
  private prevBall: Ball;
  private facts: RallyFacts = emptyFacts('rally', 'player');
  private phase: MatchPhase = 'waiting';
  private paused = false;
  private scores = { player: 0, opponent: 0 };
  private server: Side = 'player';
  private aimX = 0;
  private angle = 0;
  private height = 0;
  private serveClock = 0;
  private pointClock = 0;
  private cooldown = 0;
  private still = 0;
  private time = 0;
  private justSwung = false;
  private pending: PendingSwing | null = null;

  constructor(private readonly difficulty: Difficulty) {
    this.opponent = createOpponent();
    this.ball = tossBall('player', 0);
    this.prevBall = this.ball;
    this.input = createTableInput();
    this.frame = {
      ball: this.ball,
      trail: [],
      playerX: 0,
      playerY: 0,
      playerAngle: 0,
      strokeKind: null,
      strokeAge: 1,
      opponentX: 0,
      opponentAnim: 'ready',
      opponentSwing: 0,
      opponentHand: 'forehand',
      impact: 0,
      phase: 'waiting',
    };
    this.publish({
      player: 0,
      opponent: 0,
      phase: 'waiting',
      winner: null,
      speed: 0,
      detail: 'Ready',
      server: 'player',
      playerLabel: '',
      opponentLabel: '',
    });
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.justSwung) this.frame.strokeAge += dt;
    this.justSwung = false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.frame.impact = Math.max(0, this.frame.impact - dt * 2.6);

    for (const command of gameCommands.drain()) {
      if (command === 'start') this.start();
      if (command === 'pause') this.pause();
      if (command === 'restart') this.restart();
    }

    const input = this.input.read(dt);
    this.aimX = approach(this.aimX, clamp(input.moveX, -1, 1) * (TABLE.halfWidth - 0.05), 9.5, dt);
    this.angle = input.racketAngle;
    this.height = input.moveY;
    if (input.pause) {
      if (this.paused) requestGameAction('resume');
      else if (this.phase === 'playing' || this.phase === 'serve' || this.phase === 'point') requestGameAction('pause');
    }
    if (input.restart) requestGameAction('restart');
    if (!this.paused) this.playInput(input);

    if (!this.paused && this.phase === 'serve' && this.server === 'opponent') {
      this.serveClock -= dt;
      this.opponent.anim = 'forehand-prep';
      this.opponent.hand = 'forehand';
      if (this.serveClock <= 0) {
        this.opponent.swinging = true;
        this.opponent.swing = 0;
        this.opponent.anim = 'forehand';
        this.hitServe('opponent', 0.55 + Math.random() * 0.18, (Math.random() - 0.5) * 0.28, (Math.random() - 0.5) * 0.18);
      }
    }

    if (!this.paused && (this.phase === 'waiting' || this.phase === 'serve')) {
      const side: Side = this.phase === 'waiting' ? 'player' : this.server;
      const x = side === 'player' ? this.aimX : this.opponent.x;
      this.ball = tossBall(side, x);
      this.ball.y += Math.sin(this.time * 3.2) * 0.02;
      this.frame.trail.length = 0;
    }

    if (this.pending && this.phase !== 'playing') {
      this.pending.age += dt;
      if (this.pending.age > 0.45) this.pending = null;
    }

    if (!this.paused && this.phase === 'playing') {
      trackOpponent(
        this.opponent,
        { ball: this.ball, hitter: this.facts.hitter, bounces: this.facts.bounces, flight: this.facts.flight, difficulty: this.difficulty },
        dt,
      );
      this.simulate(dt);
      this.tryPendingContact();
    }

    if (!this.paused && this.phase === 'point') {
      this.pointClock -= dt;
      if (this.pointClock <= 0) this.beginServe();
    }

    if (this.phase === 'playing') {
      this.frame.trail.push({ x: this.ball.x, y: this.ball.y, z: this.ball.z });
      if (this.frame.trail.length > 16) this.frame.trail.shift();
    }

    this.frame.ball = this.ball;
    this.frame.playerX = this.aimX;
    this.frame.playerY = this.height;
    this.frame.playerAngle = this.angle;
    this.frame.opponentX = this.opponent.x;
    this.frame.opponentAnim = this.opponent.anim;
    this.frame.opponentSwing = this.opponent.swing;
    this.frame.opponentHand = this.opponent.hand;
    this.frame.phase = this.paused ? 'paused' : this.phase;
  }

  dispose(): void {
    this.input.dispose();
  }

  private playInput(input: TableInput): void {
    if ((input.serve || input.shot) && this.phase === 'waiting') {
      requestGameAction('start');
      return;
    }
    if (this.cooldown > 0) return;
    if (this.phase === 'serve' && this.server === 'player' && (input.serve || input.shot)) {
      this.beginStroke(input.shot ?? 'forehand');
      this.hitServe('player', Math.max(0.45, input.intensity || 0.6), this.angle, 0);
      return;
    }
    if (input.shot && this.phase === 'playing') {
      this.beginStroke(input.shot);
      this.pending = { kind: input.shot, intensity: Math.max(0.4, input.intensity || 0.7), age: 0 };
      if (!this.tryPendingContact()) getTableAudio().play('swish');
    }
  }

  private tryPendingContact(): boolean {
    if (!this.pending || this.phase !== 'playing') return false;
    if (this.facts.hitter === 'player') return false;
    const ready =
      canStrike(this.ball, this.aimX, 'player', true, this.facts.bounces) ||
      canStrike(this.prevBall, this.aimX, 'player', true, this.facts.bounces);
    if (!ready) {
      if (this.pending.age > 0.45) this.pending = null;
      return false;
    }
    const swing = this.pending;
    this.pending = null;
    this.hitReturn(swing.kind, swing.intensity);
    return true;
  }

  private simulate(dt: number): void {
    let left = dt;
    while (left > 0 && this.phase === 'playing') {
      const stepDt = Math.min(1 / 120, left);
      left -= stepDt;
      if (this.pending) {
        this.pending.age += stepDt;
        if (this.pending.age > 0.45) this.pending = null;
      }
      this.prevBall = this.ball;
      const step = stepTableTennis(this.ball, stepDt);
      this.ball = step.ball;
      if (step.letClip) this.facts.letClip = true;
      if (step.event === 'net') {
        this.thump('net', 0.35);
        if (this.apply(ruleNet(this.facts))) return;
      } else if (step.event === 'table' && step.side) {
        this.thump('bounce', step.side === 'player' ? 0.5 : 0.22);
        const bounced = onBounce(this.facts, step.side);
        this.facts = bounced.facts;
        if (this.apply(bounced.ruling)) return;
        if (this.tryPendingContact()) return;
      } else if (step.event === 'floor') {
        if (this.apply(ruleDead(this.facts))) return;
      }
      if (this.outOfPlay(this.ball) || this.resting(this.ball, stepDt)) {
        if (this.apply(ruleDead(this.facts))) return;
      }
      if (this.tryPendingContact()) return;
      const reply = opponentStrike(this.opponent, {
        ball: this.ball,
        hitter: this.facts.hitter,
        bounces: this.facts.bounces,
        flight: this.facts.flight,
        difficulty: this.difficulty,
      });
      if (reply) {
        this.ball = strike(this.ball, reply);
        this.facts = emptyFacts('rally', 'opponent');
        this.still = 0;
        this.thump('hit', 0.48);
        this.publish({ detail: 'Return', phase: 'playing', speed: pace(this.ball), winner: null });
      }
    }
  }

  private hitReturn(kind: TableShot, intensity: number): void {
    const aimError = clamp((this.ball.x - this.aimX) / STRIKE_REACH, -1, 1);
    this.ball = strike(this.ball, {
      kind,
      intensity: Math.max(0.35, intensity),
      angle: this.angle,
      aimError,
      height: clamp(0.45 + this.height * 0.4, 0.08, 1),
      side: 'player',
    });
    this.facts = emptyFacts('rally', 'player');
    this.still = 0;
    this.thump('hit', 1);
    this.publish({ detail: shotLabel(kind), phase: 'playing', speed: pace(this.ball), winner: null });
  }

  private hitServe(side: Side, intensity: number, angle: number, aimError: number): void {
    const x = side === 'player' ? this.aimX : this.opponent.x;
    this.ball = serveStrike(tossBall(side, x), {
      kind: 'forehand',
      intensity,
      angle,
      aimError,
      height: side === 'player' ? clamp(0.4 + this.height * 0.2, 0, 1) : 0.4,
      side,
    });
    this.facts = emptyFacts('serve', side);
    this.phase = 'playing';
    this.still = 0;
    this.pending = null;
    this.frame.trail.length = 0;
    this.thump(side === 'player' ? 'hit' : 'serve', 0.7);
    this.publish({ phase: 'playing', detail: 'Serve', server: side, winner: null, speed: pace(this.ball) });
  }

  private beginServe(): void {
    if (winnerOf(this.scores.player, this.scores.opponent)) return;
    this.server = serverFor(this.scores.player, this.scores.opponent);
    this.phase = 'serve';
    this.paused = false;
    this.serveClock = this.server === 'opponent' ? 0.75 : 0;
    this.opponent.swing = 0;
    this.opponent.swinging = false;
    this.opponent.live = false;
    this.opponent.anim = this.server === 'opponent' ? 'forehand-prep' : 'ready';
    this.pending = null;
    this.ball = tossBall(this.server, this.server === 'player' ? this.aimX : this.opponent.x);
    this.frame.trail.length = 0;
    const deuce = this.scores.player >= 10 && this.scores.opponent >= 10 && this.scores.player === this.scores.opponent;
    const detail = deuce ? 'Deuce' : this.server === 'player' ? 'Your serve' : 'Opponent serve';
    this.publish({ phase: 'serve', detail, server: this.server, winner: null });
  }

  private apply(ruling: Ruling): boolean {
    if (ruling.result === 'play') return false;
    if (ruling.result === 'let') {
      getTableAudio().play('net');
      this.phase = 'serve';
      this.serveClock = this.server === 'opponent' ? 0.7 : 0;
      this.pending = null;
      this.ball = tossBall(this.server, this.server === 'player' ? this.aimX : this.opponent.x);
      this.publish({ phase: 'serve', detail: 'Let', server: this.server, winner: null });
      return true;
    }
    this.award(ruling.winner ?? otherWinner(this.facts.hitter), ruling.reason);
    return true;
  }

  private award(winner: Side, reason: string): void {
    this.scores[winner] += 1;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
    this.pending = null;
    this.opponent.swinging = false;
    this.opponent.swing = 1;
    this.opponent.anim = winner === 'opponent' ? 'win' : 'lose';
    const match = winnerOf(this.scores.player, this.scores.opponent);
    if (match) {
      this.phase = 'matchover';
      this.publish({
        player: this.scores.player,
        opponent: this.scores.opponent,
        phase: 'matchover',
        winner: match,
        detail: match === 'player' ? 'You won' : 'Opponent won',
      });
      getTableAudio().play(match === 'player' ? 'matchWin' : 'matchLose');
      return;
    }
    this.phase = 'point';
    this.pointClock = 1.05;
    this.publish({
      player: this.scores.player,
      opponent: this.scores.opponent,
      phase: 'point',
      winner: null,
      detail: pointBanner(winner, reason),
    });
    getTableAudio().play(winner === 'player' ? 'point' : 'lose');
  }

  private start(): void {
    if (this.phase === 'matchover') return;
    if (this.paused) {
      this.paused = false;
      const detail = this.phase === 'serve' ? (this.server === 'player' ? 'Your serve' : 'Opponent serve') : 'Rally';
      this.publish({ phase: this.phase, detail, winner: null });
      return;
    }
    if (this.phase === 'waiting') this.beginServe();
  }

  private pause(): void {
    if (this.paused || this.phase === 'waiting' || this.phase === 'matchover') return;
    this.paused = true;
    this.publish({ phase: 'paused', detail: 'Paused', winner: null });
  }

  private restart(): void {
    this.scores = { player: 0, opponent: 0 };
    this.paused = false;
    this.opponent.x = 0;
    this.opponent.targetX = 0;
    this.opponent.live = false;
    this.aimX = 0;
    this.pending = null;
    this.publish({ player: 0, opponent: 0, winner: null, speed: 0, server: 'player', detail: 'Your serve' });
    getTableAudio().play('ui');
    this.beginServe();
  }

  private beginStroke(kind: TableShot): void {
    this.frame.strokeKind = kind;
    this.frame.strokeAge = 0;
    this.justSwung = true;
    this.cooldown = 0.18;
  }

  private thump(kind: TableSound, impact: number): void {
    this.frame.impact = Math.max(this.frame.impact, impact);
    getTableAudio().play(kind, impact);
  }

  private outOfPlay(ball: Ball): boolean {
    return ball.y > 2.7 || Math.abs(ball.x) > 2.4 || ball.z > TABLE.halfLength + 1.25 || ball.z < -TABLE.halfLength - 1.25;
  }

  private resting(ball: Ball, dt: number): boolean {
    const slow =
      Math.abs(ball.x) <= TABLE.halfWidth &&
      Math.abs(ball.z) <= TABLE.halfLength &&
      ball.y < TABLE.surfaceY + 0.08 &&
      Math.hypot(ball.vx, ball.vz) < 0.22 &&
      Math.abs(ball.vy) < 0.35;
    this.still = slow ? this.still + dt : 0;
    return this.still > 0.55;
  }

  private publish(partial: Parameters<typeof gameBus.publish>[0]): void {
    this.frame.phase = this.paused ? 'paused' : this.phase;
    gameBus.publish(partial);
  }
}

function pace(ball: Ball): number {
  return Math.round(Math.hypot(ball.vx, ball.vy, ball.vz) * 10) / 10;
}

function shotLabel(kind: TableShot): string {
  if (kind === 'backhand') return 'Backhand';
  if (kind === 'smash') return 'Smash';
  if (kind === 'flick') return 'Push';
  return 'Forehand';
}

function pointBanner(winner: Side, reason: string): string {
  if (reason === 'Net') return winner === 'player' ? 'Net · You score' : 'Net · Opponent scores';
  if (reason === 'Fault') return winner === 'player' ? 'Fault · You score' : 'Fault · Opponent scores';
  if (reason === 'Out') return winner === 'player' ? 'Out · You score' : 'Out · Opponent scores';
  if (reason === 'Double bounce') return winner === 'player' ? 'Double bounce · You score' : 'Double bounce · Opponent scores';
  return winner === 'player' ? 'You score' : 'Opponent scores';
}

function otherWinner(hitter: Side): Side {
  return hitter === 'player' ? 'opponent' : 'player';
}
