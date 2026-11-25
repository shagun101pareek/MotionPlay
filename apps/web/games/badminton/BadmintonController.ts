import Phaser from 'phaser';
import { mapBadminton, type ShotKind } from '@motionplay/controller-engine';
import { axisFromKeys, gameInput } from '@/lib/gameBridge';

export interface RallyKeys {
  LEFT: Phaser.Input.Keyboard.Key;
  RIGHT: Phaser.Input.Keyboard.Key;
  UP: Phaser.Input.Keyboard.Key;
  DOWN: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  W: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  J: Phaser.Input.Keyboard.Key;
  K: Phaser.Input.Keyboard.Key;
  L: Phaser.Input.Keyboard.Key;
  U: Phaser.Input.Keyboard.Key;
  SPACE: Phaser.Input.Keyboard.Key;
  P: Phaser.Input.Keyboard.Key;
  R: Phaser.Input.Keyboard.Key;
  SHIFT: Phaser.Input.Keyboard.Key;
}

export interface HandCommand {
  moveX: number;
  moveY: number;
  racketAngle: number;
  defend: boolean;
  serve: boolean;
  pause: boolean;
  restart: boolean;
  keyShot: ShotKind | null;
}

export function createRallyKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): RallyKeys {
  keyboard.addCapture(['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'A', 'D', 'W', 'S', 'J', 'K', 'L', 'U', 'P', 'R', 'SHIFT']);
  return keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,J,K,L,U,SPACE,P,R,SHIFT') as RallyKeys;
}

export function readHand(keys: RallyKeys | undefined, axis: { x: number; y: number }, dt: number): HandCommand {
  const sample = gameInput.sample();
  const mapped = mapBadminton(sample, null);
  let keyShot: ShotKind | null = null;
  let serve = gameInput.consumeAction();
  let pause = false;
  let restart = false;
  if (keys) {
    const left = keys.LEFT.isDown || keys.A.isDown;
    const right = keys.RIGHT.isDown || keys.D.isDown;
    const up = keys.UP.isDown || keys.W.isDown;
    const down = keys.DOWN.isDown || keys.S.isDown;
    axis.x = axisFromKeys(axis.x, left, right, dt);
    axis.y = axisFromKeys(axis.y, down, up, dt);
    if (left || right) mapped.moveX = axis.x;
    if (up || down) mapped.moveY = axis.y;
    if (Phaser.Input.Keyboard.JustDown(keys.J)) keyShot = 'forehand';
    if (Phaser.Input.Keyboard.JustDown(keys.K)) keyShot = 'backhand';
    if (Phaser.Input.Keyboard.JustDown(keys.L)) keyShot = 'smash';
    if (Phaser.Input.Keyboard.JustDown(keys.U)) keyShot = 'flick';
    if (Phaser.Input.Keyboard.JustDown(keys.SPACE)) serve = true;
    if (Phaser.Input.Keyboard.JustDown(keys.P)) pause = true;
    if (Phaser.Input.Keyboard.JustDown(keys.R)) restart = true;
    if (keys.SHIFT.isDown) mapped.defend = true;
  }
  return {
    moveX: mapped.moveX,
    moveY: mapped.moveY,
    racketAngle: mapped.racketAngle,
    defend: mapped.defend,
    serve,
    pause,
    restart,
    keyShot,
  };
}
