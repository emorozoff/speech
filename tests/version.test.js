import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatVersion } from '../src/lib/version.js';

test('formatVersion: полный semver с точками', () => {
  assert.equal(formatVersion('1.16.7'), 'v1.16.7');
  assert.equal(formatVersion('0.1.1'), 'v0.1.1');
  assert.equal(formatVersion('0.2.3'), 'v0.2.3');
  assert.equal(formatVersion('1.2.3'), 'v1.2.3');
});

test('formatVersion: patch=0 тоже показывается', () => {
  assert.equal(formatVersion('0.1.0'), 'v0.1.0');
  assert.equal(formatVersion('1.0.0'), 'v1.0.0');
});

test('formatVersion: неполные строки заполняются нулями', () => {
  assert.equal(formatVersion('0.1'), 'v0.1.0');
  assert.equal(formatVersion('1'), 'v1.0.0');
  assert.equal(formatVersion('2.0'), 'v2.0.0');
});

test('formatVersion: устойчиво к мусору', () => {
  assert.equal(formatVersion(''), 'v0.0.0');
  assert.equal(formatVersion('abc'), 'v0.0.0');
});
