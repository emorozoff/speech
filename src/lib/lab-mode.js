// Лабораторные эксперименты — ON через URL ?lab=<name>, OFF через ?lab=off.
// Флаги хранятся в localStorage, поэтому держатся между reload'ами.
// Эту ссылку можно сохранить в закладки — получается «отдельная сборка»
// без отдельного deploy.
//
// Чтобы добавить новый режим — просто добавь ключ в LAB_KEYS и проверяй
// его через isLabOn('myFeature').

const LAB_KEYS = {
  adaptive: 'speech.lab.adaptive',
};

export function applyLabFromUrl() {
  let labParam;
  try {
    labParam = new URLSearchParams(window.location.search).get('lab');
  } catch {
    return;
  }
  if (!labParam) return;
  try {
    if (labParam === 'off') {
      Object.values(LAB_KEYS).forEach((k) => localStorage.removeItem(k));
    } else if (LAB_KEYS[labParam]) {
      localStorage.setItem(LAB_KEYS[labParam], '1');
    }
  } catch {
    /* private mode — флаг не сохранится, но в текущей сессии тоже не нужно */
  }
  // Подчищаем URL чтобы query не маячил
  try {
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.hash,
    );
  } catch {
    /* ignore */
  }
}

export function isLabOn(name) {
  const key = LAB_KEYS[name];
  if (!key) return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
