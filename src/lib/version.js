// __APP_VERSION__ injected by Vite from package.json (see vite.config.js).
// `typeof` guard позволяет импортировать модуль в Node-тестах без ошибки.
export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export function formatVersion(v) {
  // Полный semver с точками: v1.16.7. Без склейки minor+patch — иначе
  // 1.16.7 читалось как «v1.167».
  const parts = String(v).split('.');
  const major = Number(parts[0]) || 0;
  const minor = Number(parts[1]) || 0;
  const patch = Number(parts[2]) || 0;
  return `v${major}.${minor}.${patch}`;
}

export const APP_VERSION_DISPLAY = formatVersion(APP_VERSION);

const STORAGE_KEY = 'speech.lastSeenVersion';

export function checkForUpdate() {
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    const current = APP_VERSION;
    if (last === null) {
      localStorage.setItem(STORAGE_KEY, current);
      return { isFirstLaunch: true, isUpdate: false, previousVersion: null };
    }
    if (last === current) {
      return { isFirstLaunch: false, isUpdate: false, previousVersion: last };
    }
    localStorage.setItem(STORAGE_KEY, current);
    return { isFirstLaunch: false, isUpdate: true, previousVersion: last };
  } catch {
    return { isFirstLaunch: false, isUpdate: false, previousVersion: null };
  }
}
