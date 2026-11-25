import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCreateRoom, parseJoin, parseRoomCommand, sanitizeControllerButton, sanitizeControllerGesture, sanitizeControllerInput } from './validate.js';

const NOW = 1_700_000_000_000;

const state = {
  orientation: { alpha: 0, beta: 10, gamma: 400 },
  rotation: { alpha: 0, beta: 0, gamma: 10 },
  acceleration: { x: 0, y: 0, z: 0 },
  movement: { horizontal: 4, vertical: -0.25 },
  racketAngle: 0.2,
  buttons: { action: false, special: true },
  sensors: { orientation: true, rotation: true, acceleration: false },
  sequence: 3,
  timestamp: NOW,
};

test('sanitizeControllerInput clamps movement and orientation into range', () => {
  const input = sanitizeControllerInput({ roomId: 'abcdefgh', state }, NOW);
  assert.equal(input?.roomId, 'ABCDEFGH');
  assert.equal(input?.state.movement.horizontal, 1);
  assert.equal(input?.state.movement.vertical, -0.25);
  assert.equal(input?.state.orientation.gamma, 180);
  assert.equal(input?.state.buttons.special, true);
  assert.equal(input?.state.sequence, 3);
});

test('a legacy position payload still becomes horizontal movement', () => {
  const input = sanitizeControllerInput({ roomId: 'ABCDEFGH', position: 2, tilt: -0.25, timestamp: NOW }, NOW);
  assert.equal(input?.state.movement.horizontal, 1);
  assert.equal(input?.state.racketAngle, -0.25);
  assert.equal(input?.state.sensors.rotation, false);
});

test('sanitizeControllerInput rejects non-numeric and invalid rooms', () => {
  assert.equal(sanitizeControllerInput({ roomId: 'ABCDEFGH', state: { ...state, movement: { horizontal: 'left', vertical: 0 } } }, NOW), null);
  assert.equal(sanitizeControllerInput({ roomId: 'nope', state }, NOW), null);
  assert.equal(sanitizeControllerInput(null, NOW), null);
});

test('a skewed phone clock does not get to stall later input', () => {
  const input = sanitizeControllerInput({ roomId: 'ABCDEFGH', state: { ...state, timestamp: NOW - 120_000 } }, NOW);
  assert.equal(input?.state.timestamp, NOW);
});

test('gestures must name a known type and stay inside the unit interval', () => {
  const gesture = sanitizeControllerGesture(
    {
      roomId: 'abcdefgh',
      sequence: 4,
      timestamp: NOW,
      gesture: { type: 'FOREHAND_SWING', intensity: 1.4, confidence: 0.9, source: 'motion' },
    },
    NOW,
  );
  assert.equal(gesture?.gesture.type, 'FOREHAND_SWING');
  assert.equal(gesture?.gesture.intensity, 1);
  assert.equal(sanitizeControllerGesture({ roomId: 'ABCDEFGH', sequence: 1, timestamp: NOW, gesture: { type: 'SPIN', intensity: 1, confidence: 1, source: 'motion' } }, NOW), null);
});

test('buttons only accept the two controller actions', () => {
  const button = sanitizeControllerButton({ roomId: 'ABCDEFGH', button: 'special', pressed: true, sequence: 8, timestamp: NOW }, NOW);
  assert.equal(button?.button, 'special');
  assert.equal(sanitizeControllerButton({ roomId: 'ABCDEFGH', button: 'jump', pressed: true, sequence: 8, timestamp: NOW }, NOW), null);
});

test('parseCreateRoom defaults to table tennis and rejects an unknown game', () => {
  assert.deepEqual(parseCreateRoom(undefined), { gameId: 'table-tennis', mode: 'single', difficulty: 'medium' });
  assert.deepEqual(parseCreateRoom({ gameId: 'badminton', difficulty: 'hard' }), {
    gameId: 'badminton',
    mode: 'single',
    difficulty: 'hard',
  });
  assert.equal(parseCreateRoom({ gameId: 'golf' }), null);
  assert.equal(parseCreateRoom({ mode: 'multiplayer' }), null);
});

test('parseJoin only accepts the two known roles', () => {
  assert.equal(parseJoin({ roomId: 'ABCDEFGH', role: 'spectator' }), null);
  assert.deepEqual(parseJoin({ roomId: 'abcdefgh', role: 'controller', sessionToken: 'abc' }), {
    roomId: 'ABCDEFGH',
    role: 'controller',
    sessionToken: undefined,
  });
});

test('parseRoomCommand normalizes the room id', () => {
  assert.deepEqual(parseRoomCommand({ roomId: 'abcdefgh' }), { roomId: 'ABCDEFGH' });
  assert.equal(parseRoomCommand({}), null);
});
