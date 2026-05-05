import { escapeHtml } from '../lib/format.js';

// Источник правды про команды — voice-commands.js. Здесь группируем по
// смыслу и берём по одному «каноничному» произношению на действие — иначе
// памятка превращается в сухой список синонимов.
const VOICE_COMMANDS = [
  {
    phrase: 'стоп стоп',
    desc: 'Поставить на паузу. Также: «пауза пауза».',
  },
  {
    phrase: 'старт старт',
    desc: 'Продолжить чтение. Также: «поехали поехали».',
  },
  {
    phrase: 'сначала сначала',
    desc: 'Вернуться к началу. Также: «заново заново».',
  },
];

const GESTURES = [
  {
    iconKey: 'tap-left',
    title: 'Тап слева или справа',
    desc: 'Сдвигает текст в сторону тапа — удобно подогнать его под лицо в кадре, не залезая в настройки.',
  },
  {
    iconKey: 'pan-y',
    title: 'Стрелки сверху по центру',
    desc: 'Двигают текст вверх или вниз мелким шагом — для точной вертикальной подгонки.',
  },
  {
    iconKey: 'tap-center',
    title: 'Тап в центре',
    desc: 'Показать или скрыть управление, если оно скрылось.',
  },
  {
    iconKey: 'gear',
    title: 'Шестерёнка слева сверху',
    desc: 'Настройки на ходу: шрифт, ширина, линия чтения, зеркало, скорость.',
  },
  {
    iconKey: 'mic',
    title: 'Микрофон в нижней панели',
    desc: 'Включить или выключить голосовое следование.',
  },
];

const TIPS = [
  {
    title: 'Перед камерой',
    desc: 'Включите «зеркало по горизонтали» в настройках и поставьте телефон в стекло суфлёра. Текст будет читаться правильно через отражение.',
  },
  {
    title: 'Можно вернуться назад',
    desc: 'Если начнёте читать текст из прошлого абзаца, текст подхватит и сам перепрыгнет туда. Главное — прочитать несколько слов подряд из старого куска.',
  },
  {
    title: 'Скорость и шрифт сохраняются',
    desc: 'Каждый скрипт помнит свои настройки. Можно сделать большой шрифт для одного и компактный для другого.',
  },
];

export function showHelp() {
  if (document.querySelector('.help-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'help-overlay';
  overlay.innerHTML = `
    <div class="help" role="dialog" aria-labelledby="help-title">
      <header class="help__header">
        <h2 class="help__title" id="help-title">Памятка</h2>
        <button class="help__close" data-action="close" aria-label="Закрыть">
          ${ICON_CLOSE}
        </button>
      </header>

      <div class="help__content">
        <section class="help__section">
          <h3 class="help__section-title">
            <span class="help__section-icon" aria-hidden="true">${ICON_MIC}</span>
            Голосовые команды
          </h3>
          <p class="help__section-lead">
            Произнесите слово <strong>дважды подряд</strong> — суфлёр услышит и среагирует. В обычной речи удвоения почти не встречается, поэтому случайно сработает редко.
          </p>
          <ul class="help__list help__list--commands">
            ${VOICE_COMMANDS.map(
              (c) => `
              <li class="help__row">
                <span class="help__phrase">${escapeHtml(c.phrase)}</span>
                <span class="help__desc">${escapeHtml(c.desc)}</span>
              </li>
            `,
            ).join('')}
          </ul>
        </section>

        <section class="help__section">
          <h3 class="help__section-title">
            <span class="help__section-icon" aria-hidden="true">${ICON_TAP}</span>
            Жесты и кнопки
          </h3>
          <ul class="help__list help__list--gestures">
            ${GESTURES.map(
              (g) => `
              <li class="help__row help__row--gesture">
                <span class="help__gesture-icon" aria-hidden="true">${gestureIcon(g.iconKey)}</span>
                <div class="help__gesture-text">
                  <span class="help__gesture-title">${escapeHtml(g.title)}</span>
                  <span class="help__desc">${escapeHtml(g.desc)}</span>
                </div>
              </li>
            `,
            ).join('')}
          </ul>
        </section>

        <section class="help__section">
          <h3 class="help__section-title">
            <span class="help__section-icon" aria-hidden="true">${ICON_BULB}</span>
            Полезные мелочи
          </h3>
          <ul class="help__list help__list--tips">
            ${TIPS.map(
              (t) => `
              <li class="help__row help__row--tip">
                <span class="help__tip-title">${escapeHtml(t.title)}</span>
                <span class="help__desc">${escapeHtml(t.desc)}</span>
              </li>
            `,
            ).join('')}
          </ul>
        </section>
      </div>

      <footer class="help__footer">
        <button class="button button--primary help__done" data-action="close" type="button">
          Понятно
        </button>
      </footer>
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
  });
}

function gestureIcon(key) {
  return GESTURE_ICONS[key] ?? '';
}

const ICON_CLOSE = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;

const ICON_MIC = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
    <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;

const ICON_TAP = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
    <path d="M12 4v6M12 14a3 3 0 0 0 3 3v3a6 6 0 0 1-6-6v-2a2 2 0 1 1 4 0v2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.6"/>
  </svg>
`;

const ICON_BULB = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.9.6 1.5 1.7 1.5 2.8V17h4v-.3c0-1.1.6-2.2 1.5-2.8A6 6 0 0 0 12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const GESTURE_ICONS = {
  'tap-left': `
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" fill="none">
      <rect x="3" y="3" width="26" height="26" rx="5" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="10" cy="16" r="3" fill="currentColor"/>
      <path d="M22 13l-4 3 4 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  'tap-right': `
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" fill="none">
      <rect x="3" y="3" width="26" height="26" rx="5" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="22" cy="16" r="3" fill="currentColor"/>
      <path d="M10 13l4 3-4 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  'tap-center': `
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" fill="none">
      <rect x="3" y="3" width="26" height="26" rx="5" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="16" cy="16" r="3.5" fill="currentColor"/>
    </svg>
  `,
  'pan-y': `
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" fill="none">
      <rect x="3" y="3" width="26" height="26" rx="5" stroke="currentColor" stroke-width="1.6"/>
      <path d="M11 12l5-4 5 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 20l5 4 5-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  gear: `
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `,
  mic: `
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `,
};
