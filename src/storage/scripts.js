import { STORE_SCRIPTS, dbGet, dbGetAll, dbPut, dbDelete } from './db.js';

export const DEFAULT_SETTINGS = Object.freeze({
  fontSize: 64,
  speed: 30,
  lineHeight: 1.5,
  mirrorH: true,
  mirrorV: false,
  readingLine: true,
  voiceFollow: false,
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

export async function duplicateScript(id) {
  const original = await getScript(id);
  if (!original) throw new Error(`Script ${id} not found`);
  return createScript({
    title: original.title ? `${original.title} (копия)` : 'Копия',
    body: original.body,
    settings: original.settings,
  });
}
