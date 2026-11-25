import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InputGate } from './rateLimit.js';

test('input gate keeps a 60Hz ceiling and then allows the next sample', () => {
  const gate = new InputGate(16);
  assert.equal(gate.allow('phone', 1_000), true);
  assert.equal(gate.allow('phone', 1_010), false);
  assert.equal(gate.allow('phone', 1_016), true);
});

test('sockets are limited independently', () => {
  const gate = new InputGate(16);
  assert.equal(gate.allow('a', 50), true);
  assert.equal(gate.allow('b', 50), true);
  gate.clear('a');
  assert.equal(gate.allow('a', 55), true);
});
