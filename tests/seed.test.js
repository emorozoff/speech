import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbClear, STORE_SCRIPTS } from '../src/storage/db.js';
import { listScripts, createScript } from '../src/storage/scripts.js';
import { seedDemoScriptIfFirstRun } from '../src/storage/seed.js';

const SEED_KEY = 'speech.demoSeeded';

// Минимальный shim localStorage для Node-тестов.
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
  clear: () => memoryStore.clear(),
};

beforeEach(async () => {
  await dbClear(STORE_SCRIPTS);
  memoryStore.clear();
});

test('seed: при первом запуске создаёт демо-скрипт', async () => {
  const seeded = await seedDemoScriptIfFirstRun();
  assert.ok(seeded, 'функция вернула созданный скрипт');
  assert.ok(seeded.title, 'у скрипта есть заголовок');
  assert.ok(seeded.body && seeded.body.length > 100, 'тело — содержательный текст');

  const list = await listScripts();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, seeded.id);
});

test('seed: повторный вызов не создаёт дубликат', async () => {
  await seedDemoScriptIfFirstRun();
  const second = await seedDemoScriptIfFirstRun();
  assert.equal(second, null);
  const list = await listScripts();
  assert.equal(list.length, 1);
});

test('seed: если у пользователя уже есть скрипты — НЕ сеет', async () => {
  // Эмулируем миграцию старого пользователя: скрипты есть, флага нет.
  await createScript({ title: 'мой', body: 'привет' });
  const result = await seedDemoScriptIfFirstRun();
  assert.equal(result, null);
  const list = await listScripts();
  assert.equal(list.length, 1, 'не добавили демо');
  assert.equal(list[0].title, 'мой');
});

test('seed: после удаления демо повторно НЕ сеет', async () => {
  // Пользователь увидел демо, удалил — мы не должны его навязывать снова.
  const created = await seedDemoScriptIfFirstRun();
  await dbClear(STORE_SCRIPTS);
  const result = await seedDemoScriptIfFirstRun();
  assert.equal(result, null);
  const list = await listScripts();
  assert.equal(list.length, 0);
  // Чтобы пометка была сохранена и после очистки IDB
  void created;
});
