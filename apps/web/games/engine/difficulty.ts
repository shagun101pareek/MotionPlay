import type { Difficulty } from '@motionplay/shared';

export interface AiTuning {
  speed: number;
  error: number;
  reaction: number;
  smashChance: number;
}

export function aiTuning(difficulty: Difficulty): AiTuning {
  if (difficulty === 'easy') return { speed: 3.6, error: 0.7, reaction: 0.24, smashChance: 0.08 };
  if (difficulty === 'hard') return { speed: 7.8, error: 0.12, reaction: 0.05, smashChance: 0.32 };
  return { speed: 5.5, error: 0.32, reaction: 0.12, smashChance: 0.18 };
}
