import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbClear, STORE_PROFILE } from '../src/storage/db.js';
import {
  getProfile,
  saveWpm,
  getEffectiveWpm,
  estimateReadingSeconds,
  formatReadingTime,
  DEFAULT_WPM,
} from '../src/storage/profile.js';

beforeEach(async () => {
  await dbClear(STORE_PROFILE);
});

test('getProfile: пустая БД → null', async () => {
  assert.equal(await getProfile(), null);
});

test('saveWpm: округляет и сохраняет', async () => {
  await saveWpm(165.7);
  const profile = await getProfile();
  assert.equal(profile.wpm, 166);
  assert.ok(profile.calibratedAt > 0);
  assert.equal(profile.id, 'self');
});

test('saveWpm: перезаписывает предыдущее значение', async () => {
  await saveWpm(150);
  await saveWpm(180);
  const profile = await getProfile();
  assert.equal(profile.wpm, 180);
});

test('saveWpm: отвергает невалидные значения', async () => {
  await assert.rejects(saveWpm(0));
  await assert.rejects(saveWpm(-10));
  await assert.rejects(saveWpm(NaN));
});

test('getEffectiveWpm: дефолт без калибровки', async () => {
  assert.equal(await getEffectiveWpm(), DEFAULT_WPM);
});

test('getEffectiveWpm: возвращает откалиброванное значение', async () => {
  await saveWpm(165);
  assert.equal(await getEffectiveWpm(), 165);
});

test('estimateReadingSeconds: базовые случаи', () => {
  assert.equal(estimateReadingSeconds(150, 150), 60);
  assert.equal(estimateReadingSeconds(75, 150), 30);
  assert.equal(estimateReadingSeconds(300, 150), 120);
});

test('estimateReadingSeconds: edge cases', () => {
  assert.equal(estimateReadingSeconds(0, 150), 0);
  assert.equal(estimateReadingSeconds(100, 0), 0);
});

test('formatReadingTime: секунды и минуты', () => {
  assert.equal(formatReadingTime(0), '—');
  assert.equal(formatReadingTime(30), '30 сек');
  assert.equal(formatReadingTime(60), '1 мин');
  assert.equal(formatReadingTime(90), '1 мин 30 сек');
  assert.equal(formatReadingTime(125), '2 мин 5 сек');
});
