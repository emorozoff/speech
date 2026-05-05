// Прямые ссылки на префилленные issue-шаблоны. ?template= берёт нужный
// .github/ISSUE_TEMPLATE/*.md с готовой структурой.
const REPO = 'emorozoff/speech';
const BUG_URL = `https://github.com/${REPO}/issues/new?template=bug_report.md`;
const IDEA_URL = `https://github.com/${REPO}/issues/new?template=feature_request.md`;

const ICON_BUG = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <rect x="7" y="8" width="10" height="11" rx="5" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9 6a3 3 0 0 1 6 0M5 12h2M17 12h2M5 16h2M17 16h2M6 8l1.5 1.5M16.5 9.5L18 8M12 19v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>
`;

const ICON_BULB = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.9.6 1.5 1.7 1.5 2.8V17h4v-.3c0-1.1.6-2.2 1.5-2.8A6 6 0 0 0 12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export function showFeedbackModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal feedback" role="dialog" aria-labelledby="feedback-title">
      <h2 class="modal__title" id="feedback-title">Обратная связь</h2>
      <p class="modal__text">
        Что-то сломалось или хочется улучшить? Расскажите —
        починим. Нужен GitHub-аккаунт (регистрация — минута).
      </p>
      <div class="feedback__options">
        <a
          class="feedback__option"
          href="${BUG_URL}"
          target="_blank"
          rel="noopener noreferrer"
          data-action="opened"
        >
          <span class="feedback__option-icon" aria-hidden="true">${ICON_BUG}</span>
          <span class="feedback__option-text">
            <strong>Сообщить о баге</strong>
            <span>Что-то работает не так</span>
          </span>
        </a>
        <a
          class="feedback__option"
          href="${IDEA_URL}"
          target="_blank"
          rel="noopener noreferrer"
          data-action="opened"
        >
          <span class="feedback__option-icon" aria-hidden="true">${ICON_BULB}</span>
          <span class="feedback__option-text">
            <strong>Предложить идею</strong>
            <span>Что добавить или улучшить</span>
          </span>
        </a>
      </div>
      <button
        class="button feedback__close"
        data-action="close"
        type="button"
      >Закрыть</button>
    </div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  const close = () => {
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 240);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="close"]') || e.target === overlay) {
      close();
    }
    // По тапу на ссылку — она откроется в новой вкладке (target="_blank"),
    // и сразу закрываем модал, чтобы при возврате на сайт не висел.
    if (e.target.closest('[data-action="opened"]')) {
      close();
    }
  });
}
