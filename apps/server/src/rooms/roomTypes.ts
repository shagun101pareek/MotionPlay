import type { ClientRole, Difficulty, GameId, PlayMode, RoomErrorCode, RoomStatus } from '@motionplay/shared';

export interface Room {
  id: string;
  hostSocketId: string | null;
  hostToken: string;
  controllerSocketId: string | null;
  controllerToken: string | null;
  status: RoomStatus;
  gameId: GameId;
  mode: PlayMode;
  difficulty: Difficulty;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  hostLeftAt: number | null;
  controllerLeftAt: number | null;
  lastInputTimestamp: number;
  lastGestureTimestamp: number;
  lastButtonTimestamp: number;
}

export type ReleaseReason = 'disconnect' | 'leave';

export interface ClaimSuccess {
  ok: true;
  room: Room;
  sessionToken: string;
  replacedSocketId: string | null;
  reconnected: boolean;
}

export interface ClaimFailure {
  ok: false;
  code: RoomErrorCode;
  message: string;
}

export type ClaimResult = ClaimSuccess | ClaimFailure;

export interface ReleaseResult {
  room: Room | undefined;
  vacated: boolean;
}

export interface RoomStore {
  create(hostSocketId: string, options?: { gameId?: GameId; mode?: PlayMode; difficulty?: Difficulty }): Room | null;
  get(roomId: string): Room | undefined;
  delete(roomId: string): Room | undefined;
  claimHost(roomId: string, socketId: string, token: string | undefined, previousAlive: boolean, now?: number): ClaimResult;
  claimController(roomId: string, socketId: string, token: string | undefined, previousAlive: boolean, now?: number): ClaimResult;
  release(roomId: string, role: ClientRole, socketId: string, reason: ReleaseReason, now?: number): ReleaseResult;
  setStatus(roomId: string, status: RoomStatus, now?: number): Room | undefined;
  recordInput(roomId: string, timestamp: number, now?: number): boolean;
  recordGesture(roomId: string, timestamp: number, now?: number): boolean;
  recordButton(roomId: string, timestamp: number, now?: number): boolean;
  isExpired(room: Room, now?: number): boolean;
  sweep(now?: number): Room[];
  count(): number;
}
