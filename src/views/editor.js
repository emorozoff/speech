import {
  getScript,
  updateScript,
  DEFAULT_SETTINGS,
} from '../storage/scripts.js';
import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';
import { debounce } from '../lib/debounce.js';
import { openSettings } from '../lib/settings-sheet.js';

export async function renderEditor(root, { id }) {
  const script = await getScript(id);
  if (!script) {
    navigate('/', { replace: true });
    return;
  }

  const state = {
    title: script.title ?? '',
    body: script.body ?? '',
    settings: { ...DEFAULT_SETTINGS, ...(script.settings ?? {}) },
  };

  let indicatorTimer = null;
  const setIndicator = (state) => {
    if (!indicatorEl) return;
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }
    indicatorEl.dataset.state = state;
    if (state === 'saving') {
      indicatorEl.textContent = 'сохраняем…';
    } else if (state === 'saved') {
      indicatorEl.textContent = 'сохранено';
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
      settings: state.settings,
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
      await save.flush();
      navigate('/');
    } else if (action === 'start') {
      await save.flush();
      navigate(`/prompter/${id}`);
    } else if (action === 'settings-open') {
      openSettings({
        parent: section,
        settings: state.settings,
        onChange: (key, value) => {
          state.settings[key] = value;
          setIndicator('saving');
          save();
        },
      });
    } else if (action === 'paste') {
      await pasteFromClipboard(bodyInput, () => {
        state.body = bodyInput.value;
        setIndicator('saving');
        save();
      }, setIndicator);
    }
  });
}

async function pasteFromClipboard(textarea, onChange, setIndicator) {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    setIndicator?.('saving');
    flashMessage(textarea, 'буфер обмена недоступен');
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      flashMessage(textarea, 'буфер пуст');
      return;
    }
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = caret;
    textarea.focus();
    onChange();
  } catch {
    flashMessage(textarea, 'нажмите долго в текст → вставить');
  }
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
          placeholder="название"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="editor__icon-button" data-action="paste" aria-label="вставить из буфера">
          ${ICON_PASTE}
        </button>
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
          placeholder="вставьте сюда текст выступления"
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
