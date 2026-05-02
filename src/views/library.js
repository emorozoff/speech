import {
  listScripts,
  createScript,
  deleteScript,
  duplicateScript,
} from '../storage/scripts.js';
import { navigate } from '../lib/router.js';
import {
  escapeHtml,
  formatRelative,
  makePreview,
  wordCount,
  wordsLabel,
} from '../lib/format.js';

let openMenu = null;

export async function renderLibrary(root) {
  closeMenu();

  let scripts;
  try {
    scripts = await listScripts();
  } catch (err) {
    root.innerHTML = `<p class="error">Ошибка хранилища: ${escapeHtml(err.message ?? err)}</p>`;
    return;
  }

  root.innerHTML = scripts.length === 0 ? renderEmpty() : renderList(scripts);
  const section = root.firstElementChild;

  section.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    if (action === 'new') {
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
          if (window.confirm('Удалить скрипт?')) {
            await deleteScript(id);
            await renderLibrary(root);
          }
        }
      });
    }
  });
}

function renderEmpty() {
  return `
    <section class="library library--empty">
      <header class="topbar">
        <h1 class="topbar__brand">speech</h1>
      </header>
      <div class="empty">
        <span class="empty__dot" aria-hidden="true"></span>
        <h2 class="empty__title">пусто</h2>
        <p class="empty__subtitle">создайте первый скрипт</p>
        <button class="button button--primary" data-action="new">+ новый скрипт</button>
      </div>
    </section>
  `;
}

function renderList(scripts) {
  return `
    <section class="library">
      <header class="topbar">
        <h1 class="topbar__brand">speech</h1>
        <button
          class="topbar__add"
          data-action="new"
          aria-label="новый скрипт"
        >+</button>
      </header>
      <ul class="library__list" role="list">
        ${scripts.map(renderCard).join('')}
      </ul>
    </section>
  `;
}

function renderCard(script) {
  const hasTitle = !!script.title?.trim();
  const hasBody = !!script.body?.trim();
  const title = hasTitle ? script.title.trim() : 'без названия';
  const preview = hasBody ? makePreview(script.body) : 'пусто';
  const date = formatRelative(script.updatedAt);
  const wc = wordCount(script.body);
  const wcLabel = `${wc} ${wordsLabel(wc)}`;
  const id = escapeHtml(script.id);

  return `
    <li class="card">
      <button class="card__main" data-action="open" data-id="${id}">
        <h2 class="card__title ${hasTitle ? '' : 'card__title--placeholder'}">${escapeHtml(title)}</h2>
        <p class="card__preview ${hasBody ? '' : 'card__preview--placeholder'}">${escapeHtml(preview)}</p>
        <span class="card__meta">${escapeHtml(date)} · ${escapeHtml(wcLabel)}</span>
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
