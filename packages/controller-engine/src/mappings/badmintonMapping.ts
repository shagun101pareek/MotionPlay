import type { ControllerState, GestureSample } from '@motionplay/shared';
import { commandFromState, type RacketCommand } from './racketCommand.js';

/** Tilt moves the player. Swings choose the shot. A special press is a defensive block. */
export function mapBadminton(state: ControllerState, gesture: GestureSample | null): RacketCommand {
  return commandFromState(state, gesture, true);
}
