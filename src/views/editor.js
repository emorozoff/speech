import {
  getScript,
  updateScript,
  DEFAULT_SETTINGS,
} from '../storage/scripts.js';
import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';
import { debounce } from '../lib/debounce.js';
import { FONTS } from '../lib/fonts.js';

const SLIDERS = [
  { key: 'fontSize', label: 'размер шрифта', min: 16, max: 128, step: 1, unit: 'px' },
  { key: 'textWidth', label: 'ширина текста', min: 40, max: 100, step: 5, unit: '%' },
  { key: 'speed', label: 'скорость', min: 1, max: 100, step: 1, unit: '' },
  { key: 'lineHeight', label: 'межстрочный', min: 1, max: 2.5, step: 0.1, unit: '' },
];

const TOGGLES = [
  { key: 'mirrorH', label: 'зеркало по горизонтали' },
  { key: 'mirrorV', label: 'зеркало по вертикали' },
  { key: 'readingLine', label: 'линия чтения' },
  { key: 'voiceFollow', label: 'голосовое следование' },
];

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
      openSettings(section, state, save);
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

function openSettings(parent, state, save) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `
    <div class="sheet__backdrop" data-action="sheet-close"></div>
    <div class="sheet__panel" role="dialog" aria-label="настройки">
      <header class="sheet__header">
        <h2 class="sheet__title">настройки</h2>
        <button class="sheet__close" data-action="sheet-close" aria-label="закрыть">
          ${ICON_CLOSE}
        </button>
      </header>
      <div class="sheet__content">
        ${renderFontPicker(state.settings.font)}
        <div class="sheet__divider"></div>
        ${SLIDERS.map((s) => renderSlider(s, state.settings[s.key])).join('')}
        <div class="sheet__divider"></div>
        ${TOGGLES.map((t) => renderToggle(t, state.settings[t.key])).join('')}
      </div>
    </div>
  `;
  parent.appendChild(sheet);

  requestAnimationFrame(() => sheet.classList.add('sheet--open'));

  const close = () => {
    sheet.classList.remove('sheet--open');
    setTimeout(() => sheet.remove(), 240);
  };

  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="sheet-close"]')) close();
    const fontChip = e.target.closest('.font-chip');
    if (fontChip) {
      state.settings.font = fontChip.dataset.value;
      sheet.querySelectorAll('.font-chip').forEach((chip) => {
        chip.classList.toggle(
          'is-selected',
          chip.dataset.value === state.settings.font,
        );
      });
      save();
    }
  });

  sheet.querySelectorAll('input[data-setting]').forEach((input) => {
    const key = input.dataset.setting;
    const isCheckbox = input.type === 'checkbox';
    const valueEl = sheet.querySelector(`[data-value-of="${key}"]`);

    input.addEventListener('input', () => {
      let value;
      if (isCheckbox) {
        value = input.checked;
      } else {
        const parsed = Number(input.value);
        value = input.step && input.step.includes('.')
          ? Math.round(parsed * 10) / 10
          : parsed;
      }
      state.settings[key] = value;
      if (valueEl) valueEl.textContent = formatValue(key, value);
      save();
    });
  });

  sheet.querySelectorAll('.font-chip').forEach((chip) => {
    chip.style.fontFamily = chip.dataset.stack;
  });
}

function renderFontPicker(currentFont) {
  return `
    <div class="setting-row setting-row--font">
      <span class="setting-row__label">шрифт</span>
      <div class="font-strip">
        ${FONTS.map((f) => `
          <button
            class="font-chip ${currentFont === f.key ? 'is-selected' : ''}"
            data-value="${escapeHtml(f.key)}"
            data-stack="${escapeHtml(f.stack)}"
            type="button"
          >${escapeHtml(f.label)}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSlider(spec, value) {
  return `
    <div class="setting-row setting-row--slider">
      <div class="setting-row__head">
        <span class="setting-row__label">${spec.label}</span>
        <span class="setting-row__value" data-value-of="${spec.key}">${formatValue(spec.key, value)}</span>
      </div>
      <input
        type="range"
        class="slider"
        data-setting="${spec.key}"
        min="${spec.min}"
        max="${spec.max}"
        step="${spec.step}"
        value="${value}"
      />
    </div>
  `;
}

function renderToggle(spec, checked) {
  return `
    <label class="setting-row setting-row--toggle">
      <span class="setting-row__label">${spec.label}</span>
      <span class="toggle">
        <input
          type="checkbox"
          class="toggle__input"
          data-setting="${spec.key}"
          ${checked ? 'checked' : ''}
        />
        <span class="toggle__track" aria-hidden="true">
          <span class="toggle__thumb"></span>
        </span>
      </span>
    </label>
  `;
}

function formatValue(key, value) {
  if (key === 'fontSize') return `${value} px`;
  if (key === 'textWidth') return `${value} %`;
  if (key === 'lineHeight') return value.toFixed(1);
  return String(value);
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

const ICON_CLOSE = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;
