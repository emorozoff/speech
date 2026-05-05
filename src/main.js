import './styles/design-system.css';
import './styles/base.css';
import './styles/topbar.css';
import './styles/library.css';
import './styles/menu.css';
import './styles/editor.css';
import './styles/prompter.css';
import './styles/calibrate.css';
import './styles/modal.css';
import './styles/onboarding.css';
import './styles/help.css';

import * as scriptsApi from './storage/scripts.js';
import { getTheme } from './storage/profile.js';
import { seedDemoScriptIfFirstRun } from './storage/seed.js';
import { route, notFound, navigate, start } from './lib/router.js';
import { renderLibrary } from './views/library.js';
import { renderEditor } from './views/editor.js';
import { renderPrompter } from './views/prompter.js';
import { renderCalibrate } from './views/calibrate.js';
import { checkForUpdate } from './lib/version.js';
import { showUpdatePopup } from './views/update-popup.js';
import { shouldShowOnboarding, showOnboarding } from './views/onboarding.js';

if (import.meta.env.DEV) {
  window.__storage = scriptsApi;
}

// Тема применяется до старта роутера, чтобы избежать «вспышки» исходной
// тёмной темы у пользователей со светлой настройкой.
getTheme().then((theme) => {
  document.documentElement.dataset.theme = theme;
});

const root = document.getElementById('app');

route('/', () => renderLibrary(root));
route('/calibrate', () => renderCalibrate(root));
route('/editor/:id', (params) => renderEditor(root, params));
route('/prompter/:id', (params) => renderPrompter(root, params));
notFound(() => navigate('/', { replace: true }));

// shouldShowOnboarding должен сработать ДО checkForUpdate,
// потому что checkForUpdate сам пишет lastSeenVersion в storage
// и тем самым «закрашивает» состояние «совсем первый запуск».
const showFirstRun = shouldShowOnboarding();
const updateInfo = checkForUpdate();

// Демо-скрипт сеется ДО первого рендера библиотеки, иначе
// пользователь увидит пустое состояние, а потом скрипт «появится».
seedDemoScriptIfFirstRun().finally(() => {
  start();

  if (showFirstRun) {
    showOnboarding();
  } else if (updateInfo.isUpdate) {
    showUpdatePopup({ previousVersion: updateInfo.previousVersion });
  }
});

// Когда новая Service Worker берёт контроль (это случается, если
// фоном скачалась обновлённая версия PWA), показываем ненавязчивый
// баннер с кнопкой «Перезагрузить». Без перезагрузки страница
// продолжит работать на старом JS до следующего полного открытия.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    showReloadBanner();
  });
}

function showReloadBanner() {
  if (document.querySelector('.reload-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'reload-banner';
  banner.innerHTML = `
    <span>Готова свежая версия speech</span>
    <button type="button" data-action="reload">Обновить</button>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('is-visible'));
  banner.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="reload"]')) {
      window.location.reload();
    }
  });
}
