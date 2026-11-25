import type { GameId } from '@motionplay/shared';
import type Phaser from 'phaser';
import { badmintonGame } from '../badminton/BadmintonGame';
import { tableTennisGame } from '../table-tennis/TableTennisGame';
import { tennisGame } from '../tennis/TennisGame';

export interface GameAdapter {
  id: GameId;
  key: string;
  scene?: new () => Phaser.Scene;
}

const adapters: Record<GameId, GameAdapter> = {
  badminton: badmintonGame,
  'table-tennis': tableTennisGame,
  tennis: tennisGame,
};

export function getAdapter(id: GameId): GameAdapter {
  return adapters[id];
}
