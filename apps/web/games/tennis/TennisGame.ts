import type { GameId } from '@motionplay/shared';
import { TennisScene } from './TennisScene';

export const tennisGame = {
  id: 'tennis' as GameId,
  key: 'tennis',
  scene: TennisScene,
};

export { TennisScene };
