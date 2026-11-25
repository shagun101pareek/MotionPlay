import type { ControllerState, GestureSample } from '@motionplay/shared';
import { commandFromState, type RacketCommand } from './racketCommand.js';

/** The table-tennis racket stays on its line. Depth tilt is ignored. Angle and swings change the ball. */
export function mapTableTennis(state: ControllerState, gesture: GestureSample | null): RacketCommand {
  return commandFromState(state, gesture, false);
}
