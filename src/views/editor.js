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

  const save = debounce(async () => {
    await updateScript(id, {
      title: state.title,
      body: state.body,
      settings: state.settings,
    });
  }, 300);

  root.innerHTML = renderTemplate(state);
  const section = root.firstElementChild;

  const titleInput = section.querySelector('[data-field="title"]');
  const bodyInput = section.querySelector('[data-field="body"]');

  titleInput.addEventListener('input', () => {
    state.title = titleInput.value;
    save();
  });
  bodyInput.addEventListener('input', () => {
    state.body = bodyInput.value;
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
          save();
        },
      });
    }
  });
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
        <button class="editor__icon-button" data-action="settings-open" aria-label="настройки">
          ${ICON_GEAR}
        </button>
        <button class="editor__start" data-action="start" aria-label="старт">
          ${ICON_PLAY}
        </button>
      </header>
      <main class="editor__body">
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
