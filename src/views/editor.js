import {
  getScript,
  updateScript,
} from '../storage/scripts.js';
import { getGlobalSettings, saveGlobalSettings } from '../storage/settings.js';
import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';
import { debounce } from '../lib/debounce.js';
import { openSettings } from '../lib/settings-sheet.js';
import { showConfirmModal } from '../lib/confirm-modal.js';

const FAST_PASTE_WARNING_KEY = 'speech.fastPasteWarningShown';

export async function renderEditor(root, { id }) {
  const script = await getScript(id);
  if (!script) {
    navigate('/', { replace: true });
    return;
  }

  const state = {
    title: script.title ?? '',
    body: script.body ?? '',
    // Настройки отображения — глобальные, одни на все сценарии.
    settings: await getGlobalSettings(),
  };

  // Изменения настроек сохраняются глобально (отдельно от тела сценария).
  const saveSettings = debounce(() => saveGlobalSettings(state.settings), 400);

  let indicatorTimer = null;
  const setIndicator = (state) => {
    if (!indicatorEl) return;
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }
    indicatorEl.dataset.state = state;
    if (state === 'saving') {
      indicatorEl.textContent = 'Сохраняем…';
    } else if (state === 'saved') {
      indicatorEl.textContent = 'Сохранено';
      indicatorTimer = setTimeout(() => {
        if (indicatorEl.dataset.state === 'saved') {
          indicatorEl.dataset.state = '';
          indicatorEl.textContent = '';
        }
      }, 2000);
    } else {
      indicatorEl.textContent = '';
    }
  };

  const save = debounce(async () => {
    await updateScript(id, {
      title: state.title,
      body: state.body,
    });
    setIndicator('saved');
  }, 300);

  root.innerHTML = renderTemplate(state);
  const section = root.firstElementChild;

  const titleInput = section.querySelector('[data-field="title"]');
  const bodyInput = section.querySelector('[data-field="body"]');
  const indicatorEl = section.querySelector('[data-role="save-indicator"]');

  titleInput.addEventListener('input', () => {
    state.title = titleInput.value;
    setIndicator('saving');
    save();
  });
  bodyInput.addEventListener('input', () => {
    state.body = bodyInput.value;
    setIndicator('saving');
    save();
  });

  section.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'back') {
      await Promise.all([save.flush(), saveSettings.flush()]);
      navigate('/');
    } else if (action === 'start') {
      await Promise.all([save.flush(), saveSettings.flush()]);
      navigate(`/prompter/${id}`);
    } else if (action === 'settings-open') {
      openSettings({
        parent: section,
        settings: state.settings,
        previewText: state.body,
        onChange: (key, value) => {
          // Настройки глобальные — сохраняем их отдельно, не трогая
          // индикатор сохранения тела сценария.
          state.settings[key] = value;
          saveSettings();
        },
      });
    } else if (action === 'paste') {
      await fastPasteAndReplace(bodyInput, state, () => {
        setIndicator('saving');
        save();
      });
    }
  });
}

// «+ Из буфера» — быстрая замена всего содержимого скрипта на то,
// что лежит в буфере (Universal Clipboard). Сценарий: текст
// в Notion на маке → Cmd+C → телефон стоит в стекле суфлёра →
// одна кнопка (или Voice Control «Tap из буфера»), и текст заменён.
//
// Чтобы случайно не уничтожить редакцию — при первом использовании
// показываем confirm-popup. Дальше молча.
async function fastPasteAndReplace(textarea, state, onChange) {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    flashMessage(textarea, 'Буфер обмена недоступен');
    return;
  }
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    flashMessage(textarea, 'Зажмите палец в поле и выберите «Вставить»');
    return;
  }
  if (!text) {
    flashMessage(textarea, 'В буфере ничего нет');
    return;
  }

  const hasExistingText = (state.body ?? '').trim().length > 0;
  let alreadyWarned = false;
  try {
    alreadyWarned = localStorage.getItem(FAST_PASTE_WARNING_KEY) !== null;
  } catch {
    /* private mode — считаем что не предупреждали */
  }

  if (hasExistingText && !alreadyWarned) {
    const ok = await showConfirmModal({
      title: 'Заменить весь текст?',
      body:
        'Эта кнопка вставит содержимое буфера вместо текущего сценария. ' +
        'Старый текст исчезнет. Это сообщение появится только один раз — ' +
        'дальше будет молча.',
      confirmLabel: 'Заменить',
      cancelLabel: 'Отмена',
    });
    if (!ok) return;
    try {
      localStorage.setItem(FAST_PASTE_WARNING_KEY, '1');
    } catch {
      /* private mode — ну и ладно, в следующий раз спросим ещё раз */
    }
  }

  textarea.value = text;
  state.body = text;
  textarea.selectionStart = textarea.selectionEnd = text.length;
  onChange();
}

function flashMessage(textarea, text) {
  const parent = textarea.parentElement;
  if (!parent) return;
  let toast = parent.querySelector('.editor__paste-toast');
  if (toast) toast.remove();
  toast = document.createElement('span');
  toast.className = 'editor__paste-toast';
  toast.textContent = text;
  parent.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 240);
  }, 2200);
}

function renderTemplate(state) {
  return `
    <section class="editor">
      <header class="topbar">
        <button class="topbar__back" data-action="back" aria-label="назад">
          ${ICON_BACK}
        </button>
        <input
          class="editor__title-input"
          type="text"
          data-field="title"
          value="${escapeHtml(state.title)}"
          placeholder="Название"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          class="editor__icon-button"
          data-action="paste"
          aria-label="из буфера"
          title="Вставить из буфера и заменить текст"
        >${ICON_PASTE}</button>
        <button class="editor__icon-button" data-action="settings-open" aria-label="настройки">
          ${ICON_GEAR}
        </button>
        <button class="editor__start" data-action="start" aria-label="старт">
          ${ICON_PLAY}
        </button>
      </header>
      <main class="editor__body">
        <span class="editor__save-indicator" data-role="save-indicator" data-state=""></span>
        <textarea
          class="editor__body-input"
          data-field="body"
          placeholder="Сюда — текст выступления"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="sentences"
          spellcheck="false"
        >${escapeHtml(state.body)}</textarea>
      </main>
    </section>
  `;
}

const ICON_BACK = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M14.5 18 8 12l6.5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const ICON_GEAR = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>
`;

const ICON_PLAY = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
    <path d="M8 5.5v13L19 12 8 5.5Z" fill="currentColor"/>
  </svg>
`;

const ICON_PASTE = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
    <rect x="6" y="5" width="12" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/>
    <rect x="9" y="3" width="6" height="3" rx="1" fill="currentColor"/>
    <path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
`;
