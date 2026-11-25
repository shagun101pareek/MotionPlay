'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { Difficulty, GameId } from '@motionplay/shared';
import { getAdapter } from '@/games/engine/registry';

export default function PhaserCanvas({ gameId, difficulty }: { gameId: GameId; difficulty: Difficulty }) {
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const adapter = getAdapter(gameId);
    if (!adapter.scene) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: 960,
      height: 540,
      backgroundColor: '#07080d',
      banner: false,
      scene: [],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: { keyboard: true },
      audio: { noAudio: true },
    });
    game.scene.add(adapter.key, adapter.scene, true, { difficulty });
    return () => {
      game.destroy(true);
    };
  }, [gameId, difficulty]);

  return <div ref={parentRef} className="h-full w-full" />;
}
