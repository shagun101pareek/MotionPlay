'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GAME_CATALOG, getGame } from '@motionplay/shared';
import type { GameId } from '@motionplay/shared';
import { Logo } from '@/components/shared/Logo';
import { StatusPill } from '@/components/shared/StatusPill';
import { useSocketStatus } from '@/hooks/useSocketStatus';
import { readHistory, type MatchRecord } from '@/lib/history';
import { readHostRoom } from '@/lib/session';
import { getServerBaseUrl } from '@/lib/urls';
import { GameArtwork } from './GameArtwork';

const steps = [
  { n: '01', title: 'Choose a game', body: 'Badminton, table tennis, or tennis. The match stays on this screen.' },
  { n: '02', title: 'Scan the code', body: 'The phone opens a controller. No app install, and no account.' },
  { n: '03', title: 'Set a neutral grip', body: 'Hold the phone the way you will play. Calibration remembers that pose.' },
  { n: '04', title: 'Move for real', body: 'Tilt to move. Swing to hit. The laptop plays the rally.' },
];

export function ConsoleHome() {
  const server = useSocketStatus();
  const [history, setHistory] = useState<MatchRecord[]>([]);
  const [liveRoom, setLiveRoom] = useState<string | null>(null);
  const featured = getGame('badminton');

  useEffect(() => {
    setHistory(readHistory());
    const saved = readHostRoom();
    if (!saved) return;
    let cancelled = false;
    void fetch(`${getServerBaseUrl()}/rooms/${saved.roomId}`)
      .then((response) => {
        if (!response.ok) return;
        if (!cancelled) setLiveRoom(saved.roomId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-dvh bg-ink text-foam">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(141,123,255,0.16),transparent_60%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <StatusPill live={server === 'online'}>
          {server === 'online' ? 'Console online' : server === 'offline' ? 'Console offline' : 'Connecting'}
        </StatusPill>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-20">
        <section className="grid items-end gap-10 pt-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="font-mono text-xs tracking-[0.28em] text-signal">YOUR PHONE. YOUR MOVEMENT. YOUR GAME.</p>
            <h1 className="mt-4 max-w-xl font-display text-5xl font-semibold leading-[0.95] sm:text-7xl">Play Beyond the Screen.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-mist">
              MotionPlay is a racket-sports console. This screen renders the match. Your phone is the motion controller.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/play/badminton" className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white">
                Play badminton
              </Link>
              <a href="#library" className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold">
                Browse games
              </a>
            </div>
          </div>
          <Link href={`/play/${featured.id}`} className="group block overflow-hidden rounded-[28px] bg-navy shadow-glow">
            <GameArtwork gameId={featured.id} className="h-auto w-full transition duration-500 group-hover:scale-[1.02]" />
            <div className="flex items-end justify-between px-6 py-5">
              <div>
                <p className="font-mono text-[11px] tracking-[0.2em] text-signal">FEATURED</p>
                <h2 className="mt-1 font-display text-3xl">{featured.title}</h2>
              </div>
              <span className="text-sm text-mist">{featured.control}</span>
            </div>
          </Link>
        </section>

        <section id="library" className="mt-20">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-3xl">Game library</h2>
            <p className="text-sm text-mist">Three playable racket games</p>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {GAME_CATALOG.map((game) => (
              <article key={game.id} className="flex flex-col overflow-hidden rounded-[24px] bg-navy">
                <GameArtwork gameId={game.id} className="h-44 w-full object-cover" />
                <div className="flex flex-1 flex-col px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-2xl">{game.title}</h3>
                    <span className="rounded-full bg-white/5 px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-signal">PLAYABLE</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-mist">{game.summary}</p>
                  <dl className="mt-4 space-y-1 text-sm text-mist">
                    <div className="flex justify-between gap-3"><dt>Genre</dt><dd className="text-foam">{game.genre}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Players</dt><dd className="text-foam">{game.players}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Controls</dt><dd className="text-foam">{game.control}</dd></div>
                  </dl>
                  <Link href={`/play/${game.id}`} className="mt-5 inline-flex justify-center rounded-full bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-accent">
                    Play
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-display text-3xl">How it works</h2>
            <ol className="mt-6 space-y-5">
              {steps.map((step) => (
                <li key={step.n} className="grid grid-cols-[auto_1fr] gap-4">
                  <span className="font-mono text-xs tracking-[0.16em] text-accent">{step.n}</span>
                  <span>
                    <span className="block font-medium">{step.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-mist">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[24px] bg-navy px-6 py-6">
            <p className="font-mono text-[11px] tracking-[0.2em] text-signal">CONTROLLER</p>
            <h3 className="mt-2 font-display text-2xl">{liveRoom ? 'A session is still open' : 'No controller linked'}</h3>
            <p className="mt-3 text-sm leading-6 text-mist">
              {liveRoom
                ? `Room ${liveRoom} is still on this browser. Open it to keep playing, or start a new game from the library.`
                : 'A phone connects after you start a game. Tilt, swing, and tap are read on the phone and sent here as controller input.'}
            </p>
            {liveRoom && (
              <Link href={`/game/${liveRoom}`} className="mt-5 inline-flex rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white">
                Return to match
              </Link>
            )}
          </div>
        </section>

        {history.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-3xl">Recent matches</h2>
            <ul className="mt-5 divide-y divide-white/10">
              {history.map((match) => (
                <li key={match.id} className="flex items-center justify-between gap-4 py-4">
                  <span>
                    <span className="block font-medium">{titleFor(match.gameId)}</span>
                    <span className="text-sm text-mist">{new Date(match.playedAt).toLocaleString()}</span>
                  </span>
                  <span className="font-mono text-sm">
                    {match.result === 'win' ? 'Won' : 'Lost'} {match.player}–{match.opponent}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function titleFor(id: GameId): string {
  return getGame(id).title;
}
