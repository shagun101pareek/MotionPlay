import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Server } from 'socket.io';
import { io as createClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@motionplay/shared';
import type {
  ControllerConnectedPayload,
  ControllerDisconnectedPayload,
  GameLifecyclePayload,
  RelayedControllerInput,
  RoomCreatedPayload,
  RoomErrorPayload,
  RoomJoinedPayload,
} from '@motionplay/shared';
import { InMemoryRoomManager } from '../rooms/roomManager.js';
import { registerSocketHandlers } from './handlers.js';

function once<T>(socket: Socket, event: string, timeoutMs = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, onEvent);
  });
}

function connected(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return once(socket, 'connect');
}

async function withServer(run: (url: string) => Promise<void>): Promise<void> {
  const httpServer = createServer();
  const io = new Server(httpServer, { pingInterval: 1_000, pingTimeout: 500 });
  const dispose = registerSocketHandlers(io, {
    rooms: new InMemoryRoomManager({ ttlMs: 60_000 }),
    disconnectGraceMs: 40,
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    dispose();
    io.disconnectSockets(true);
    await io.close();
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }
}

test('a phone can join a room and move the racket', async () => {
  await withServer(async (url) => {
    const host = createClient(url, { transports: ['websocket'], forceNew: true });
    const phone = createClient(url, { transports: ['websocket'], forceNew: true });
    const intruder = createClient(url, { transports: ['websocket'], forceNew: true });
    try {
      await connected(host);
      const createdPromise = once<RoomCreatedPayload>(host, ServerEvents.ROOM_CREATED);
      host.emit(ClientEvents.CREATE_ROOM);
      const created = await createdPromise;
      assert.match(created.roomId, /^[2-9A-HJ-NP-Z]{8}$/);
      assert.match(created.sessionToken, /^[a-f0-9]{32}$/);

      await connected(phone);
      const joinedPromise = once<RoomJoinedPayload>(phone, ServerEvents.ROOM_JOINED);
      const connectedPromise = once<ControllerConnectedPayload>(host, ServerEvents.CONTROLLER_CONNECTED);
      phone.emit(ClientEvents.JOIN_ROOM, { roomId: created.roomId, role: 'controller' });
      const joined = await joinedPromise;
      const linked = await connectedPromise;
      assert.equal(joined.roomId, created.roomId);
      assert.equal(joined.controllerConnected, true);
      assert.equal(linked.roomId, created.roomId);
      assert.match(joined.sessionToken ?? '', /^[a-f0-9]{32}$/);

      const inputPromise = once<RelayedControllerInput>(host, ServerEvents.CONTROLLER_INPUT);
      phone.emit(ClientEvents.CONTROLLER_INPUT, {
        roomId: created.roomId,
        state: {
          orientation: { alpha: 0, beta: 0, gamma: 12 },
          rotation: { alpha: 0, beta: 0, gamma: 0 },
          acceleration: { x: 0, y: 0, z: 0 },
          movement: { horizontal: 2, vertical: -0.25 },
          racketAngle: 0.1,
          buttons: { action: false, special: false },
          sensors: { orientation: true, rotation: true, acceleration: false },
          sequence: 1,
          timestamp: Date.now(),
        },
      });
      const input = await inputPromise;
      assert.equal(input.state.movement.horizontal, 1);
      assert.equal(input.state.movement.vertical, -0.25);
      assert.equal(typeof input.serverTime, 'number');
      assert.equal(created.gameId, 'table-tennis');

      await connected(intruder);
      const deniedPromise = once<RoomErrorPayload>(intruder, ServerEvents.ROOM_ERROR);
      intruder.emit(ClientEvents.JOIN_ROOM, { roomId: created.roomId, role: 'controller' });
      const denied = await deniedPromise;
      assert.equal(denied.code, 'CONTROLLER_TAKEN');

      const invalidPromise = once<RoomErrorPayload>(intruder, ServerEvents.ROOM_ERROR);
      intruder.emit(ClientEvents.JOIN_ROOM, { roomId: 'not-a-room', role: 'controller' });
      const invalid = await invalidPromise;
      assert.equal(invalid.code, 'INVALID_ROOM');

      const unauthorizedPromise = once<RoomErrorPayload>(phone, ServerEvents.ROOM_ERROR);
      phone.emit(ClientEvents.START_GAME, { roomId: created.roomId });
      const unauthorized = await unauthorizedPromise;
      assert.equal(unauthorized.code, 'UNAUTHORIZED');

      const startedPromise = once<GameLifecyclePayload>(host, ServerEvents.GAME_STARTED);
      host.emit(ClientEvents.START_GAME, { roomId: created.roomId });
      const started = await startedPromise;
      assert.equal(started.status, 'playing');

      const pausedPromise = once<GameLifecyclePayload>(phone, ServerEvents.GAME_PAUSED);
      host.emit(ClientEvents.PAUSE_GAME, { roomId: created.roomId });
      const paused = await pausedPromise;
      assert.equal(paused.status, 'paused');

      const leftPromise = once<ControllerDisconnectedPayload>(host, ServerEvents.CONTROLLER_DISCONNECTED);
      phone.emit(ClientEvents.LEAVE_ROOM, { roomId: created.roomId });
      const left = await leftPromise;
      assert.equal(left.reason, 'left');

      const missingPromise = once<RoomErrorPayload>(intruder, ServerEvents.ROOM_ERROR);
      intruder.emit(ClientEvents.JOIN_ROOM, { roomId: 'ZZZZZZZZ', role: 'controller' });
      const missing = await missingPromise;
      assert.equal(missing.code, 'ROOM_NOT_FOUND');
    } finally {
      host.disconnect();
      phone.disconnect();
      intruder.disconnect();
    }
  });
});

test('a dropped controller is announced after the reconnect grace', async () => {
  await withServer(async (url) => {
    const host = createClient(url, { transports: ['websocket'], forceNew: true });
    const phone = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    try {
      await connected(host);
      const createdPromise = once<RoomCreatedPayload>(host, ServerEvents.ROOM_CREATED);
      host.emit(ClientEvents.CREATE_ROOM);
      const created = await createdPromise;

      await connected(phone);
      const joinedPromise = once<RoomJoinedPayload>(phone, ServerEvents.ROOM_JOINED);
      phone.emit(ClientEvents.JOIN_ROOM, { roomId: created.roomId, role: 'controller' });
      await joinedPromise;

      const droppedPromise = once<ControllerDisconnectedPayload>(host, ServerEvents.CONTROLLER_DISCONNECTED, 2_000);
      phone.disconnect();
      const dropped = await droppedPromise;
      assert.equal(dropped.reason, 'disconnect');
    } finally {
      host.disconnect();
      phone.disconnect();
    }
  });
});
