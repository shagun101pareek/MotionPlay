import type { GameId } from '@motionplay/shared';
import { BadmintonScene } from './BadmintonScene';

export const badmintonGame = {
  id: 'badminton' as GameId,
  key: 'badminton',
  scene: BadmintonScene,
};

export { BadmintonScene };
