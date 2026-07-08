import { STORE_SETTINGS, dbGet, dbPut } from './db.js';
import { DEFAULT_SETTINGS, listScripts } from './scripts.js';

// Единственная запись глобальных настроек отображения.
const SETTINGS_ID = 'display';

function normalize(partial) {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
}

// Сырое чтение без миграции: null, если ещё ничего не сохранено.
async function readStored() {
  return (await dbGet(STORE_SETTINGS, SETTINGS_ID)) ?? null;
}

// Разовый перенос: у пользователя до этого настройки жили в каждом
// сценарии отдельно. Берём настройки из последнего изменённого сценария
// (listScripts отсортирован по updatedAt по убыванию) — обычно это тот, где
// человек последним что-то подкручивал, — чтобы он не потерял свой вид.
async function seedFromLatestScript() {
  try {
    const scripts = await listScripts();
    const latest = scripts.find((s) => s && s.settings);
    return latest ? latest.settings : null;
  } catch {
    return null;
  }
}

// Глобальные настройки отображения — одни на все сценарии. При самом первом
// обращении (записи ещё нет) переносит настройки из последнего сценария и
// сохраняет их, дальше всегда возвращает сохранённые.
export async function getGlobalSettings() {
  const stored = await readStored();
  if (stored) return normalize(stored);
  const settings = normalize(await seedFromLatestScript());
  await dbPut(STORE_SETTINGS, { id: SETTINGS_ID, ...settings });
  return settings;
}

// Сохраняет частичное (или полное) изменение поверх текущих глобальных
// настроек. Возвращает итоговый нормализованный объект.
export async function saveGlobalSettings(partial) {
  const stored = await readStored();
  const base = stored ? normalize(stored) : DEFAULT_SETTINGS;
  const next = normalize({ ...base, ...(partial ?? {}) });
  await dbPut(STORE_SETTINGS, { id: SETTINGS_ID, ...next });
  return next;
}

// Есть ли уже сохранённая запись (без запуска миграции). Нужно импорту,
// чтобы не затирать уже настроенное на этом устройстве.
export async function hasStoredSettings() {
  return (await readStored()) !== null;
}
