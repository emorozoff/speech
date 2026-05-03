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

let openMenu = null;

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
      toggleMenu(target, id, async (chosen) => {
        if (chosen === 'duplicate') {
          await duplicateScript(id);
          await renderLibrary(root);
        } else if (chosen === 'delete') {
          await handleDelete(id, root);
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
      </header>
      ${renderProfileBanner(profile)}
      <div class="empty">
        <span class="empty__dot" aria-hidden="true"></span>
        <h2 class="empty__title">пусто</h2>
        <p class="empty__subtitle">создайте первый скрипт</p>
        <button class="button button--primary" data-action="new">+ новый скрипт</button>
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
  const text = profile
    ? `скорость <strong>${profile.wpm} wpm</strong> · обновить`
    : `скорость не задана (160 wpm) · откалибровать`;
  return `
    <button class="library__profile" data-action="calibrate" type="button">
      <span class="library__profile-icon" aria-hidden="true">${ICON_BOLT}</span>
      <span class="library__profile-text">${text}</span>
    </button>
  `;
}

function renderCard(script, wpm) {
  const hasTitle = !!script.title?.trim();
  const hasBody = !!script.body?.trim();
  const title = hasTitle ? script.title.trim() : 'без названия';
  const preview = hasBody ? makePreview(script.body) : 'пусто';
  const date = formatRelative(script.updatedAt);
  const wc = wordCount(script.body);
  const wcLabel = `${wc} ${wordsLabel(wc)}`;
  const readingSec = estimateReadingSeconds(wc, wpm);
  const readingLabel = readingSec > 0 ? ` · ≈ ${formatReadingTime(readingSec)}` : '';
  const id = escapeHtml(script.id);

  return `
    <li class="card">
      <button class="card__main" data-action="open" data-id="${id}">
        <h2 class="card__title ${hasTitle ? '' : 'card__title--placeholder'}">${escapeHtml(title)}</h2>
        <p class="card__preview ${hasBody ? '' : 'card__preview--placeholder'}">${escapeHtml(preview)}</p>
        <span class="card__meta">${escapeHtml(date)} · ${escapeHtml(wcLabel)}${escapeHtml(readingLabel)}</span>
      </button>
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

function toggleMenu(button, id, onAction) {
  if (openMenu && openMenu.dataset.for === id) {
    closeMenu();
    return;
  }
  closeMenu();

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.dataset.for = id;
  menu.innerHTML = `
    <button class="menu__item" data-action="duplicate">Дублировать</button>
    <button class="menu__item menu__item--danger" data-action="delete">Удалить</button>
  `;

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

  setTimeout(() => {
    menu.classList.add('menu--open');
    document.addEventListener('click', dismiss);
  }, 0);
}

function closeMenu() {
  if (!openMenu) return;
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
    <span class="library__undo-toast-text">удалено</span>
    <button
      class="library__undo-toast-button"
      data-action="undo"
      type="button"
    >отменить</button>
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
