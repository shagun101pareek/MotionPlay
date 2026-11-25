import type { GameId } from '@motionplay/shared';

export interface MatchRecord {
  id: string;
  gameId: GameId;
  result: 'win' | 'loss';
  player: number;
  opponent: number;
  playedAt: number;
}

const KEY = 'motionplay:history';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readHistory(): MatchRecord[] {
  const raw = storage()?.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MatchRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((match) => match && match.gameId && match.playedAt).slice(0, 6);
  } catch {
    return [];
  }
}

export function pushHistory(match: Omit<MatchRecord, 'id' | 'playedAt'>): MatchRecord[] {
  const next: MatchRecord = { ...match, id: `${Date.now()}`, playedAt: Date.now() };
  const history = [next, ...readHistory()].slice(0, 6);
  storage()?.setItem(KEY, JSON.stringify(history));
  return history;
}
