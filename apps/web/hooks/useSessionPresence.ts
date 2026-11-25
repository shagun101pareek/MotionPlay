'use client';

import { useEffect, useState } from 'react';
import { ClientEvents, ServerEvents, isValidRoomId, normalizeRoomId } from '@motionplay/shared';
import type { ClientRole, ControllerConnectedPayload, ControllerDisconnectedPayload, Difficulty, GameId, PlayMode, RoomErrorPayload, RoomJoinedPayload, RoomStatus } from '@motionplay/shared';
import { readToken, writeToken } from '@/lib/session';
import { getSocket } from '@/lib/socket';

export interface SessionPresence {
  roomId: string;
  valid: boolean;
  connection: 'connecting' | 'online' | 'offline';
  joined: boolean;
  status: RoomStatus;
  controllerConnected: boolean;
  hostConnected: boolean;
  error: string | null;
  errorCode: string | null;
  gameId: GameId;
  mode: PlayMode;
  difficulty: Difficulty;
}

const idle: Omit<SessionPresence, 'roomId' | 'valid'> = {
  connection: 'connecting',
  joined: false,
  status: 'waiting',
  controllerConnected: false,
  hostConnected: false,
  error: null,
  errorCode: null,
  gameId: 'table-tennis',
  mode: 'single',
  difficulty: 'medium',
};

export function useSessionPresence(roomId: string, role: ClientRole): SessionPresence {
  const normalized = normalizeRoomId(roomId);
  const valid = isValidRoomId(normalized);
  const [presence, setPresence] = useState(idle);

  useEffect(() => {
    if (!valid) {
      setPresence(idle);
      return;
    }
    const socket = getSocket();
    let retired = false;

    const syncConnection = () => {
      setPresence((current) => ({
        ...current,
        connection: socket.connected ? 'online' : 'offline',
      }));
    };

    const join = () => {
      if (retired || !socket.connected) return;
      socket.emit(ClientEvents.JOIN_ROOM, {
        roomId: normalized,
        role,
        sessionToken: readToken(role, normalized),
      });
    };

    const onJoined = (payload: RoomJoinedPayload) => {
      if (payload.roomId !== normalized) return;
      if (payload.role === role && payload.sessionToken) writeToken(role, normalized, payload.sessionToken);
      setPresence((current) => ({
        ...current,
        joined: payload.role === role ? true : current.joined,
        status: payload.status,
        controllerConnected: payload.controllerConnected,
        hostConnected: payload.hostConnected,
        connection: 'online',
        error: payload.hostConnected && current.errorCode === 'HOST_DISCONNECTED' ? null : current.error,
        errorCode: payload.hostConnected && current.errorCode === 'HOST_DISCONNECTED' ? null : current.errorCode,
        gameId: payload.gameId ?? current.gameId,
        mode: payload.mode ?? current.mode,
        difficulty: payload.difficulty ?? current.difficulty,
      }));
    };

    const onControllerConnected = (payload: ControllerConnectedPayload) => {
      if (payload.roomId !== normalized) return;
      setPresence((current) => ({ ...current, controllerConnected: true }));
    };

    const onControllerDisconnected = (payload: ControllerDisconnectedPayload) => {
      if (payload.roomId !== normalized) return;
      setPresence((current) => ({ ...current, controllerConnected: false }));
    };

    const onError = (payload: RoomErrorPayload) => {
      if (payload.roomId && payload.roomId !== normalized) return;
      if (payload.code === 'UNAUTHORIZED') retired = true;
      const fatal = payload.code === 'UNAUTHORIZED' || payload.code === 'ROOM_NOT_FOUND' || payload.code === 'ROOM_EXPIRED';
      setPresence((current) => ({
        ...current,
        joined: fatal ? false : current.joined,
        hostConnected: payload.code === 'HOST_DISCONNECTED' ? false : current.hostConnected,
        error: payload.message,
        errorCode: payload.code,
      }));
    };

    socket.on('connect', syncConnection);
    socket.on('disconnect', syncConnection);
    socket.on('connect', join);
    socket.on(ServerEvents.ROOM_JOINED, onJoined);
    socket.on(ServerEvents.CONTROLLER_CONNECTED, onControllerConnected);
    socket.on(ServerEvents.CONTROLLER_DISCONNECTED, onControllerDisconnected);
    socket.on(ServerEvents.ROOM_ERROR, onError);

    syncConnection();
    if (socket.connected) join();

    return () => {
      socket.off('connect', syncConnection);
      socket.off('disconnect', syncConnection);
      socket.off('connect', join);
      socket.off(ServerEvents.ROOM_JOINED, onJoined);
      socket.off(ServerEvents.CONTROLLER_CONNECTED, onControllerConnected);
      socket.off(ServerEvents.CONTROLLER_DISCONNECTED, onControllerDisconnected);
      socket.off(ServerEvents.ROOM_ERROR, onError);
    };
  }, [normalized, role, valid]);

  return { roomId: normalized, valid, ...presence };
}
