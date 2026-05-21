import { STORE_SCRIPTS, dbGet, dbGetAll, dbPut, dbDelete } from './db.js';

export const DEFAULT_SETTINGS = Object.freeze({
  fontSize: 40,
  font: 'system',
  textWidth: 75,
  textOffset: 0,
  textOffsetY: 0,
  speed: 10,
  lineHeight: 1.5,
  mirrorH: true,
  mirrorV: false,
  readingLine: true,
  readingLinePosition: 'center',
  voiceFollow: true,
});

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSettings(partial) {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
}

export async function listScripts() {
  const all = await dbGetAll(STORE_SCRIPTS);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getScript(id) {
  return dbGet(STORE_SCRIPTS, id);
}

export async function createScript({ title = '', body = '', settings } = {}) {
  const now = Date.now();
  const script = {
    id: uid(),
    title: typeof title === 'string' ? title : '',
    body: typeof body === 'string' ? body : '',
    settings: normalizeSettings(settings),
    createdAt: now,
    updatedAt: now,
  };
  await dbPut(STORE_SCRIPTS, script);
  return script;
}

export async function updateScript(id, patch) {
  const current = await getScript(id);
  if (!current) throw new Error(`Script ${id} not found`);
  const next = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    settings: patch && patch.settings
      ? { ...current.settings, ...patch.settings }
      : current.settings,
    updatedAt: Date.now(),
  };
  await dbPut(STORE_SCRIPTS, next);
  return next;
}

export function deleteScript(id) {
  return dbDelete(STORE_SCRIPTS, id);
}

export async function restoreScript(script) {
  if (!script || !script.id) {
    throw new Error('restoreScript requires a script with id');
  }
  await dbPut(STORE_SCRIPTS, script);
  return script;
}

export async function importScript(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('importScript requires an object');
  }
  const now = Date.now();
  const script = {
    id: uid(),
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    settings: normalizeSettings(data.settings),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : now,
    updatedAt: now,
  };
  if (typeof data.lastPosition === 'number' && data.lastPosition >= 0) {
    script.lastPosition = Math.min(1, data.lastPosition);
  }
  if (typeof data.lastBodyLength === 'number' && data.lastBodyLength >= 0) {
    script.lastBodyLength = data.lastBodyLength;
  }
  await dbPut(STORE_SCRIPTS, script);
  return script;
}

// Обновляет только техническое поле «где остановились». В отличие от
// updateScript, не дёргает updatedAt — чтение не должно перетряхивать
// порядок скриптов в библиотеке.
export async function setLastPosition(id, lastPosition, lastBodyLength) {
  const current = await getScript(id);
  if (!current) return null;
  const clamped = Math.min(1, Math.max(0, Number(lastPosition) || 0));
  const next = {
    ...current,
    lastPosition: clamped,
    lastBodyLength:
      typeof lastBodyLength === 'number' ? lastBodyLength : current.lastBodyLength ?? 0,
  };
  await dbPut(STORE_SCRIPTS, next);
  return next;
}

export async function duplicateScript(id) {
  const original = await getScript(id);
  if (!original) throw new Error(`Script ${id} not found`);
  return createScript({
    title: original.title ? `${original.title} (копия)` : 'Копия',
    body: original.body,
    settings: original.settings,
  });
}
