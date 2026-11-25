import { randomBytes } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import {
  DEFAULT_CONTROLLER_GRACE_MS,
  DEFAULT_HOST_GRACE_MS,
  DEFAULT_ROOM_TTL_MS,
  ROOM_ID_ALPHABET,
  ROOM_ID_LENGTH,
} from '@motionplay/shared';
import type { ClientRole, Difficulty, GameId, PlayMode, RoomStatus } from '@motionplay/shared';
import type { ClaimResult, ReleaseReason, ReleaseResult, Room, RoomStore } from './roomTypes.js';

const createRoomId = customAlphabet(ROOM_ID_ALPHABET, ROOM_ID_LENGTH);

export interface RoomManagerOptions {
  ttlMs?: number;
  hostGraceMs?: number;
  controllerGraceMs?: number;
  maxRooms?: number;
  now?: () => number;
  createId?: () => string;
  createToken?: () => string;
}

/**
 * Process-local room store. Socket handlers depend on {@link RoomStore}, so a
 * Redis implementation can replace this class without changing the event flow.
 */
export class InMemoryRoomManager implements RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly ttlMs: number;
  private readonly hostGraceMs: number;
  private readonly controllerGraceMs: number;
  private readonly maxRooms: number;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly createToken: () => string;

  constructor(options: RoomManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_ROOM_TTL_MS;
    this.hostGraceMs = options.hostGraceMs ?? DEFAULT_HOST_GRACE_MS;
    this.controllerGraceMs = options.controllerGraceMs ?? DEFAULT_CONTROLLER_GRACE_MS;
    this.maxRooms = options.maxRooms ?? 500;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? createRoomId;
    this.createToken = options.createToken ?? (() => randomBytes(16).toString('hex'));
  }

  create(
    hostSocketId: string,
    options: { gameId?: GameId; mode?: PlayMode; difficulty?: Difficulty } = {},
  ): Room | null {
    if (this.rooms.size >= this.maxRooms) return null;
    const id = this.allocateId();
    if (!id) return null;
    const now = this.now();
    const room: Room = {
      id,
      hostSocketId,
      hostToken: this.createToken(),
      controllerSocketId: null,
      controllerToken: null,
      status: 'waiting',
      gameId: options.gameId ?? 'table-tennis',
      mode: options.mode ?? 'single',
      difficulty: options.difficulty ?? 'medium',
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + this.ttlMs,
      hostLeftAt: null,
      controllerLeftAt: null,
      lastInputTimestamp: 0,
      lastGestureTimestamp: 0,
      lastButtonTimestamp: 0,
    };
    this.rooms.set(id, room);
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  delete(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    this.rooms.delete(roomId);
    return room;
  }

  claimHost(
    roomId: string,
    socketId: string,
    token: string | undefined,
    previousAlive: boolean,
    now = this.now(),
  ): ClaimResult {
    return this.claimSeat('host', roomId, socketId, token, previousAlive, now);
  }

  claimController(
    roomId: string,
    socketId: string,
    token: string | undefined,
    previousAlive: boolean,
    now = this.now(),
  ): ClaimResult {
    return this.claimSeat('controller', roomId, socketId, token, previousAlive, now);
  }

  release(roomId: string, role: ClientRole, socketId: string, reason: ReleaseReason, now = this.now()): ReleaseResult {
    const room = this.rooms.get(roomId);
    if (!room) return { room: undefined, vacated: false };
    const seatId = role === 'host' ? room.hostSocketId : room.controllerSocketId;
    if (seatId !== socketId) return { room, vacated: false };

    if (role === 'host') {
      room.hostSocketId = null;
      room.hostLeftAt = reason === 'disconnect' ? now : null;
      if (reason === 'leave') room.hostToken = this.createToken();
    } else {
      room.controllerSocketId = null;
      room.controllerLeftAt = reason === 'disconnect' ? now : null;
      if (reason === 'leave') room.controllerToken = null;
    }
    return { room, vacated: true };
  }

  setStatus(roomId: string, status: RoomStatus, now = this.now()): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room || this.isExpired(room, now)) return undefined;
    room.status = status;
    this.touch(room, now);
    return room;
  }

  recordInput(roomId: string, timestamp: number, now = this.now()): boolean {
    return this.recordStamp(roomId, 'lastInputTimestamp', timestamp, now);
  }

  recordGesture(roomId: string, timestamp: number, now = this.now()): boolean {
    return this.recordStamp(roomId, 'lastGestureTimestamp', timestamp, now);
  }

  recordButton(roomId: string, timestamp: number, now = this.now()): boolean {
    return this.recordStamp(roomId, 'lastButtonTimestamp', timestamp, now);
  }

  private recordStamp(
    roomId: string,
    field: 'lastInputTimestamp' | 'lastGestureTimestamp' | 'lastButtonTimestamp',
    timestamp: number,
    now: number,
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room || this.isExpired(room, now)) return false;
    if (timestamp < room[field]) return false;
    room[field] = timestamp;
    this.touch(room, now);
    return true;
  }

  isExpired(room: Room, now = this.now()): boolean {
    return now >= room.expiresAt;
  }

  sweep(now = this.now()): Room[] {
    const expired: Room[] = [];
    for (const room of this.rooms.values()) {
      const hostAbandoned =
        room.hostSocketId === null && room.hostLeftAt !== null && now - room.hostLeftAt > this.hostGraceMs;
      if (this.isExpired(room, now) || hostAbandoned) {
        expired.push(room);
        this.rooms.delete(room.id);
      }
    }
    return expired;
  }

  count(): number {
    return this.rooms.size;
  }

  private claimSeat(
    role: ClientRole,
    roomId: string,
    socketId: string,
    token: string | undefined,
    previousAlive: boolean,
    now: number,
  ): ClaimResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'This room does not exist.' };
    }
    if (this.isExpired(room, now)) {
      this.rooms.delete(room.id);
      return {
        ok: false,
        code: 'ROOM_EXPIRED',
        message: 'This room has expired. Start a new game from the laptop.',
      };
    }

    const currentSocketId = role === 'host' ? room.hostSocketId : room.controllerSocketId;
    const currentToken = role === 'host' ? room.hostToken : room.controllerToken;
    const leftAt = role === 'host' ? room.hostLeftAt : room.controllerLeftAt;
    const graceMs = role === 'host' ? this.hostGraceMs : this.controllerGraceMs;
    const tokenMatches = Boolean(token && currentToken && token === currentToken);

    if (currentSocketId === socketId) {
      this.clearLeftAt(room, role);
      this.touch(room, now);
      return {
        ok: true,
        room,
        sessionToken: this.tokenFor(room, role),
        replacedSocketId: null,
        reconnected: false,
      };
    }

    if (tokenMatches) {
      const replacedSocketId = currentSocketId && currentSocketId !== socketId ? currentSocketId : null;
      this.seat(room, role, socketId, currentToken as string);
      this.touch(room, now);
      return { ok: true, room, sessionToken: currentToken as string, replacedSocketId, reconnected: true };
    }

    if (currentSocketId && currentSocketId !== socketId) {
      return {
        ok: false,
        code: role === 'host' ? 'HOST_TAKEN' : 'CONTROLLER_TAKEN',
        message: previousAlive
          ? role === 'host'
            ? 'This room already has a game display.'
            : 'Another phone is already controlling this room.'
          : role === 'host'
            ? 'The game display is reconnecting. Wait a moment and try again.'
            : 'The previous controller is reconnecting. Wait a moment and try again.',
      };
    }

    if (leftAt !== null && now - leftAt < graceMs) {
      return {
        ok: false,
        code: role === 'host' ? 'HOST_TAKEN' : 'CONTROLLER_TAKEN',
        message:
          role === 'host'
            ? 'The game display is reconnecting. Wait a moment and try again.'
            : 'The previous controller is reconnecting. Wait a moment and try again.',
      };
    }

    const sessionToken = role === 'host' ? this.createToken() : this.createToken();
    this.seat(room, role, socketId, sessionToken);
    this.touch(room, now);
    return { ok: true, room, sessionToken, replacedSocketId: null, reconnected: false };
  }

  private seat(room: Room, role: ClientRole, socketId: string, token: string): void {
    if (role === 'host') {
      room.hostSocketId = socketId;
      room.hostToken = token;
      room.hostLeftAt = null;
      return;
    }
    room.controllerSocketId = socketId;
    room.controllerToken = token;
    room.controllerLeftAt = null;
  }

  private clearLeftAt(room: Room, role: ClientRole): void {
    if (role === 'host') room.hostLeftAt = null;
    else room.controllerLeftAt = null;
  }

  private tokenFor(room: Room, role: ClientRole): string {
    if (role === 'host') return room.hostToken;
    if (!room.controllerToken) room.controllerToken = this.createToken();
    return room.controllerToken;
  }

  private touch(room: Room, now: number): void {
    room.lastActivityAt = now;
    room.expiresAt = now + this.ttlMs;
  }

  private allocateId(): string | null {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = this.createId();
      if (!this.rooms.has(id)) return id;
    }
    return null;
  }
}
