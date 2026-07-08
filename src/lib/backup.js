import { listScripts, importScript } from '../storage/scripts.js';
import { getProfile, saveWpm } from '../storage/profile.js';
import {
  getGlobalSettings,
  saveGlobalSettings,
  hasStoredSettings,
} from '../storage/settings.js';
import { APP_VERSION } from './version.js';

const FORMAT = 'speech-backup';
const FORMAT_VERSION = 1;

export async function buildBackup() {
  const [scripts, profile, settings] = await Promise.all([
    listScripts(),
    getProfile(),
    getGlobalSettings(),
  ]);
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    // Глобальные настройки отображения — одни на все сценарии.
    settings,
    scripts: scripts.map((s) => ({
      id: s.id,
      title: s.title ?? '',
      body: s.body ?? '',
      settings: s.settings ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastPosition: typeof s.lastPosition === 'number' ? s.lastPosition : 0,
      lastBodyLength:
        typeof s.lastBodyLength === 'number' ? s.lastBodyLength : 0,
    })),
    profile: profile
      ? { wpm: profile.wpm, calibratedAt: profile.calibratedAt ?? null }
      : null,
  };
}

export function backupFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `speech-backup-${yyyy}-${mm}-${dd}.json`;
}

export async function downloadBackup() {
  const backup = await buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup;
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или это не JSON');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Неверный формат бэкапа');
  }
  if (data.format !== FORMAT) {
    throw new Error('Это не бэкап speech');
  }
  if (typeof data.version !== 'number' || data.version > FORMAT_VERSION) {
    throw new Error(`Неподдерживаемая версия бэкапа (${data.version})`);
  }
  if (!Array.isArray(data.scripts)) {
    throw new Error('В бэкапе нет скриптов');
  }
  return data;
}

export async function importLibrary(parsed) {
  let importedScripts = 0;
  for (const s of parsed.scripts) {
    if (!s || typeof s !== 'object') continue;
    if (typeof s.title !== 'string' && typeof s.body !== 'string') continue;
    await importScript({
      title: s.title,
      body: s.body,
      settings: s.settings && typeof s.settings === 'object' ? s.settings : undefined,
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : undefined,
      lastPosition: typeof s.lastPosition === 'number' ? s.lastPosition : undefined,
      lastBodyLength:
        typeof s.lastBodyLength === 'number' ? s.lastBodyLength : undefined,
    });
    importedScripts++;
  }

  let importedProfile = false;
  if (
    parsed.profile &&
    typeof parsed.profile.wpm === 'number' &&
    parsed.profile.wpm > 0
  ) {
    const existing = await getProfile();
    if (!existing) {
      await saveWpm(parsed.profile.wpm);
      importedProfile = true;
    }
  }

  // Глобальные настройки восстанавливаем только если на этом устройстве их
  // ещё нет — чтобы импорт не затирал уже настроенный вид (как и с профилем).
  let importedSettings = false;
  if (parsed.settings && typeof parsed.settings === 'object') {
    if (!(await hasStoredSettings())) {
      await saveGlobalSettings(parsed.settings);
      importedSettings = true;
    }
  }

  return { importedScripts, importedProfile, importedSettings };
}
