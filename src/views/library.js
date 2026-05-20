import {
  listScripts,
  createScript,
  deleteScript,
  duplicateScript,
  getScript,
  restoreScript,
} from '../storage/scripts.js';
import {
  getProfile,
  getTheme,
  setTheme,
  estimateReadingSeconds,
  formatReadingTime,
  DEFAULT_WPM,
} from '../storage/profile.js';
import { navigate } from '../lib/router.js';
import {
  escapeHtml,
  formatRelative,
  makePreview,
  wordCount,
  wordsLabel,
} from '../lib/format.js';
import { APP_VERSION_DISPLAY } from '../lib/version.js';
import {
  downloadBackup,
  parseBackup,
  importLibrary,
} from '../lib/backup.js';
import { showConfirmModal } from '../lib/confirm-modal.js';
import { showFeedbackModal } from '../lib/feedback-modal.js';
import { showHelp } from './help.js';

let openMenu = null;

const CARD_MENU_ITEMS = [
  { action: 'duplicate', label: 'Сделать копию' },
  { action: 'delete', label: 'Удалить', danger: true },
];

function topbarMenuItems(theme) {
  return [
    { action: 'export', label: 'Экспорт' },
    { action: 'import', label: 'Импорт' },
    {
      action: 'theme-toggle',
      label: theme === 'light' ? 'Тёмная тема' : 'Светлая тема',
    },
    { action: 'feedback', label: 'Обратная связь' },
  ];
}

export async function renderLibrary(root) {
  closeMenu();

  let scripts;
  let profile;
  try {
    [scripts, profile] = await Promise.all([listScripts(), getProfile()]);
  } catch (err) {
    root.innerHTML = `<p class="error">Ошибка хранилища: ${escapeHtml(err.message ?? err)}</p>`;
    return;
  }

  const wpm = profile?.wpm ?? DEFAULT_WPM;
  root.innerHTML = scripts.length === 0
    ? renderEmpty(profile)
    : renderList(scripts, profile, wpm);
  const section = root.firstElementChild;

  section.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    if (action === 'calibrate') {
      e.preventDefault();
      navigate('/calibrate');
    } else if (action === 'help') {
      e.preventDefault();
      showHelp();
    } else if (action === 'new') {
      e.preventDefault();
      const created = await createScript();
      navigate(`/editor/${created.id}`);
    } else if (action === 'open') {
      e.preventDefault();
      navigate(`/editor/${id}`);
    } else if (action === 'menu') {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu(target, id, CARD_MENU_ITEMS, async (chosen) => {
        if (chosen === 'duplicate') {
          await duplicateScript(id);
          await renderLibrary(root);
        } else if (chosen === 'delete') {
          await handleDelete(id, root);
        }
      });
    } else if (action === 'more') {
      e.preventDefault();
      e.stopPropagation();
      const currentTheme = await getTheme();
      toggleMenu(target, 'topbar', topbarMenuItems(currentTheme), async (chosen) => {
        if (chosen === 'export') {
          try {
            await downloadBackup();
          } catch (err) {
            showInfoToast(root, errorMessage(err), 'error');
          }
        } else if (chosen === 'import') {
          triggerImport(root);
        } else if (chosen === 'theme-toggle') {
          await handleThemeToggle(currentTheme, root);
        } else if (chosen === 'feedback') {
          showFeedbackModal();
        }
      });
    }
  });
}

function renderEmpty(profile) {
  return `
    <section class="library library--empty">
      <header class="topbar">
        <h1 class="topbar__brand">
          speech
          <span class="topbar__version">${APP_VERSION_DISPLAY}</span>
        </h1>
        <button
          class="topbar__more"
          data-action="more"
          aria-label="меню библиотеки"
        >${ICON_DOTS}</button>
      </header>
      ${renderProfileBanner(profile)}
      <div class="empty">
        <span class="empty__dot" aria-hidden="true"></span>
        <h2 class="empty__title">Пока пусто</h2>
        <p class="empty__subtitle">Создайте первый скрипт — и поехали</p>
        <button class="button button--primary" data-action="new">+ Новый скрипт</button>
      </div>
    </section>
  `;
}

function renderList(scripts, profile, wpm) {
  return `
    <section class="library">
      <header class="topbar">
        <h1 class="topbar__brand">
          speech
          <span class="topbar__version">${APP_VERSION_DISPLAY}</span>
        </h1>
        <button
          class="topbar__more"
          data-action="more"
          aria-label="меню библиотеки"
        >${ICON_DOTS}</button>
        <button
          class="topbar__add"
          data-action="new"
          aria-label="новый скрипт"
        >+</button>
      </header>
      ${renderProfileBanner(profile)}
      <ul class="library__list" role="list">
        ${scripts.map((s) => renderCard(s, wpm)).join('')}
      </ul>
    </section>
  `;
}

function renderProfileBanner(profile) {
  // profile?.wpm, а не profile — потому что setTheme мог создать
  // запись профиля без wpm (если пользователь переключил тему до
  // калибровки темпа). Раньше показывалось «undefined wpm».
  const tempText = profile?.wpm
    ? `<strong>${profile.wpm} wpm</strong>`
    : `Замерить темп`;
  return `
    <div class="library__quick-row">
      <button class="library__profile" data-action="calibrate" type="button">
        <span class="library__profile-icon" aria-hidden="true">${ICON_BOLT}</span>
        <span class="library__profile-text">${tempText}</span>
      </button>
      <button class="library__profile" data-action="help" type="button">
        <span class="library__profile-icon" aria-hidden="true">${ICON_BOOK}</span>
        <span class="library__profile-text">Памятка</span>
      </button>
    </div>
  `;
}

function renderCard(script, wpm) {
  const hasTitle = !!script.title?.trim();
  const hasBody = !!script.body?.trim();
  const title = hasTitle ? script.title.trim() : 'Без названия';
  const preview = hasBody ? makePreview(script.body) : 'Пусто';
  const date = formatRelative(script.updatedAt);
  const wc = wordCount(script.body);
  const wcLabel = `${wc} ${wordsLabel(wc)}`;
  const readingSec = estimateReadingSeconds(wc, wpm);
  const readingLabel = readingSec > 0 ? ` · ≈ ${formatReadingTime(readingSec)}` : '';
  const id = escapeHtml(script.id);

  return `
    <li class="card">
      <div
        class="card__main"
        role="button"
        tabindex="0"
        data-action="open"
        data-id="${id}"
      >
        <h2 class="card__title ${hasTitle ? '' : 'card__title--placeholder'}">${escapeHtml(title)}</h2>
        <p class="card__preview ${hasBody ? '' : 'card__preview--placeholder'}">${escapeHtml(preview)}</p>
        <span class="card__meta">${escapeHtml(date)} · ${escapeHtml(wcLabel)}${escapeHtml(readingLabel)}</span>
      </div>
      <button
        class="card__menu-button"
        data-action="menu"
        data-id="${id}"
        aria-label="меню"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
          <circle cx="19" cy="12" r="2" fill="currentColor"/>
        </svg>
      </button>
    </li>
  `;
}

function toggleMenu(button, id, items, onAction) {
  if (openMenu && openMenu.dataset.for === id) {
    closeMenu();
    return;
  }
  closeMenu();

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.dataset.for = id;
  menu.innerHTML = items
    .map(
      (it) => `
        <button
          class="menu__item ${it.danger ? 'menu__item--danger' : ''}"
          data-action="${escapeHtml(it.action)}"
        >${escapeHtml(it.label)}</button>
      `,
    )
    .join('');

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    e.stopPropagation();
    closeMenu();
    onAction(item.dataset.action);
  });

  const dismiss = (e) => {
    if (!menu.contains(e.target) && !button.contains(e.target)) {
      closeMenu();
    }
  };
  menu._dismiss = dismiss;

  document.body.appendChild(menu);

  const rect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const top = Math.min(rect.bottom + 4, window.innerHeight - menuRect.height - 8);
  const left = Math.min(
    rect.right - menuRect.width,
    window.innerWidth - menuRect.width - 8,
  );
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, left)}px`;

  openMenu = menu;

  // Таймаут нужен чтобы текущий клик-event (по которому открывается меню)
  // не был тут же поглощён dismiss-обработчиком ниже. Ссылку держим, чтобы
  // closeMenu(), вызванный сразу же, не оставил dismiss-listener висеть.
  menu._openTimer = setTimeout(() => {
    menu._openTimer = null;
    menu.classList.add('menu--open');
    document.addEventListener('click', dismiss);
  }, 0);
}

function closeMenu() {
  if (!openMenu) return;
  if (openMenu._openTimer) {
    clearTimeout(openMenu._openTimer);
    openMenu._openTimer = null;
  }
  if (openMenu._dismiss) {
    document.removeEventListener('click', openMenu._dismiss);
  }
  openMenu.remove();
  openMenu = null;
}

async function handleDelete(id, root) {
  const script = await getScript(id);
  if (!script) return;
  await deleteScript(id);
  await renderLibrary(root);
  showUndoToast(root, script);
}

function showUndoToast(root, script) {
  // Если предыдущий тост ещё на экране — финализируем его
  document.querySelectorAll('.library__undo-toast').forEach((el) => el.remove());

  const section = root.firstElementChild;
  if (!section) return;

  const toast = document.createElement('div');
  toast.className = 'library__undo-toast';
  toast.innerHTML = `
    <span class="library__undo-toast-icon" aria-hidden="true">${ICON_TRASH}</span>
    <span class="library__undo-toast-text">Удалено</span>
    <button
      class="library__undo-toast-button"
      data-action="undo"
      type="button"
    >Вернуть</button>
    <div class="library__undo-toast-bar" aria-hidden="true"></div>
  `;
  section.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('is-visible'));

  let timeoutId = null;
  const dismiss = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 240);
  };

  toast.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-action="undo"]')) return;
    e.stopPropagation();
    dismiss();
    try {
      await restoreScript(script);
    } catch {
      /* ignore */
    }
    await renderLibrary(root);
  });

  timeoutId = setTimeout(dismiss, 5000);
}

function triggerImport(root) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  document.body.appendChild(input);

  const cleanup = () => {
    if (input.parentNode) input.remove();
  };

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    cleanup();
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
      const result = await importLibrary(parsed);
      await renderLibrary(root);
      const parts = [];
      if (result.importedScripts > 0) {
        parts.push(`Импортировано: ${result.importedScripts}`);
      }
      if (result.importedProfile) {
        parts.push('и калибровка');
      }
      const message = parts.length > 0
        ? parts.join(' · ')
        : 'Импортировать нечего';
      showInfoToast(root, message);
    } catch (err) {
      showInfoToast(root, errorMessage(err), 'error');
    }
  });

  input.addEventListener('cancel', cleanup);

  input.click();
}

function showInfoToast(root, text, variant = 'success') {
  document
    .querySelectorAll('.library__undo-toast, .library__info-toast')
    .forEach((el) => el.remove());
  const section = root.firstElementChild;
  if (!section) return;
  const toast = document.createElement('div');
  toast.className = `library__info-toast library__info-toast--${variant}`;
  toast.textContent = text;
  section.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 240);
  }, 3000);
}

function errorMessage(err) {
  if (!err) return 'Неизвестная ошибка';
  return typeof err.message === 'string' ? err.message : String(err);
}

async function handleThemeToggle(currentTheme, root) {
  if (currentTheme === 'dark') {
    const ok = await showConfirmModal({
      title: 'Светлая тема?',
      body: 'Тёмная тема бережёт глаза — особенно когда читаете с экрана перед камерой. Точно переключаемся?',
      confirmLabel: 'Включить светлую',
      cancelLabel: 'Оставить тёмную',
    });
    if (!ok) return;
    await setTheme('light');
    document.documentElement.dataset.theme = 'light';
    showInfoToast(root, 'Светлая тема включена');
  } else {
    await setTheme('dark');
    document.documentElement.dataset.theme = 'dark';
    showInfoToast(root, 'Снова в темноте');
  }
}

const ICON_DOTS = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="12" cy="5" r="2" fill="currentColor"/>
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
    <circle cx="12" cy="19" r="2" fill="currentColor"/>
  </svg>
`;

const ICON_TRASH = `
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
    <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const ICON_BOLT = `
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
    <path d="M13 2 3 14h6l-1 8 10-12h-6l1-8Z"/>
  </svg>
`;

const ICON_BOOK = `
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
    <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8 7h7M8 10h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
`;
