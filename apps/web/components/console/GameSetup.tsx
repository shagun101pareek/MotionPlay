'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClientEvents, ServerEvents, getGame } from '@motionplay/shared';
import type { Difficulty, GameId, RoomCreatedPayload, RoomErrorPayload } from '@motionplay/shared';
import { PairingModal } from '@/components/lobby/PairingModal';
import { Button } from '@/components/shared/Button';
import { Logo } from '@/components/shared/Logo';
import { useSessionPresence } from '@/hooks/useSessionPresence';
import { useSocketStatus } from '@/hooks/useSocketStatus';
import { clearHostRoom, markAutostart, writeHostRoom, type HostRoomRecord } from '@/lib/session';
import { getSocket } from '@/lib/socket';
import { controllerUrl, getServerBaseUrl, isLocalHostname } from '@/lib/urls';
import { GameArtwork } from './GameArtwork';

const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

function difficultyLabel(gameId: GameId, level: Difficulty): string {
  if (gameId !== 'table-tennis') return level.charAt(0).toUpperCase() + level.slice(1);
  if (level === 'easy') return 'Beginner';
  if (level === 'hard') return 'Advanced';
  return 'Intermediate';
}

export function GameSetup({ gameId }: { gameId: GameId }) {
  const game = getGame(gameId);
  const router = useRouter();
  const server = useSocketStatus();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [room, setRoom] = useState<HostRoomRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lanOrigin, setLanOrigin] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [onLocalhost, setOnLocalhost] = useState(false);
  const presence = useSessionPresence(room ? room.roomId : '', 'host');

  useEffect(() => {
    setOnLocalhost(isLocalHostname(window.location.hostname));
  }, []);

  useEffect(() => {
    if (!onLocalhost) return;
    let cancelled = false;
    void fetch(`${getServerBaseUrl()}/network`)
      .then((response) => response.json())
      .then((data: { addresses?: string[] }) => {
        const address = data.addresses?.[0];
        if (!address || cancelled) return;
        const port = window.location.port ? `:${window.location.port}` : '';
        setLanOrigin(`${window.location.protocol}//${address}${port}`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [onLocalhost]);

  useEffect(() => {
    setLink(room ? controllerUrl(room.roomId, lanOrigin) : null);
  }, [room, lanOrigin]);

  const createRoom = () => {
    setCreating(true);
    setError(null);
    const socket = getSocket();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      socket.off(ServerEvents.ROOM_CREATED, onCreated);
      socket.off(ServerEvents.ROOM_ERROR, onError);
      socket.off('connect', emit);
      setCreating(false);
    };
    const onCreated = (payload: RoomCreatedPayload) => {
      finish();
      const record: HostRoomRecord = {
        roomId: payload.roomId,
        sessionToken: payload.sessionToken,
        expiresAt: payload.expiresAt,
        gameId: payload.gameId,
        difficulty: payload.difficulty,
      };
      writeHostRoom(record);
      setRoom(record);
    };
    const onError = (payload: RoomErrorPayload) => {
      if (payload.roomId) return;
      finish();
      setError(payload.message);
    };
    const emit = () => socket.emit(ClientEvents.CREATE_ROOM, { gameId, mode: 'single', difficulty });
    const timer = window.setTimeout(() => {
      finish();
      setError('The game server did not respond. Start it with npm run dev and try again.');
    }, 6_000);
    socket.on(ServerEvents.ROOM_CREATED, onCreated);
    socket.on(ServerEvents.ROOM_ERROR, onError);
    if (socket.connected) emit();
    else socket.once('connect', emit);
  };

  const cancel = useCallback(() => {
    if (room) {
      const socket = getSocket();
      if (socket.connected) socket.emit(ClientEvents.LEAVE_ROOM, { roomId: room.roomId });
      clearHostRoom();
    }
    setRoom(null);
  }, [room]);

  useEffect(() => {
    if (!room) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room, cancel]);

  const openMatch = (autostart: boolean) => {
    if (!room) return;
    if (autostart) markAutostart(room.roomId);
    router.push(`/game/${room.roomId}`);
  };

  return (
    <div className="min-h-dvh bg-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/" className="text-sm text-mist hover:text-foam">
          Library
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 lg:grid-cols-[1.1fr_0.9fr]">
        <GameArtwork gameId={gameId} className="w-full rounded-[28px]" />
        <section>
          <p className="font-mono text-xs tracking-[0.22em] text-signal">{game.genre.toUpperCase()}</p>
          <h1 className="mt-3 font-display text-5xl">{game.title}</h1>
          <p className="mt-4 text-lg leading-8 text-mist">{game.summary}</p>
          <div className="mt-6">
            <p className="text-sm text-mist">Difficulty</p>
            <div className="mt-2 flex gap-2">
              {difficulties.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className={`rounded-full px-4 py-2 text-sm ${difficulty === level ? 'bg-accent text-white' : 'bg-navy text-mist'}`}
                >
                  {difficultyLabel(gameId, level)}
                </button>
              ))}
            </div>
          </div>
          <dl className="mt-6 space-y-2 text-sm text-mist">
            <div className="flex justify-between gap-4"><dt>Mode</dt><dd className="text-foam">Single player</dd></div>
            <div className="flex justify-between gap-4"><dt>Opponent</dt><dd className="text-foam">On this screen</dd></div>
            <div className="flex justify-between gap-4"><dt>Controller</dt><dd className="text-foam">{game.control}</dd></div>
            <div className="flex justify-between gap-4"><dt>Match</dt><dd className="text-foam">{game.pointsLabel}</dd></div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-mist">
            Two-phone matches are not available. Keyboard controls remain as a fallback on the laptop.
          </p>
          {onLocalhost && (
            <p className="mt-4 text-sm leading-6 text-warn">
              {lanOrigin
                ? `The QR code will use ${lanOrigin} so a phone on this Wi-Fi can open it.`
                : 'Open this page from the computer’s LAN address so a phone can scan the code.'}
            </p>
          )}
          <Button className="mt-6" onClick={createRoom} disabled={creating || server === 'offline'}>
            {creating ? 'Creating session…' : 'Create session'}
          </Button>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </section>
      </main>
      {room && (
        <PairingModal
          roomId={room.roomId}
          gameId={room.gameId ?? gameId}
          link={link}
          controllerConnected={presence.controllerConnected}
          onStart={() => openMatch(true)}
          onPractice={() => openMatch(false)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}
