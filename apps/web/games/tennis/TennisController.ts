import { mapTennis } from '@motionplay/controller-engine';
import { gameInput } from '@/lib/gameBridge';
import { readHand, type HandCommand, type RallyKeys } from '../badminton/BadmintonController';

export function readTennis(keys: RallyKeys | undefined, axis: { x: number; y: number }, dt: number): HandCommand {
  const hand = readHand(keys, axis, dt);
  const mapped = mapTennis(gameInput.sample(), null);
  return { ...hand, racketAngle: mapped.racketAngle, moveX: hand.moveX, moveY: hand.moveY };
}

export { createRallyKeys } from '../badminton/BadmintonController';
export type { RallyKeys } from '../badminton/BadmintonController';
