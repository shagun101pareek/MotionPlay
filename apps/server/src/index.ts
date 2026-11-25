import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { isValidRoomId, normalizeRoomId } from '@motionplay/shared';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { InMemoryRoomManager } from './rooms/roomManager.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { getLanIPv4Addresses } from './utils/network.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigin }));

const rooms = new InMemoryRoomManager({
  ttlMs: config.roomTtlMs,
  hostGraceMs: config.hostGraceMs,
  controllerGraceMs: config.controllerGraceMs,
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.count() });
});

app.get('/network', (_req, res) => {
  res.json({ port: config.port, addresses: getLanIPv4Addresses() });
});

app.get('/rooms/:roomId', (req, res) => {
  const roomId = normalizeRoomId(req.params.roomId);
  if (!isValidRoomId(roomId)) {
    res.status(400).json({ exists: false });
    return;
  }
  const room = rooms.get(roomId);
  if (!room || rooms.isExpired(room)) {
    res.status(404).json({ exists: false });
    return;
  }
  res.json({
    exists: true,
    status: room.status,
    controllerConnected: Boolean(room.controllerSocketId),
    hostConnected: Boolean(room.hostSocketId),
    gameId: room.gameId,
    mode: room.mode,
    difficulty: room.difficulty,
    expiresAt: room.expiresAt,
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = config.tls
  ? createHttpsServer(
      {
        key: readFileSync(config.tls.keyPath),
        cert: readFileSync(config.tls.certPath),
      },
      app,
    )
  : createHttpServer(app);

const io = new Server(httpServer, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingInterval: 10_000,
  pingTimeout: 8_000,
});

const dispose = registerSocketHandlers(io, {
  rooms,
  disconnectGraceMs: config.disconnectGraceMs,
  sweepIntervalMs: config.sweepIntervalMs,
});

httpServer.listen(config.port, config.host, () => {
  const protocol = config.tls ? 'https' : 'http';
  console.log(`MotionPlay server listening on ${protocol}://${config.host}:${config.port}`);
  for (const address of getLanIPv4Addresses()) {
    console.log(`  network  ${protocol}://${address}:${config.port}`);
  }
});

function shutdown(): void {
  dispose();
  void io.close();
  httpServer.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
