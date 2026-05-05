const ONBOARDING_KEY = 'speech.onboardingSeen';
const VERSION_KEY = 'speech.lastSeenVersion';

export function shouldShowOnboarding() {
  try {
    if (localStorage.getItem(ONBOARDING_KEY) !== null) return false;
    // Существующий пользователь, у которого нет флага onboarding
    // (потому что фича добавлена позже). Не дёргаем его, отметим
    // как пройденное и поедем дальше.
    if (localStorage.getItem(VERSION_KEY) !== null) {
      localStorage.setItem(ONBOARDING_KEY, '1');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* private mode etc — игнор */
  }
}

export function showOnboarding() {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding';
  overlay.innerHTML = `
    <div class="onboarding__pages" data-role="pages">
      <section class="onboarding__page">
        <span class="onboarding__icon onboarding__icon--dot" aria-hidden="true"></span>
        <h2 class="onboarding__title">speech</h2>
        <p class="onboarding__text">
          Телесуфлёр для блогеров.<br/>
          Поставьте телефон в стекло суфлёра<br/>
          перед камерой — и читайте отражение.
        </p>
      </section>
      <section class="onboarding__page">
        <span class="onboarding__icon" aria-hidden="true">${ICON_MIC_LARGE}</span>
        <h2 class="onboarding__title">Текст слушает вас</h2>
        <p class="onboarding__text">
          Разрешите микрофон — и текст поедет за вашим голосом сам.
          Скажите <strong>«стоп стоп»</strong>, чтобы поставить на паузу,
          и <strong>«старт старт»</strong>, чтобы продолжить.
        </p>
      </section>
      <section class="onboarding__page">
        <span class="onboarding__icon" aria-hidden="true">${ICON_INSTALL}</span>
        <h2 class="onboarding__title">На главный экран</h2>
        <p class="onboarding__text">
          В Safari тапните <strong>«Поделиться»</strong> →
          <strong>«На экран Домой»</strong>.
          Получите полный экран и работу без интернета.
        </p>
      </section>
    </div>
    <div class="onboarding__pagination" data-role="pagination">
      <span class="onboarding__dot is-active" data-page="0"></span>
      <span class="onboarding__dot" data-page="1"></span>
      <span class="onboarding__dot" data-page="2"></span>
    </div>
    <button
      class="onboarding__next button button--primary"
      data-action="next"
      type="button"
    >Дальше</button>
  `;
  document.body.appendChild(overlay);

  const pagesEl = overlay.querySelector('[data-role="pages"]');
  const dots = overlay.querySelectorAll('.onboarding__dot');
  const nextButton = overlay.querySelector('[data-action="next"]');
  const totalPages = dots.length;
  let currentPage = 0;

  function update() {
    dots.forEach((dot, i) =>
      dot.classList.toggle('is-active', i === currentPage),
    );
    nextButton.textContent =
      currentPage === totalPages - 1 ? 'Поехали' : 'Дальше';
  }

  function close() {
    markSeen();
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 240);
  }

  function goTo(idx) {
    if (idx < 0 || idx >= totalPages) return;
    currentPage = idx;
    pagesEl.scrollTo({
      left: idx * pagesEl.clientWidth,
      behavior: 'smooth',
    });
    update();
  }

  pagesEl.addEventListener(
    'scroll',
    () => {
      const w = pagesEl.clientWidth;
      if (w <= 0) return;
      const newPage = Math.round(pagesEl.scrollLeft / w);
      if (newPage !== currentPage) {
        currentPage = newPage;
        update();
      }
    },
    { passive: true },
  );

  nextButton.addEventListener('click', () => {
    if (currentPage === totalPages - 1) {
      close();
    } else {
      goTo(currentPage + 1);
    }
  });

  overlay
    .querySelector('[data-role="pagination"]')
    .addEventListener('click', (e) => {
      const dot = e.target.closest('[data-page]');
      if (!dot) return;
      goTo(Number(dot.dataset.page));
    });

  requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

const ICON_MIC_LARGE = `
  <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
    <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;

const ICON_INSTALL = `
  <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none">
    <rect x="5" y="3" width="14" height="18" rx="2.5" stroke="currentColor" stroke-width="1.8"/>
    <path d="M12 9v6M9 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M11 18.5h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
`;
