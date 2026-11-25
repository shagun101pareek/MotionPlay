'use client';

import { clamp } from '@motionplay/shared';
import { useRef } from 'react';

export function TouchPad({
  onChange,
}: {
  onChange: (position: number | null) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);

  const place = (position: number) => {
    const next = clamp(position, -1, 1);
    onChange(next);
    padRef.current?.style.setProperty('--tilt', next.toFixed(3));
    padRef.current?.setAttribute('aria-valuenow', next.toFixed(2));
  };

  const update = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0.5 : clamp((clientX - rect.left) / rect.width, 0, 1);
    place(ratio * 2 - 1);
  };

  return (
    <div
      ref={padRef}
      role="slider"
      tabIndex={0}
      aria-label="Racket position"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
      className="relative min-h-40 flex-1 touch-none rounded-[28px] border border-white/10 bg-navy outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.currentTarget);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        update(event.clientX, event.currentTarget);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onChange(null);
      }}
      onPointerCancel={() => onChange(null)}
      onKeyDown={(event) => {
        const current = Number(padRef.current?.getAttribute('aria-valuenow') ?? 0);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          place(current + (event.key === 'ArrowLeft' ? -0.12 : 0.12));
          window.setTimeout(() => onChange(null), 80);
        }
      }}
    >
      <p className="pointer-events-none absolute inset-x-0 top-4 text-center font-mono text-[11px] tracking-[0.2em] text-mist">
        DRAG TO MOVE
      </p>
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-white/15" />
      <div
        className="pointer-events-none absolute top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/50 bg-accent/20 shadow-glow"
        style={{ left: 'calc(50% + (var(--tilt, 0) * 38%))' }}
      />
    </div>
  );
}
