import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidRoomId, normalizeRoomId } from './constants.js';
import { applyDeadzone, materiallyChanged, normalizeTilt, smoothValue } from './motion.js';

test('normalizeTilt centers on the calibration baseline', () => {
  assert.equal(normalizeTilt(10, 10, 1), 0);
});

test('normalizeTilt reaches full deflection and then clamps', () => {
  assert.equal(normalizeTilt(10 + 26, 10, 1), 1);
  assert.equal(normalizeTilt(10 - 26, 10, 1), -1);
  assert.equal(normalizeTilt(80, 0, 1), 1);
});

test('higher sensitivity reaches full deflection with less tilt', () => {
  const gentle = normalizeTilt(13, 0, 1);
  const sharp = normalizeTilt(13, 0, 2);
  assert.ok(sharp > gentle);
  assert.equal(sharp, 1);
});

test('deadzone rests near the center and remaps the remaining range', () => {
  assert.equal(applyDeadzone(0.01), 0);
  assert.equal(applyDeadzone(1), 1);
  assert.ok(applyDeadzone(0.03) > 0);
});

test('smoothing moves toward the target without overshooting', () => {
  const next = smoothValue(0, 1, 0.5);
  assert.equal(next, 0.5);
});

test('small sensor noise does not count as a new sample', () => {
  assert.equal(materiallyChanged(0.5, 0.505, 0.012), false);
  assert.equal(materiallyChanged(0.5, 0.52, 0.012), true);
});

test('room ids use the unambiguous alphabet', () => {
  assert.equal(isValidRoomId('ab23cd4h'), true);
  assert.equal(normalizeRoomId('ab23cd4h'), 'AB23CD4H');
  assert.equal(isValidRoomId('OOOOOOOO'), false);
  assert.equal(isValidRoomId('I1I1I1I1'), false);
  assert.equal(isValidRoomId('short'), false);
});
