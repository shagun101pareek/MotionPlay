export const GAME_IDS = ['badminton', 'table-tennis', 'tennis'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const PLAY_MODES = ['single'] as const;
export type PlayMode = (typeof PLAY_MODES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface GameCatalogEntry {
  id: GameId;
  title: string;
  genre: string;
  players: string;
  control: string;
  status: 'playable';
  summary: string;
  pointsLabel: string;
}

export const GAME_CATALOG: readonly GameCatalogEntry[] = [
  {
    id: 'badminton',
    title: 'Badminton',
    genre: 'Racket sport',
    players: '1 player',
    control: 'Tilt, swing, tap',
    status: 'playable',
    summary: 'Move along the court, then swing the phone to drive, clear, or smash the shuttle.',
    pointsLabel: 'First to 11, win by 2',
  },
  {
    id: 'table-tennis',
    title: 'Table Tennis',
    genre: 'Racket sport',
    players: '1 player',
    control: 'Tilt, angle, swing',
    status: 'playable',
    summary: 'Stand at your end of the table. Tilt the phone to place the racket, then swing to play the ball.',
    pointsLabel: 'First to 11, win by 2',
  },
  {
    id: 'tennis',
    title: 'Tennis',
    genre: 'Racket sport',
    players: '1 player',
    control: 'Tilt, swing, serve',
    status: 'playable',
    summary: 'Cover the baseline, serve with a tap, and time forehands, backhands, and volleys.',
    pointsLabel: 'One game',
  },
] as const;

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

export function isPlayMode(value: unknown): value is PlayMode {
  return value === 'single';
}

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

export function getGame(id: GameId): GameCatalogEntry {
  const entry = GAME_CATALOG.find((game) => game.id === id);
  if (!entry) throw new Error(`Unknown game: ${id}`);
  return entry;
}
