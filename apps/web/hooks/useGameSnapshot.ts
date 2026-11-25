'use client';

import { useSyncExternalStore } from 'react';
import { gameBus, type GameSnapshot } from '@/lib/gameBridge';

export function useGameSnapshot(): GameSnapshot {
  return useSyncExternalStore(gameBus.subscribe, gameBus.getSnapshot, gameBus.getSnapshot);
}
