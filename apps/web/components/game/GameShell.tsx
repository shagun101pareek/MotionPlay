'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ClientEvents, ServerEvents, getGame, isDifficulty, isGameId } from '@motionplay/shared';
import type { Difficulty, GameId, GameLifecyclePayload, RelayedControllerButton, RelayedControllerGesture, RelayedControllerInput } from '@motionplay/shared';
import { Button } from '@/components/shared/Button';
import { Logo } from '@/components/shared/Logo';
import { StatusPill } from '@/components/shared/StatusPill';
import { TableTennisHud } from '@/components/game/TableTennisHud';
import { useGameSnapshot } from '@/hooks/useGameSnapshot';
import { useSessionPresence } from '@/hooks/useSessionPresence';
import { gameAudio, gameBus, gameCommands, gameInput, onGameAction, requestGameAction } from '@/lib/gameBridge';
import { pushHistory } from '@/lib/history';
import { consumeAutostart, readHostRoom } from '@/lib/session';
import { getSocket } from '@/lib/socket';
import { getServerBaseUrl } from '@/lib/urls';

const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-ink" />,
});

const blockingCodes = new Set(['ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'HOST_TAKEN', 'UNAUTHORIZED', 'INVALID_ROOM']);

export function GameShell({ roomId }: { roomId: string }) {
  const presence = useSessionPresence(roomId, 'host');
  const snap = useGameSnapshot();
  const [muted, setMuted] = useState(false);
  const [meta, setMeta] = useState<{ gameId: GameId; difficulty: Difficulty } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const recorded = useRef(false);

  useEffect(() => {
    const saved = readHostRoom();
    if (saved && saved.roomId === roomId.toUpperCase() && saved.gameId && isGameId(saved.gameId)) {
      setMeta({ gameId: saved.gameId, difficulty: saved.difficulty && isDifficulty(saved.difficulty) ? saved.difficulty : 'medium' });
    }
    let cancelled = false;
    void fetch(`${getServerBaseUrl()}/rooms/${roomId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { gameId?: string; difficulty?: string } | null) => {
        if (cancelled || !data || !isGameId(data.gameId)) return;
        setMeta({
          gameId: data.gameId,
          difficulty: isDifficulty(data.difficulty) ? data.difficulty : 'medium',
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    if (presence.joined && isGameId(presence.gameId)) {
      setMeta((current) => ({
        gameId: presence.gameId,
        difficulty: presence.difficulty || current?.difficulty || 'medium',
      }));
    }
  }, [presence.joined, presence.gameId, presence.difficulty]);

  useEffect(() => {
    const socket = getSocket();
    const onInput = (payload: RelayedControllerInput) => {
      if (payload.roomId !== presence.roomId) return;
      gameInput.setState(payload.state);
    };
    const onGesture = (payload: RelayedControllerGesture) => {
      if (payload.roomId !== presence.roomId) return;
      gameInput.pushGesture(payload.gesture, payload.sequence);
    };
    const onButton = (payload: RelayedControllerButton) => {
      if (payload.roomId !== presence.roomId) return;
      gameInput.setButton(payload.button, payload.pressed, payload.sequence);
    };
    const onConnected = (payload: { roomId: string }) => {
      if (payload.roomId !== presence.roomId) return;
      gameInput.setConnected(true);
    };
    const onDisconnected = (payload: { roomId: string }) => {
      if (payload.roomId !== presence.roomId) return;
      gameInput.setConnected(false);
    };
    const onStarted = (payload: GameLifecyclePayload) => {
      if (payload.roomId !== presence.roomId) return;
      gameCommands.push('start');
    };
    const onPaused = (payload: GameLifecyclePayload) => {
      if (payload.roomId !== presence.roomId) return;
      gameCommands.push('pause');
    };
    const onRestarted = (payload: GameLifecyclePayload) => {
      if (payload.roomId !== presence.roomId) return;
      gameCommands.push('restart');
    };

    socket.on(ServerEvents.CONTROLLER_INPUT, onInput);
    socket.on(ServerEvents.CONTROLLER_GESTURE, onGesture);
    socket.on(ServerEvents.CONTROLLER_BUTTON, onButton);
    socket.on(ServerEvents.CONTROLLER_CONNECTED, onConnected);
    socket.on(ServerEvents.CONTROLLER_DISCONNECTED, onDisconnected);
    socket.on(ServerEvents.GAME_STARTED, onStarted);
    socket.on(ServerEvents.GAME_PAUSED, onPaused);
    socket.on(ServerEvents.GAME_RESTARTED, onRestarted);
    return () => {
      socket.off(ServerEvents.CONTROLLER_INPUT, onInput);
      socket.off(ServerEvents.CONTROLLER_GESTURE, onGesture);
      socket.off(ServerEvents.CONTROLLER_BUTTON, onButton);
      socket.off(ServerEvents.CONTROLLER_CONNECTED, onConnected);
      socket.off(ServerEvents.CONTROLLER_DISCONNECTED, onDisconnected);
      socket.off(ServerEvents.GAME_STARTED, onStarted);
      socket.off(ServerEvents.GAME_PAUSED, onPaused);
      socket.off(ServerEvents.GAME_RESTARTED, onRestarted);
    };
  }, [presence.roomId]);

  useEffect(() => {
    return onGameAction((action) => {
      const socket = getSocket();
      if (!socket.connected) {
        setActionError('The game server is offline, so the rally cannot start.');
        return;
      }
      setActionError(null);
      const event =
        action === 'pause' ? ClientEvents.PAUSE_GAME : action === 'restart' ? ClientEvents.RESTART_GAME : ClientEvents.START_GAME;
      socket.emit(event, { roomId: presence.roomId });
    });
  }, [presence.roomId]);

  useEffect(() => {
    if (!presence.joined) return;
    if (!consumeAutostart(presence.roomId)) return;
    getSocket().emit(ClientEvents.START_GAME, { roomId: presence.roomId });
  }, [presence.joined, presence.roomId]);

  useEffect(() => {
    gameInput.setConnected(presence.controllerConnected);
  }, [presence.controllerConnected]);

  useEffect(() => {
    return () => {
      gameInput.reset();
      gameBus.reset();
    };
  }, []);

  useEffect(() => {
    if (snap.phase !== 'matchover') recorded.current = false;
    if (!meta || snap.phase !== 'matchover' || !snap.winner || recorded.current) return;
    recorded.current = true;
    const won = snap.winner === 'player' || (snap.winner !== 'opponent' && snap.player > snap.opponent);
    pushHistory({
      gameId: meta.gameId,
      result: won ? 'win' : 'loss',
      player: snap.player,
      opponent: snap.opponent,
    });
  }, [meta, snap.phase, snap.winner, snap.player, snap.opponent]);

  if (!presence.valid || (presence.errorCode && blockingCodes.has(presence.errorCode))) {
    return (
      <main className="flex min-h-dvh flex-col items-start justify-center px-8">
        <Logo />
        <h1 className="mt-8 font-display text-4xl">This session is unavailable.</h1>
        <p className="mt-3 max-w-md text-mist">{presence.valid ? presence.error : 'That room code is not valid.'}</p>
        <Link href="/" className="mt-6 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white">
          Back to console
        </Link>
      </main>
    );
  }

  const game = meta ? getGame(meta.gameId) : null;
  const you = snap.playerLabel || String(snap.player);
  const them = snap.opponentLabel || String(snap.opponent);

  return (
    <div className="relative h-dvh overflow-hidden bg-ink">
      {meta && <GameCanvas gameId={meta.gameId} difficulty={meta.difficulty} />}
      {meta?.gameId === 'table-tennis' ? (
        <TableTennisHud
          roomId={presence.roomId}
          connected={presence.controllerConnected}
          offline={actionError || (presence.connection === 'offline' ? 'Reconnecting. The rally keeps running on this screen.' : null)}
          snap={snap}
          muted={muted}
          difficulty={meta.difficulty}
          onMute={() => {
            gameAudio.muted = !gameAudio.muted;
            setMuted(gameAudio.muted);
          }}
        />
      ) : (
      <>
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-ink/80 to-transparent px-4 py-4 sm:px-6">
        <Link href="/" className="pointer-events-auto">
          <Logo />
        </Link>
        <div className="text-center">
          <p className="font-mono text-[10px] tracking-[0.2em] text-mist">{game ? game.pointsLabel.toUpperCase() : 'MATCH'}</p>
          <p className="mt-1 font-display text-4xl leading-none sm:text-5xl">
            <span className="text-accent">{you}</span>
            <span className="mx-3 text-mist">·</span>
            <span>{them}</span>
          </p>
          <p className="mt-1 text-sm text-mist">{snap.detail || phaseLabel(snap.phase)}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <StatusPill live={presence.controllerConnected}>{presence.controllerConnected ? 'Phone linked' : 'Keyboard ready'}</StatusPill>
          <button
            type="button"
            className="hidden rounded-full bg-white/10 px-3 py-2 text-xs sm:inline"
            onClick={() => {
              gameAudio.muted = !gameAudio.muted;
              setMuted(gameAudio.muted);
            }}
          >
            {muted ? 'Sound off' : 'Sound on'}
          </button>
        </div>
      </header>

      {(presence.connection === 'offline' || actionError) && (
        <p className="absolute inset-x-0 top-24 px-6 text-center text-sm text-warn">
          {actionError || 'Reconnecting. The rally keeps running on this screen.'}
        </p>
      )}

      {snap.phase === 'waiting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/50">
          <div className="max-w-sm px-6 text-center">
            <p className="font-mono text-xs tracking-[0.22em] text-signal">{presence.roomId}</p>
            <h2 className="mt-3 font-display text-4xl">{game?.title ?? 'Ready'}</h2>
            <p className="mt-3 text-sm leading-6 text-mist">
              {presence.controllerConnected
                ? 'Tilt to move. Swing the phone when the ball is in reach.'
                : 'Arrow keys move. J, K, and L swing. Space serves.'}
            </p>
            <Button className="mt-6" onClick={() => requestGameAction('start')}>
              Start match
            </Button>
          </div>
        </div>
      )}
      {snap.phase === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/55">
          <div className="text-center">
            <h2 className="font-display text-4xl">Paused</h2>
            <Button className="mt-6" onClick={() => requestGameAction('resume')}>
              Resume
            </Button>
          </div>
        </div>
      )}
      {snap.phase === 'matchover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/60">
          <div className="text-center">
            <p className="font-mono text-xs tracking-[0.22em] text-signal">MATCH</p>
            <h2 className="mt-3 font-display text-5xl">{snap.winner === 'player' ? 'You won' : 'Opponent won'}</h2>
            <Button className="mt-6" onClick={() => requestGameAction('restart')}>
              Play again
            </Button>
          </div>
        </div>
      )}
      {snap.phase !== 'waiting' && snap.phase !== 'matchover' && (
        <div className="absolute bottom-4 right-4 flex gap-2">
          <Button className="px-4 py-2" onClick={() => requestGameAction(snap.phase === 'paused' ? 'resume' : 'pause')}>
            {snap.phase === 'paused' ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="ghost" className="px-4 py-2" onClick={() => requestGameAction('restart')}>
            Restart
          </Button>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function phaseLabel(phase: string): string {
  if (phase === 'paused') return 'Paused';
  if (phase === 'matchover') return 'Match over';
  if (phase === 'serve') return 'Serve';
  if (phase === 'playing' || phase === 'point') return 'Rally';
  return 'Ready';
}
