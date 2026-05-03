import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatVersion } from '../src/lib/version.js';

test('formatVersion: patch=0 → две цифры', () => {
  assert.equal(formatVersion('0.1.0'), 'v0.1');
  assert.equal(formatVersion('0.2.0'), 'v0.2');
  assert.equal(formatVersion('1.0.0'), 'v1.0');
});

test('formatVersion: patch>0 — добавляется без точки', () => {
  assert.equal(formatVersion('0.1.1'), 'v0.11');
  assert.equal(formatVersion('0.1.5'), 'v0.15');
  assert.equal(formatVersion('0.2.3'), 'v0.23');
  assert.equal(formatVersion('1.2.3'), 'v1.23');
});

test('formatVersion: неполные строки заполняются нулями', () => {
  assert.equal(formatVersion('0.1'), 'v0.1');
  assert.equal(formatVersion('1'), 'v1.0');
  assert.equal(formatVersion('2.0'), 'v2.0');
});

test('formatVersion: устойчиво к мусору', () => {
  // нечисловые части → NaN→0
  assert.equal(formatVersion(''), 'v0.0');
});
