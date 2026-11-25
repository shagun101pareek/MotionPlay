import { io, type Socket } from 'socket.io-client';
import { getServerBaseUrl } from './urls';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('The game socket is only available in the browser.');
  }
  if (!socket) {
    socket = io(getServerBaseUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 3_000,
      timeout: 8_000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}
