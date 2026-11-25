import { mapTableTennis } from '@motionplay/controller-engine';
import { axisFromKeys, gameInput } from '@/lib/gameBridge';
import type { TableShot } from './TableTennisPhysics';

export interface TableInput {
  moveX: number;
  moveY: number;
  racketAngle: number;
  shot: TableShot | null;
  intensity: number;
  serve: boolean;
  pause: boolean;
  restart: boolean;
}

const BLOCKED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export function createTableInput(): { read: (dt: number) => TableInput; dispose: () => void } {
  const held = new Set<string>();
  const edges = new Set<string>();
  const axis = { x: 0, y: 0, angle: 0 };

  const down = (event: KeyboardEvent) => {
    if (editableTarget(event)) return;
    if (event.repeat) return;
    if (BLOCKED.has(event.code)) event.preventDefault();
    if (!held.has(event.code)) edges.add(event.code);
    held.add(event.code);
  };
  const up = (event: KeyboardEvent) => {
    held.delete(event.code);
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);

  return {
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    },
    read(dt: number): TableInput {
      const sample = gameInput.sample();
      const gesture = gameInput.latest(260);
      const mapped = gesture ? mapTableTennis(sample, gesture) : null;
      const pushed = gesture?.type === 'SPECIAL_ACTION';
      if (mapped?.shot || pushed) gameInput.takeLatest(260);

      const left = held.has('ArrowLeft') || held.has('KeyA');
      const right = held.has('ArrowRight') || held.has('KeyD');
      const up = held.has('ArrowUp') || held.has('KeyW');
      const downKey = held.has('ArrowDown') || held.has('KeyS');
      const angleNeg = held.has('KeyZ') || held.has('Comma');
      const anglePos = held.has('KeyX') || held.has('Period');
      axis.x = axisFromKeys(axis.x, left, right, dt);
      axis.y = axisFromKeys(axis.y, downKey, up, dt);
      axis.angle = axisFromKeys(axis.angle, angleNeg, anglePos, dt);

      // Forward tilt is read from the controller sample. The shared table-tennis map keeps moveY at 0.
      let shot: TableShot | null = pushed ? 'flick' : (mapped?.shot ?? null);
      let intensity = shot && gesture ? Math.max(0.4, gesture.intensity * (pushed ? 0.7 : 1)) : 0;
      if (edges.has('KeyJ')) {
        shot = 'forehand';
        intensity = 0.74;
      }
      if (edges.has('KeyK')) {
        shot = 'backhand';
        intensity = 0.74;
      }
      if (edges.has('KeyL')) {
        shot = 'smash';
        intensity = 0.92;
      }
      if (edges.has('KeyU')) {
        shot = 'flick';
        intensity = 0.56;
      }
      const serve = edges.has('Space') || gameInput.consumeAction();
      const pause = edges.has('KeyP');
      const restart = edges.has('KeyR');
      edges.clear();

      return {
        moveX: left || right ? axis.x : Math.abs(sample.movement.horizontal) > 0.04 ? sample.movement.horizontal : axis.x,
        moveY: up || downKey ? axis.y : Math.abs(sample.movement.vertical) > 0.04 ? sample.movement.vertical : axis.y,
        racketAngle: angleNeg || anglePos ? axis.angle : Math.abs(sample.racketAngle) > 0.04 ? sample.racketAngle : axis.angle,
        shot,
        intensity,
        serve,
        pause,
        restart,
      };
    },
  };
}

function editableTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLElement && Boolean(target.closest('button, a, input, textarea, select'));
}
