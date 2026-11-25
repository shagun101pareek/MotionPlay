import type { ClientRole, Difficulty, GameId } from '@motionplay/shared';

const ACTIVE_HOST_ROOM = 'motionplay:host-room';
const AUTOSTART = 'motionplay:autostart';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function tokenKey(role: ClientRole, roomId: string): string {
  return `motionplay:${role}:${roomId}`;
}

export function readToken(role: ClientRole, roomId: string): string | undefined {
  return storage()?.getItem(tokenKey(role, roomId)) ?? undefined;
}

export function writeToken(role: ClientRole, roomId: string, token: string): void {
  storage()?.setItem(tokenKey(role, roomId), token);
}

export function clearToken(role: ClientRole, roomId: string): void {
  storage()?.removeItem(tokenKey(role, roomId));
}

export interface HostRoomRecord {
  roomId: string;
  sessionToken: string;
  expiresAt: number;
  gameId?: GameId;
  difficulty?: Difficulty;
}

export function writeHostRoom(room: HostRoomRecord): void {
  writeToken('host', room.roomId, room.sessionToken);
  storage()?.setItem(ACTIVE_HOST_ROOM, JSON.stringify(room));
}

export function readHostRoom(): HostRoomRecord | null {
  const raw = storage()?.getItem(ACTIVE_HOST_ROOM);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HostRoomRecord;
    if (!parsed.roomId || !parsed.sessionToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearHostRoom(): void {
  const current = readHostRoom();
  if (current) clearToken('host', current.roomId);
  storage()?.removeItem(ACTIVE_HOST_ROOM);
}

export function markAutostart(roomId: string): void {
  storage()?.setItem(AUTOSTART, roomId);
}

export function consumeAutostart(roomId: string): boolean {
  const store = storage();
  if (!store || store.getItem(AUTOSTART) !== roomId) return false;
  store.removeItem(AUTOSTART);
  return true;
}
