'use client';

import { QRCodeSVG } from 'qrcode.react';
import { getGame } from '@motionplay/shared';
import type { GameId } from '@motionplay/shared';
import { Button } from '@/components/shared/Button';
import { StatusPill } from '@/components/shared/StatusPill';

export function PairingModal({
  roomId,
  gameId,
  link,
  controllerConnected,
  onStart,
  onPractice,
  onCancel,
}: {
  roomId: string;
  gameId: GameId;
  link: string | null;
  controllerConnected: boolean;
  onStart: () => void;
  onPractice: () => void;
  onCancel: () => void;
}) {
  const game = getGame(gameId);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* The visible URL remains on screen when clipboard access is blocked. */
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/75 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pairing-title"
        className="grid w-full max-w-3xl gap-6 rounded-[28px] bg-navy p-6 shadow-glow md:grid-cols-[auto_1fr]"
      >
        <div className="relative mx-auto rounded-3xl bg-foam p-4">
          {link ? (
            <QRCodeSVG value={link} size={232} bgColor="#f4f1ea" fgColor="#07080d" level="M" marginSize={1} />
          ) : (
            <div className="h-[232px] w-[232px] animate-pulse rounded-xl bg-ink/10" />
          )}
          {!controllerConnected && <span className="scan-line pointer-events-none absolute left-6 right-6 h-0.5 bg-accent/80" />}
          {controllerConnected && (
            <span className="absolute inset-0 flex items-center justify-center rounded-3xl bg-ink/55 text-center font-display text-2xl text-foam">
              Phone linked
            </span>
          )}
        </div>
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.22em] text-signal">{game.title.toUpperCase()}</p>
              <h2 id="pairing-title" className="mt-2 font-display text-3xl">Scan to control</h2>
            </div>
            <button type="button" onClick={onCancel} className="rounded-full px-3 py-1 text-sm text-mist hover:text-foam">
              Close
            </button>
          </div>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-mist">
            <li>1. Open the camera on the phone that will be the controller.</li>
            <li>2. Scan the code, then allow motion access and hold a comfortable grip.</li>
            <li>3. Start the match when the phone shows as linked.</li>
          </ol>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.16em] text-mist">ROOM</p>
              <p className="font-mono text-2xl tracking-[0.16em]">{roomId}</p>
            </div>
            <StatusPill live={controllerConnected}>{controllerConnected ? 'Controller linked' : 'Waiting for a phone'}</StatusPill>
          </div>
          {link && (
            <button type="button" onClick={() => void copy()} className="mt-4 w-full truncate rounded-xl bg-ink/40 px-3 py-2 text-left font-mono text-xs text-mist">
              {link}
            </button>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={onStart} disabled={!controllerConnected}>
              Start match
            </Button>
            <Button variant="ghost" onClick={onPractice}>
              Practice with keyboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
