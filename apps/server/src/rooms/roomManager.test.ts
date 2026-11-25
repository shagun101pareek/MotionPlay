import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryRoomManager } from './roomManager.js';

function manager() {
  let clock = 10_000;
  let ids = 0;
  let tokens = 0;
  const rooms = new InMemoryRoomManager({
    ttlMs: 1_000,
    hostGraceMs: 400,
    controllerGraceMs: 200,
    now: () => clock,
    createId: () => `ABCDE${String(++ids).padStart(3, 'F')}`,
    createToken: () => `token${++tokens}token${tokens}`.padEnd(16, 'a'),
  });
  return {
    rooms,
    advance(ms: number) {
      clock += ms;
    },
    now: () => clock,
  };
}

test('the host who creates a room can be joined by one controller', () => {
  const { rooms } = manager();
  const room = rooms.create('host-1');
  assert.ok(room);
  const joined = rooms.claimController(room.id, 'phone-1', undefined, false);
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const duplicate = rooms.claimController(room.id, 'phone-2', undefined, true);
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.code, 'CONTROLLER_TAKEN');
});

test('the same phone can refresh with its session token', () => {
  const { rooms } = manager();
  const room = rooms.create('host-1');
  assert.ok(room);
  const first = rooms.claimController(room.id, 'phone-1', undefined, false);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const refreshed = rooms.claimController(room.id, 'phone-2', first.sessionToken, true);
  assert.equal(refreshed.ok, true);
  if (!refreshed.ok) return;
  assert.equal(refreshed.replacedSocketId, 'phone-1');
  assert.equal(refreshed.sessionToken, first.sessionToken);
});

test('a disconnect keeps the seat briefly, and an explicit leave frees it', () => {
  const { rooms, advance } = manager();
  const room = rooms.create('host-1');
  assert.ok(room);
  const first = rooms.claimController(room.id, 'phone-1', undefined, false);
  assert.equal(first.ok, true);
  rooms.release(room.id, 'controller', 'phone-1', 'disconnect');
  const duringGrace = rooms.claimController(room.id, 'phone-2', undefined, false);
  assert.equal(duringGrace.ok, false);

  advance(250);
  const afterGrace = rooms.claimController(room.id, 'phone-2', undefined, false);
  assert.equal(afterGrace.ok, true);

  rooms.release(room.id, 'controller', 'phone-2', 'leave');
  const immediate = rooms.claimController(room.id, 'phone-3', undefined, false);
  assert.equal(immediate.ok, true);
});

test('expired rooms reject scans and are removed', () => {
  const { rooms, advance } = manager();
  const room = rooms.create('host-1');
  assert.ok(room);
  advance(1_000);
  const claim = rooms.claimController(room.id, 'phone-1', undefined, false);
  assert.equal(claim.ok, false);
  if (claim.ok) return;
  assert.equal(claim.code, 'ROOM_EXPIRED');
  assert.equal(rooms.get(room.id), undefined);
});

test('stale controller samples are ignored and fresh ones extend the room', () => {
  const { rooms, now } = manager();
  const room = rooms.create('host-1');
  assert.ok(room);
  assert.equal(rooms.recordInput(room.id, 50, now()), true);
  assert.equal(rooms.recordInput(room.id, 40, now()), false);
  assert.equal(rooms.recordInput(room.id, 60, now()), true);
});

test('an abandoned display is swept after the host grace period', () => {
  const { rooms, advance } = manager();
  const room = rooms.create('host-1');
  assert.ok(room);
  rooms.release(room.id, 'host', 'host-1', 'disconnect');
  advance(401);
  const swept = rooms.sweep();
  assert.equal(swept.length, 1);
  assert.equal(rooms.count(), 0);
});

test('room creation stops at the configured capacity', () => {
  const rooms = new InMemoryRoomManager({
    maxRooms: 1,
    createId: () => 'ABCDEFGH',
    createToken: () => 'tokentokentokenaa',
  });
  assert.ok(rooms.create('host-1'));
  assert.equal(rooms.create('host-2'), null);
});
