'use client';

import dynamic from 'next/dynamic';
import type { Difficulty, GameId } from '@motionplay/shared';
import { TableTennisStage } from './TableTennisStage';

const PhaserCanvas = dynamic(() => import('./PhaserCanvas'), { ssr: false });

export default function GameCanvas({ gameId, difficulty }: { gameId: GameId; difficulty: Difficulty }) {
  if (gameId === 'table-tennis') return <TableTennisStage difficulty={difficulty} />;
  return <PhaserCanvas gameId={gameId} difficulty={difficulty} />;
}
