import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  dbClear,
  STORE_SCRIPTS,
  STORE_PROFILE,
} from '../src/storage/db.js';
import {
  createScript,
  listScripts,
} from '../src/storage/scripts.js';
import { saveWpm, getProfile } from '../src/storage/profile.js';
import {
  buildBackup,
  backupFilename,
  parseBackup,
  importLibrary,
} from '../src/lib/backup.js';

beforeEach(async () => {
  await dbClear(STORE_SCRIPTS);
  await dbClear(STORE_PROFILE);
});

test('backupFilename: формат YYYY-MM-DD', () => {
  const name = backupFilename(new Date(2026, 4, 3));
  assert.equal(name, 'speech-backup-2026-05-03.json');
});

test('buildBackup: пустая БД', async () => {
  const backup = await buildBackup();
  assert.equal(backup.format, 'speech-backup');
  assert.equal(backup.version, 1);
  assert.deepEqual(backup.scripts, []);
  assert.equal(backup.profile, null);
  assert.ok(backup.exportedAt);
  assert.ok(backup.appVersion);
});

test('buildBackup: со скриптами и профилем', async () => {
  await createScript({ title: 'A', body: 'текст A' });
  await createScript({ title: 'B', body: 'текст B' });
  await saveWpm(170);

  const backup = await buildBackup();
  assert.equal(backup.scripts.length, 2);
  assert.ok(backup.scripts[0].id);
  assert.ok(backup.scripts[0].body);
  assert.equal(backup.profile.wpm, 170);
});

test('parseBackup: невалидный JSON', () => {
  assert.throws(() => parseBackup('{not json'), /JSON/);
});

test('parseBackup: чужой формат', () => {
  const text = JSON.stringify({ format: 'something-else', version: 1 });
  assert.throws(() => parseBackup(text), /бэкап speech/);
});

test('parseBackup: будущая версия отвергается', () => {
  const text = JSON.stringify({
    format: 'speech-backup',
    version: 99,
    scripts: [],
  });
  assert.throws(() => parseBackup(text), /версия/);
});

test('parseBackup: без массива scripts', () => {
  const text = JSON.stringify({ format: 'speech-backup', version: 1 });
  assert.throws(() => parseBackup(text), /скрипт/);
});

test('parseBackup: валидный', () => {
  const text = JSON.stringify({
    format: 'speech-backup',
    version: 1,
    scripts: [{ title: 'A', body: 'body' }],
  });
  const parsed = parseBackup(text);
  assert.equal(parsed.scripts.length, 1);
});

test('importLibrary: импортит с новыми id, сохраняя createdAt', async () => {
  const oldCreatedAt = Date.now() - 100000;
  const parsed = {
    format: 'speech-backup',
    version: 1,
    scripts: [
      { id: 'old-id-1', title: 'A', body: 'a', createdAt: oldCreatedAt },
      { id: 'old-id-2', title: 'B', body: 'b', createdAt: oldCreatedAt },
    ],
    profile: null,
  };
  const result = await importLibrary(parsed);
  assert.equal(result.importedScripts, 2);
  assert.equal(result.importedProfile, false);

  const list = await listScripts();
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, 'old-id-1');
  assert.notEqual(list[1].id, 'old-id-2');
  assert.equal(list[0].createdAt, oldCreatedAt);
});

test('importLibrary: не дублирует поверх существующих, только добавляет', async () => {
  await createScript({ title: 'Существующий', body: 'old' });
  const parsed = {
    format: 'speech-backup',
    version: 1,
    scripts: [{ title: 'Импортированный', body: 'new' }],
  };
  await importLibrary(parsed);
  const list = await listScripts();
  assert.equal(list.length, 2);
  const titles = list.map((s) => s.title).sort();
  assert.deepEqual(titles, ['Импортированный', 'Существующий']);
});

test('importLibrary: пропускает невалидные элементы', async () => {
  const parsed = {
    format: 'speech-backup',
    version: 1,
    scripts: [
      null,
      { title: 'ok', body: 'b' },
      'не объект',
      { id: 'no-strings' }, // ни title, ни body — пропустим
    ],
  };
  const result = await importLibrary(parsed);
  assert.equal(result.importedScripts, 1);
});

test('importLibrary: импортит профиль если его нет', async () => {
  const parsed = {
    format: 'speech-backup',
    version: 1,
    scripts: [],
    profile: { wpm: 175 },
  };
  const result = await importLibrary(parsed);
  assert.equal(result.importedProfile, true);
  const profile = await getProfile();
  assert.equal(profile.wpm, 175);
});

test('importLibrary: НЕ затирает существующий профиль', async () => {
  await saveWpm(140);
  const parsed = {
    format: 'speech-backup',
    version: 1,
    scripts: [],
    profile: { wpm: 200 },
  };
  const result = await importLibrary(parsed);
  assert.equal(result.importedProfile, false);
  const profile = await getProfile();
  assert.equal(profile.wpm, 140);
});

test('roundtrip: build → parse → import даёт те же скрипты', async () => {
  await createScript({ title: 'A', body: 'тело A' });
  await createScript({ title: 'B', body: 'тело B' });
  const backup = await buildBackup();
  const json = JSON.stringify(backup);

  // имитируем чистую установку
  await dbClear(STORE_SCRIPTS);

  const parsed = parseBackup(json);
  await importLibrary(parsed);

  const list = await listScripts();
  assert.equal(list.length, 2);
  const titles = list.map((s) => s.title).sort();
  assert.deepEqual(titles, ['A', 'B']);
});
