import type { Server, Socket } from 'socket.io';
import { isValidRoomId, normalizeRoomId } from '@motionplay/shared';
import type {
  ClientRole,
  ControllerDisconnectedPayload,
  GameLifecyclePayload,
  RoomErrorPayload,
  RoomJoinedPayload,
} from '@motionplay/shared';
import { InMemoryRoomManager } from '../rooms/roomManager.js';
import type { Room, RoomStore } from '../rooms/roomTypes.js';
import {
  createInputGates,
  parseCreateRoom,
  parseJoin,
  parseRoomCommand,
  sanitizeControllerButton,
  sanitizeControllerGesture,
  sanitizeControllerInput,
} from '../utils/validate.js';
import { ClientEvents, ServerEvents, roomChannel } from './events.js';

interface Membership {
  roomId: string;
  role: ClientRole;
}

export interface SocketHandlerOptions {
  rooms?: RoomStore;
  disconnectGraceMs?: number;
  sweepIntervalMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function registerSocketHandlers(io: Server, options: SocketHandlerOptions = {}): () => void {
  const rooms = options.rooms ?? new InMemoryRoomManager();
  const disconnectGraceMs = options.disconnectGraceMs ?? 1_500;
  const gates = createInputGates();
  const membership = new Map<string, Membership>();
  const releaseTimers = new Map<string, NodeJS.Timeout>();
  const invalidPayloadAt = new Map<string, number>();

  const cancelRelease = (socketId: string): void => {
    const timer = releaseTimers.get(socketId);
    if (!timer) return;
    clearTimeout(timer);
    releaseTimers.delete(socketId);
  };

  const scheduleRelease = (socketId: string, release: () => void): void => {
    cancelRelease(socketId);
    const timer = setTimeout(() => {
      releaseTimers.delete(socketId);
      release();
    }, disconnectGraceMs);
    releaseTimers.set(socketId, timer);
  };

  const emitError = (socket: Socket, error: RoomErrorPayload): void => {
    socket.emit(ServerEvents.ROOM_ERROR, error);
  };

  const clearMember = (socketId: string): void => {
    membership.delete(socketId);
    gates.state.clear(socketId);
    gates.gesture.clear(socketId);
    gates.button.clear(socketId);
    invalidPayloadAt.delete(socketId);
    cancelRelease(socketId);
  };

  const seatAlive = (socketId: string | null | undefined): boolean => {
    if (!socketId) return false;
    return Boolean(io.sockets.sockets.get(socketId)?.connected);
  };

  const joinedPayload = (
    room: Room,
    role: ClientRole,
    sessionToken: string | undefined,
    reconnected: boolean,
  ): RoomJoinedPayload => ({
    roomId: room.id,
    role,
    status: room.status,
    controllerConnected: Boolean(room.controllerSocketId),
    hostConnected: Boolean(room.hostSocketId),
    reconnected,
    sessionToken,
    gameId: room.gameId,
    mode: room.mode,
    difficulty: room.difficulty,
  });

  const forgetRoom = (roomId: string): void => {
    for (const [socketId, member] of membership) {
      if (member.roomId !== roomId) continue;
      clearMember(socketId);
      io.sockets.sockets.get(socketId)?.leave(roomChannel(roomId));
    }
  };

  const closeRoom = (roomId: string, message: string): void => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.controllerSocketId) {
      io.to(room.controllerSocketId).emit(ServerEvents.ROOM_ERROR, {
        roomId,
        code: 'HOST_DISCONNECTED',
        message,
      } satisfies RoomErrorPayload);
    }
    forgetRoom(roomId);
    rooms.delete(roomId);
  };

  const vacate = (socketId: string, member: Membership, reason: 'disconnect' | 'leave'): void => {
    const result = rooms.release(member.roomId, member.role, socketId, reason);
    clearMember(socketId);
    io.sockets.sockets.get(socketId)?.leave(roomChannel(member.roomId));
    if (!result.vacated || !result.room) return;

    if (member.role === 'controller') {
      const payload: ControllerDisconnectedPayload = {
        roomId: member.roomId,
        reason: reason === 'leave' ? 'left' : 'disconnect',
      };
      io.to(roomChannel(member.roomId)).emit(ServerEvents.CONTROLLER_DISCONNECTED, payload);
      return;
    }

    if (result.room.controllerSocketId) {
      io.to(result.room.controllerSocketId).emit(ServerEvents.ROOM_ERROR, {
        roomId: member.roomId,
        code: 'HOST_DISCONNECTED',
        message: 'The game display disconnected. It can reconnect to this room.',
      } satisfies RoomErrorPayload);
    }
  };

  const onConnection = (socket: Socket): void => {
    socket.on(ClientEvents.CREATE_ROOM, (raw: unknown) => {
      const request = parseCreateRoom(raw);
      if (!request || !request.gameId || !request.mode || !request.difficulty) {
        emitError(socket, { code: 'INVALID_PAYLOAD', message: 'That game setup was not valid.' });
        return;
      }
      const existing = membership.get(socket.id);
      if (existing?.role === 'host') closeRoom(existing.roomId, 'The host started a new room.');
      else if (existing) vacate(socket.id, existing, 'leave');

      const room = rooms.create(socket.id, request);
      if (!room) {
        emitError(socket, {
          code: 'ROOM_FULL',
          message: 'The server is hosting too many rooms. Try again shortly.',
        });
        return;
      }

      membership.set(socket.id, { roomId: room.id, role: 'host' });
      void socket.join(roomChannel(room.id));
      socket.emit(ServerEvents.ROOM_CREATED, {
        roomId: room.id,
        expiresAt: room.expiresAt,
        sessionToken: room.hostToken,
        gameId: room.gameId,
        mode: room.mode,
        difficulty: room.difficulty,
      });
    });

    socket.on(ClientEvents.JOIN_ROOM, (raw: unknown) => {
      if (isRecord(raw) && typeof raw.roomId === 'string' && !isValidRoomId(normalizeRoomId(raw.roomId))) {
        emitError(socket, { code: 'INVALID_ROOM', message: 'That room code is not valid.' });
        return;
      }

      const parsed = parseJoin(raw);
      if (!parsed) {
        emitError(socket, { code: 'INVALID_PAYLOAD', message: 'The join request was not valid.' });
        return;
      }

      const existing = membership.get(socket.id);
      if (existing && (existing.roomId !== parsed.roomId || existing.role !== parsed.role)) {
        if (existing.role === 'host') closeRoom(existing.roomId, 'The host left the room.');
        else vacate(socket.id, existing, 'leave');
      }

      const current = rooms.get(parsed.roomId);
      const previousSocketId = parsed.role === 'host' ? current?.hostSocketId : current?.controllerSocketId;
      const claim =
        parsed.role === 'host'
          ? rooms.claimHost(parsed.roomId, socket.id, parsed.sessionToken, seatAlive(previousSocketId))
          : rooms.claimController(parsed.roomId, socket.id, parsed.sessionToken, seatAlive(previousSocketId));

      if (!claim.ok) {
        emitError(socket, { roomId: parsed.roomId, code: claim.code, message: claim.message });
        return;
      }

      if (claim.replacedSocketId) {
        const replaced = io.sockets.sockets.get(claim.replacedSocketId);
        clearMember(claim.replacedSocketId);
        if (replaced) {
          void replaced.leave(roomChannel(parsed.roomId));
          emitError(replaced, {
            roomId: parsed.roomId,
            code: 'UNAUTHORIZED',
            message:
              parsed.role === 'host'
                ? 'This game display continued in a new tab.'
                : 'This controller session continued on a new connection.',
          });
        }
      }

      cancelRelease(socket.id);
      membership.set(socket.id, { roomId: parsed.roomId, role: parsed.role });
      void socket.join(roomChannel(parsed.roomId));

      socket.emit(
        ServerEvents.ROOM_JOINED,
        joinedPayload(claim.room, parsed.role, claim.sessionToken, claim.reconnected),
      );
      socket.to(roomChannel(parsed.roomId)).emit(
        ServerEvents.ROOM_JOINED,
        joinedPayload(claim.room, parsed.role, undefined, claim.reconnected),
      );

      if (parsed.role === 'controller') {
        socket.to(roomChannel(parsed.roomId)).emit(ServerEvents.CONTROLLER_CONNECTED, {
          roomId: parsed.roomId,
          connectedAt: Date.now(),
        });
      }
    });

    socket.on(ClientEvents.CONTROLLER_INPUT, (raw: unknown, ack?: unknown) => {
      const reply = (body: { serverTime: number; dropped?: boolean }) => {
        if (typeof ack === 'function') ack(body);
      };
      const member = membership.get(socket.id);
      if (!member || member.role !== 'controller') {
        emitError(socket, { code: 'UNAUTHORIZED', message: 'Only the controller can send input.' });
        return;
      }
      if (!gates.state.allow(socket.id)) {
        reply({ serverTime: Date.now(), dropped: true });
        return;
      }

      const parsed = sanitizeControllerInput(raw);
      if (!parsed) {
        const now = Date.now();
        if (now - (invalidPayloadAt.get(socket.id) ?? 0) > 1_000) {
          invalidPayloadAt.set(socket.id, now);
          emitError(socket, {
            roomId: member.roomId,
            code: 'INVALID_PAYLOAD',
            message: 'Controller input was rejected.',
          });
        }
        return;
      }
      if (parsed.roomId !== member.roomId) {
        emitError(socket, {
          roomId: member.roomId,
          code: 'INVALID_ROOM',
          message: 'Input was sent to a different room.',
        });
        return;
      }

      const room = rooms.get(member.roomId);
      if (!room) {
        emitError(socket, { roomId: member.roomId, code: 'ROOM_NOT_FOUND', message: 'This room no longer exists.' });
        return;
      }
      if (rooms.isExpired(room)) {
        emitError(socket, {
          roomId: member.roomId,
          code: 'ROOM_EXPIRED',
          message: 'This room has expired. Start a new game from the laptop.',
        });
        return;
      }
      if (!rooms.recordInput(member.roomId, parsed.state.timestamp)) {
        reply({ serverTime: Date.now(), dropped: true });
        return;
      }

      const serverTime = Date.now();
      socket.to(roomChannel(member.roomId)).emit(ServerEvents.CONTROLLER_INPUT, {
        ...parsed,
        serverTime,
      });
      reply({ serverTime });
    });

    const relayDiscrete = (
      kind: 'gesture' | 'button',
      raw: unknown,
      parse: (value: unknown) => { roomId: string; timestamp: number } | null,
      record: (roomId: string, timestamp: number) => boolean,
      event: typeof ServerEvents.CONTROLLER_GESTURE | typeof ServerEvents.CONTROLLER_BUTTON,
    ) => {
      const member = membership.get(socket.id);
      if (!member || member.role !== 'controller') {
        emitError(socket, { code: 'UNAUTHORIZED', message: 'Only the controller can send input.' });
        return;
      }
      const limiter = kind === 'gesture' ? gates.gesture : gates.button;
      if (!limiter.allow(socket.id)) return;
      const parsed = parse(raw);
      if (!parsed) {
        const now = Date.now();
        if (now - (invalidPayloadAt.get(socket.id) ?? 0) > 1_000) {
          invalidPayloadAt.set(socket.id, now);
          emitError(socket, {
            roomId: member.roomId,
            code: 'INVALID_PAYLOAD',
            message: 'Controller input was rejected.',
          });
        }
        return;
      }
      if (parsed.roomId !== member.roomId) {
        emitError(socket, {
          roomId: member.roomId,
          code: 'INVALID_ROOM',
          message: 'Input was sent to a different room.',
        });
        return;
      }
      const room = rooms.get(member.roomId);
      if (!room || rooms.isExpired(room)) return;
      if (!record(member.roomId, parsed.timestamp)) return;
      socket.to(roomChannel(member.roomId)).emit(event, { ...parsed, serverTime: Date.now() });
    };

    socket.on(ClientEvents.CONTROLLER_GESTURE, (raw: unknown) => {
      relayDiscrete('gesture', raw, sanitizeControllerGesture, (roomId, timestamp) => rooms.recordGesture(roomId, timestamp), ServerEvents.CONTROLLER_GESTURE);
    });

    socket.on(ClientEvents.CONTROLLER_BUTTON, (raw: unknown) => {
      relayDiscrete('button', raw, sanitizeControllerButton, (roomId, timestamp) => rooms.recordButton(roomId, timestamp), ServerEvents.CONTROLLER_BUTTON);
    });

    const requireHost = (raw: unknown): string | null => {
      const member = membership.get(socket.id);
      if (!member || member.role !== 'host') {
        emitError(socket, { code: 'UNAUTHORIZED', message: 'Only the game display can control the match.' });
        return null;
      }
      const parsed = parseRoomCommand(raw);
      if (!parsed || parsed.roomId !== member.roomId) {
        emitError(socket, {
          roomId: member.roomId,
          code: parsed ? 'INVALID_ROOM' : 'INVALID_PAYLOAD',
          message: parsed ? 'That command was for a different room.' : 'The match command was not valid.',
        });
        return null;
      }
      return parsed.roomId;
    };

    socket.on(ClientEvents.START_GAME, (raw: unknown) => {
      const roomId = requireHost(raw);
      if (!roomId) return;
      const room = rooms.setStatus(roomId, 'playing');
      if (!room) {
        emitError(socket, { roomId, code: 'ROOM_EXPIRED', message: 'This room has expired.' });
        return;
      }
      const payload: GameLifecyclePayload = { roomId: room.id, status: room.status, serverTime: Date.now() };
      io.to(roomChannel(room.id)).emit(ServerEvents.GAME_STARTED, payload);
    });

    socket.on(ClientEvents.PAUSE_GAME, (raw: unknown) => {
      const roomId = requireHost(raw);
      if (!roomId) return;
      const current = rooms.get(roomId);
      if (!current || current.status === 'waiting') return;
      const room = rooms.setStatus(roomId, 'paused');
      if (!room) return;
      const payload: GameLifecyclePayload = { roomId: room.id, status: 'paused', serverTime: Date.now() };
      io.to(roomChannel(room.id)).emit(ServerEvents.GAME_PAUSED, payload);
    });

    socket.on(ClientEvents.RESTART_GAME, (raw: unknown) => {
      const roomId = requireHost(raw);
      if (!roomId) return;
      const room = rooms.setStatus(roomId, 'playing');
      if (!room) return;
      const payload: GameLifecyclePayload = { roomId: room.id, status: 'playing', serverTime: Date.now() };
      io.to(roomChannel(room.id)).emit(ServerEvents.GAME_RESTARTED, payload);
    });

    socket.on(ClientEvents.LEAVE_ROOM, (raw: unknown) => {
      const member = membership.get(socket.id);
      if (!member) {
        emitError(socket, { code: 'NOT_IN_ROOM', message: 'You are not in a room.' });
        return;
      }
      const parsed = parseRoomCommand(raw);
      if (parsed && parsed.roomId !== member.roomId) {
        emitError(socket, {
          roomId: member.roomId,
          code: 'INVALID_ROOM',
          message: 'That leave request was for a different room.',
        });
        return;
      }
      cancelRelease(socket.id);
      if (member.role === 'host') {
        closeRoom(member.roomId, 'The game display closed this room.');
        return;
      }
      vacate(socket.id, member, 'leave');
    });

    socket.on('disconnect', () => {
      const member = membership.get(socket.id);
      if (!member) return;
      scheduleRelease(socket.id, () => {
        if (io.sockets.sockets.get(socket.id)?.connected) return;
        const current = membership.get(socket.id);
        if (!current) return;
        vacate(socket.id, current, 'disconnect');
      });
    });
  };

  io.on('connection', onConnection);

  const sweepTimer =
    options.sweepIntervalMs && options.sweepIntervalMs > 0
      ? setInterval(() => {
          for (const room of rooms.sweep()) {
            io.to(roomChannel(room.id)).emit(ServerEvents.ROOM_ERROR, {
              roomId: room.id,
              code: 'ROOM_EXPIRED',
              message: 'This room has expired. Start a new game from the laptop.',
            } satisfies RoomErrorPayload);
            forgetRoom(room.id);
          }
        }, options.sweepIntervalMs)
      : undefined;

  return () => {
    if (sweepTimer) clearInterval(sweepTimer);
    for (const timer of releaseTimers.values()) clearTimeout(timer);
    releaseTimers.clear();
    io.off('connection', onConnection);
  };
}
