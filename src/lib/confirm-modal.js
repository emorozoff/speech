import { escapeHtml } from './format.js';

export function showConfirmModal({
  title,
  body,
  confirmLabel = 'продолжить',
  cancelLabel = 'отмена',
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2 class="modal__title">${escapeHtml(title)}</h2>
        <p class="modal__text">${escapeHtml(body)}</p>
        <div class="modal__actions">
          <button class="button modal__cancel" data-action="cancel" type="button">
            ${escapeHtml(cancelLabel)}
          </button>
          <button class="button button--primary" data-action="confirm" type="button">
            ${escapeHtml(confirmLabel)}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));

    const close = (result) => {
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 240);
      resolve(result);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="confirm"]')) close(true);
      else if (
        e.target.closest('[data-action="cancel"]') ||
        e.target === overlay
      ) {
        close(false);
      }
    });
  });
}
