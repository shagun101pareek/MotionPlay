import type { Difficulty, GameId, PlayMode } from './games.js';

export type ClientRole = 'host' | 'controller';

export type RoomStatus = 'waiting' | 'playing' | 'paused';

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL'
  | 'CONTROLLER_TAKEN'
  | 'HOST_TAKEN'
  | 'HOST_DISCONNECTED'
  | 'INVALID_PAYLOAD'
  | 'INVALID_ROOM'
  | 'UNAUTHORIZED'
  | 'NOT_IN_ROOM';

export interface CreateRoomPayload {
  gameId?: GameId;
  mode?: PlayMode;
  difficulty?: Difficulty;
}

export interface RoomCreatedPayload {
  roomId: string;
  expiresAt: number;
  sessionToken: string;
  gameId: GameId;
  mode: PlayMode;
  difficulty: Difficulty;
}

export interface JoinRoomPayload {
  roomId: string;
  role: ClientRole;
  sessionToken?: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  role: ClientRole;
  status: RoomStatus;
  controllerConnected: boolean;
  hostConnected: boolean;
  reconnected: boolean;
  sessionToken?: string;
  gameId: GameId;
  mode: PlayMode;
  difficulty: Difficulty;
}

export interface ControllerConnectedPayload {
  roomId: string;
  connectedAt: number;
}

export interface ControllerDisconnectedPayload {
  roomId: string;
  reason: 'disconnect' | 'left';
}

export interface RoomCommandPayload {
  roomId: string;
}

export interface GameLifecyclePayload {
  roomId: string;
  status: RoomStatus;
  serverTime: number;
}

export interface RoomErrorPayload {
  roomId?: string;
  code: RoomErrorCode;
  message: string;
}

export interface RoomStatusResponse {
  exists: boolean;
  status?: RoomStatus;
  controllerConnected?: boolean;
  hostConnected?: boolean;
  expiresAt?: number;
  gameId?: GameId;
  mode?: PlayMode;
  difficulty?: Difficulty;
}
