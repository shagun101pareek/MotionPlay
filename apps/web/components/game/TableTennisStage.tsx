'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@motionplay/shared';
import { disposeTableAudio } from '@/games/table-tennis/TableTennisAudio';
import { TableTennisMatch } from '@/games/table-tennis/TableTennisMatch';
import { TableTennisView } from '@/games/table-tennis/view/TableTennisView';

export function TableTennisStage({ difficulty }: { difficulty: Difficulty }) {
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const match = new TableTennisMatch(difficulty);
    const view = new TableTennisView(parent);
    const observer = new ResizeObserver(() => view.resize(parent.clientWidth, parent.clientHeight));
    observer.observe(parent);
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      match.update(dt);
      view.render(match.frame, dt, now / 1000);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      match.dispose();
      view.dispose();
      disposeTableAudio();
    };
  }, [difficulty]);

  return <div ref={parentRef} className="h-full w-full" />;
}
