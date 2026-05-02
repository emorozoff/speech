import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbClear, STORE_SCRIPTS } from '../src/storage/db.js';
import {
  DEFAULT_SETTINGS,
  createScript,
  getScript,
  listScripts,
  updateScript,
  deleteScript,
  duplicateScript,
} from '../src/storage/scripts.js';

beforeEach(async () => {
  await dbClear(STORE_SCRIPTS);
});

test('createScript: значения по умолчанию', async () => {
  const script = await createScript();
  assert.ok(script.id, 'есть id');
  assert.equal(script.title, '');
  assert.equal(script.body, '');
  assert.deepEqual(script.settings, DEFAULT_SETTINGS);
  assert.ok(script.createdAt > 0);
  assert.equal(script.createdAt, script.updatedAt);
});

test('createScript: переданные поля и частичные настройки', async () => {
  const script = await createScript({
    title: 'Привет',
    body: 'Текст выступления',
    settings: { fontSize: 80, mirrorH: false },
  });
  assert.equal(script.title, 'Привет');
  assert.equal(script.body, 'Текст выступления');
  assert.equal(script.settings.fontSize, 80);
  assert.equal(script.settings.mirrorH, false);
  assert.equal(
    script.settings.mirrorV,
    DEFAULT_SETTINGS.mirrorV,
    'остальные настройки берутся из defaults',
  );
});

test('getScript: возвращает то же, что было сохранено', async () => {
  const created = await createScript({ title: 'A' });
  const fetched = await getScript(created.id);
  assert.deepEqual(fetched, created);
});

test('getScript: несуществующий id даёт undefined', async () => {
  const result = await getScript('does-not-exist');
  assert.equal(result, undefined);
});

test('listScripts: пусто при пустой БД', async () => {
  const list = await listScripts();
  assert.deepEqual(list, []);
});

test('listScripts: сортировка по updatedAt desc', async () => {
  const a = await createScript({ title: 'A' });
  await new Promise((r) => setTimeout(r, 5));
  const b = await createScript({ title: 'B' });
  await new Promise((r) => setTimeout(r, 5));
  await updateScript(a.id, { title: 'A2' });
  const list = await listScripts();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, a.id, 'A — самый свежий после апдейта');
  assert.equal(list[1].id, b.id);
});

test('updateScript: мерджит settings, обновляет updatedAt, сохраняет id и createdAt', async () => {
  const created = await createScript({ title: 'X' });
  await new Promise((r) => setTimeout(r, 5));
  const updated = await updateScript(created.id, {
    title: 'Y',
    body: 'new body',
    settings: { fontSize: 100 },
  });
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, created.createdAt);
  assert.ok(updated.updatedAt > created.updatedAt);
  assert.equal(updated.title, 'Y');
  assert.equal(updated.body, 'new body');
  assert.equal(updated.settings.fontSize, 100);
  assert.equal(
    updated.settings.mirrorH,
    DEFAULT_SETTINGS.mirrorH,
    'настройки мёрджатся, не заменяются',
  );
});

test('updateScript: попытка изменить id игнорируется', async () => {
  const created = await createScript();
  const updated = await updateScript(created.id, { id: 'hacked' });
  assert.equal(updated.id, created.id);
});

test('updateScript: на несуществующий id бросает ошибку', async () => {
  await assert.rejects(updateScript('nope', { title: 'X' }), /not found/);
});

test('deleteScript: удаляет', async () => {
  const created = await createScript();
  await deleteScript(created.id);
  assert.equal(await getScript(created.id), undefined);
});

test('duplicateScript: создаёт копию с новым id и суффиксом', async () => {
  const original = await createScript({
    title: 'Hello',
    body: 'world',
    settings: { fontSize: 80 },
  });
  const copy = await duplicateScript(original.id);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.title, 'Hello (копия)');
  assert.equal(copy.body, 'world');
  assert.equal(copy.settings.fontSize, 80);
});

test('duplicateScript: с пустым названием даёт "Копия"', async () => {
  const original = await createScript({ title: '' });
  const copy = await duplicateScript(original.id);
  assert.equal(copy.title, 'Копия');
});

test('duplicateScript: на несуществующий id бросает ошибку', async () => {
  await assert.rejects(duplicateScript('nope'), /not found/);
});
