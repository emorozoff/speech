import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbClear, STORE_SCRIPTS, STORE_SETTINGS } from '../src/storage/db.js';
import {
  DEFAULT_SETTINGS,
  createScript,
  restoreScript,
} from '../src/storage/scripts.js';
import {
  getGlobalSettings,
  saveGlobalSettings,
  hasStoredSettings,
} from '../src/storage/settings.js';

beforeEach(async () => {
  await dbClear(STORE_SETTINGS);
  await dbClear(STORE_SCRIPTS);
});

test('getGlobalSettings: пустое хранилище и нет сценариев → дефолты', async () => {
  const s = await getGlobalSettings();
  assert.deepEqual(s, { ...DEFAULT_SETTINGS });
});

test('hasStoredSettings: false до первого обращения, true после', async () => {
  assert.equal(await hasStoredSettings(), false);
  await getGlobalSettings(); // создаёт запись
  assert.equal(await hasStoredSettings(), true);
});

test('saveGlobalSettings: частичное изменение мерджится и сохраняется', async () => {
  await saveGlobalSettings({ fontSize: 30 });
  let s = await getGlobalSettings();
  assert.equal(s.fontSize, 30);
  assert.equal(s.textWidth, DEFAULT_SETTINGS.textWidth, 'остальное осталось дефолтным');

  await saveGlobalSettings({ textWidth: 50 });
  s = await getGlobalSettings();
  assert.equal(s.fontSize, 30, 'предыдущее изменение сохранилось');
  assert.equal(s.textWidth, 50);
});

test('настройки едины для всех сценариев (не зависят от id)', async () => {
  await saveGlobalSettings({ fontSize: 48, textOffset: 90 });
  // Сколько бы сценариев мы ни открывали — настройки одни и те же.
  const a = await getGlobalSettings();
  const b = await getGlobalSettings();
  assert.equal(a.fontSize, 48);
  assert.equal(b.fontSize, 48);
  assert.equal(a.textOffset, 90);
});

test('миграция: первый getGlobalSettings берёт настройки из последнего сценария', async () => {
  // Старый пользователь: настройки лежат в сценариях. Источником глобальных
  // должен стать самый свежий по updatedAt. Задаём updatedAt явно через
  // restoreScript, чтобы не зависеть от совпадающих Date.now() в тесте.
  await restoreScript({
    id: 's-fresh',
    title: 'свежий',
    body: 'a',
    settings: { ...DEFAULT_SETTINGS, fontSize: 20 },
    createdAt: 1000,
    updatedAt: 3000, // самый свежий
  });
  await restoreScript({
    id: 's-old',
    title: 'старый',
    body: 'b',
    settings: { ...DEFAULT_SETTINGS, fontSize: 52 },
    createdAt: 500,
    updatedAt: 2000,
  });
  const s = await getGlobalSettings();
  assert.equal(s.fontSize, 20, 'взяли из последнего изменённого сценария');
});

test('миграция запускается один раз: после сохранения сценарии не влияют', async () => {
  await createScript({ title: 'A', body: 'a', settings: { fontSize: 20 } });
  const first = await getGlobalSettings(); // мигрировали → fontSize 20
  assert.equal(first.fontSize, 20);
  // Новый сценарий с другими настройками уже не должен влиять на глобальные.
  await createScript({ title: 'B', body: 'b', settings: { fontSize: 52 } });
  const second = await getGlobalSettings();
  assert.equal(second.fontSize, 20, 'глобальные настройки уже зафиксированы');
});
