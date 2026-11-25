'use client';

import Link from 'next/link';
import type { Difficulty } from '@motionplay/shared';
import { getTableAudio } from '@/games/table-tennis/TableTennisAudio';
import { Button } from '@/components/shared/Button';
import { Logo } from '@/components/shared/Logo';
import { requestGameAction, type GameSnapshot } from '@/lib/gameBridge';

export function TableTennisHud({
  roomId,
  connected,
  offline,
  snap,
  muted,
  difficulty,
  onMute,
}: {
  roomId: string;
  connected: boolean;
  offline: string | null;
  snap: GameSnapshot;
  muted: boolean;
  difficulty: Difficulty;
  onMute: () => void;
}) {
  const playing = snap.phase !== 'waiting' && snap.phase !== 'matchover';
  const matchWinner = resolveWinner(snap);
  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 px-4 pt-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <Link href="/" className="pointer-events-auto">
            <Logo />
          </Link>
          <div className="rounded-2xl bg-black/25 px-5 py-2 text-center shadow-lg backdrop-blur-md">
            <p className="font-mono text-[10px] tracking-[0.2em] text-white/70">FIRST TO 11 · {levelName(difficulty).toUpperCase()}</p>
            <div className="mt-1 flex items-end justify-center gap-6 font-sans text-4xl font-semibold tabular-nums leading-none sm:text-5xl">
              <Score label="You" value={snap.player} serving={snap.server === 'player'} accent />
              <span className="pb-1 text-lg text-white/45">–</span>
              <Score label="Opp" value={snap.opponent} serving={snap.server === 'opponent'} />
            </div>
            <p key={`${snap.phase}-${snap.detail}`} className="mt-1 animate-rise text-sm text-white/85">
              {snap.detail || 'Ready'}
            </p>
          </div>
          <p className="w-[88px] text-right font-mono text-[10px] tracking-[0.16em] text-white/55 sm:w-auto">{roomId}</p>
        </div>
      </header>

      {offline && <p className="absolute inset-x-0 top-24 px-6 text-center text-sm text-warn">{offline}</p>}

      {snap.phase === 'point' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p key={`${snap.player}-${snap.opponent}-${snap.detail}`} className="animate-rise rounded-full bg-black/35 px-6 py-3 font-display text-4xl text-white backdrop-blur-sm">
            {snap.detail}
          </p>
        </div>
      )}

      {snap.phase === 'waiting' && (
        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-transparent to-transparent pb-16 sm:items-center sm:pb-0">
          <div className="max-w-sm rounded-3xl bg-black/45 px-6 py-5 text-center shadow-lg backdrop-blur-md">
            <p className="font-mono text-xs tracking-[0.22em] text-signal">{roomId}</p>
            <h2 className="mt-2 font-display text-4xl text-white">Table Tennis</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              {connected
                ? 'Tilt to place the racket. Swing when the ball reaches your end. Tilting alone will not hit.'
                : 'Arrows place the racket. Swing with J or K after the bounce. Space serves.'}
            </p>
            <Button className="mt-5" onClick={() => requestGameAction('start')}>
              Start match
            </Button>
          </div>
        </div>
      )}

      {snap.phase === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <div className="text-center">
            <h2 className="font-display text-4xl text-white">Paused</h2>
            <Button className="mt-6" onClick={() => requestGameAction('resume')}>
              Resume
            </Button>
          </div>
        </div>
      )}

      {snap.phase === 'matchover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <div className="rounded-3xl bg-black/50 px-8 py-6 text-center backdrop-blur-md">
            <p className="font-mono text-xs tracking-[0.22em] text-signal">MATCH</p>
            <h2 className="mt-3 font-display text-5xl text-white">{matchWinner === 'player' ? 'You won' : 'Opponent won'}</h2>
            <p className="mt-2 text-white/70">
              {snap.player} – {snap.opponent}
            </p>
            <Button className="mt-6" onClick={() => requestGameAction('restart')}>
              Play again
            </Button>
          </div>
        </div>
      )}

      {playing && (
        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2">
          <Button className="px-4 py-2" onClick={() => requestGameAction(snap.phase === 'paused' ? 'resume' : 'pause')}>
            {snap.phase === 'paused' ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="ghost" className="border-white/20 px-4 py-2 text-white" onClick={() => requestGameAction('restart')}>
            Restart
          </Button>
          <Button
            variant="ghost"
            className="border-white/20 px-4 py-2 text-white"
            onClick={() => {
              onMute();
              getTableAudio().play('ui');
            }}
          >
            {muted ? 'Sound off' : 'Sound'}
          </Button>
          <span className="rounded-full bg-black/35 px-3 py-2 text-xs text-white/75 backdrop-blur">{connected ? 'Phone linked' : 'Keyboard'}</span>
        </div>
      )}
    </>
  );
}

function resolveWinner(snap: GameSnapshot): 'player' | 'opponent' {
  if (snap.winner === 'player' || snap.winner === 'opponent') return snap.winner;
  return snap.opponent > snap.player ? 'opponent' : 'player';
}

function Score({ label, value, serving, accent = false }: { label: string; value: number; serving: boolean; accent?: boolean }) {
  return (
    <span className="inline-flex flex-col items-center">
      <span className="mb-1 flex items-center gap-1 font-mono text-[10px] tracking-[0.16em] text-white/60">
        {serving && <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />}
        {label.toUpperCase()}
      </span>
      <span key={value} className={`animate-rise ${accent ? 'text-white' : 'text-white/90'}`}>
        {value}
      </span>
    </span>
  );
}

function levelName(difficulty: Difficulty): string {
  if (difficulty === 'easy') return 'Beginner';
  if (difficulty === 'hard') return 'Advanced';
  return 'Intermediate';
}
