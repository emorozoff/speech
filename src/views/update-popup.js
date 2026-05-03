import { APP_VERSION_DISPLAY } from '../lib/version.js';

export function showUpdatePopup({ previousVersion } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const fromText = previousVersion
    ? `с ${formatPrev(previousVersion)} → ${APP_VERSION_DISPLAY}`
    : APP_VERSION_DISPLAY;

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="update-title">
      <span class="modal__dot" aria-hidden="true"></span>
      <h2 class="modal__title" id="update-title">Приложение обновлено!</h2>
      <p class="modal__text">Теперь оно стало лучше! (наверное)</p>
      <p class="modal__meta">${fromText}</p>
      <button class="button button--primary" data-action="modal-close">ок</button>
    </div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  const close = () => {
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 240);
  };

  overlay.addEventListener('click', (e) => {
    if (
      e.target.closest('[data-action="modal-close"]') ||
      e.target === overlay
    ) {
      close();
    }
  });
}

function formatPrev(v) {
  const parts = String(v).split('.');
  const major = Number(parts[0] ?? 0);
  const minor = Number(parts[1] ?? 0);
  const patch = Number(parts[2] ?? 0);
  return patch === 0 ? `v${major}.${minor}` : `v${major}.${minor}${patch}`;
}
