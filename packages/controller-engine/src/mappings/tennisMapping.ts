import type { ControllerState, GestureSample } from '@motionplay/shared';
import { commandFromState, type RacketCommand } from './racketCommand.js';

/** Court movement plus the same swing vocabulary. A flick near the net is the volley cue. */
export function mapTennis(state: ControllerState, gesture: GestureSample | null): RacketCommand {
  return commandFromState(state, gesture, true);
}
