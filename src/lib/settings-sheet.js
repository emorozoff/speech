import { escapeHtml } from './format.js';
import { FONTS, getFontStack } from './fonts.js';

const SLIDERS = [
  { key: 'fontSize', label: 'размер шрифта', min: 12, max: 52, step: 1 },
  { key: 'textWidth', label: 'ширина текста', min: 40, max: 75, step: 5 },
  { key: 'speed', label: 'скорость', min: 1, max: 20, step: 1 },
  { key: 'lineHeight', label: 'межстрочный', min: 1, max: 2.5, step: 0.1 },
];

const TOGGLES = [
  { key: 'mirrorH', label: 'зеркало по горизонтали' },
  { key: 'mirrorV', label: 'зеркало по вертикали' },
  { key: 'readingLine', label: 'линия чтения' },
  { key: 'voiceFollow', label: 'голосовое следование' },
];

const SELECTS = [
  {
    key: 'readingLinePosition',
    label: 'положение линии',
    options: [
      { value: 'top', label: 'сверху' },
      { value: 'center', label: 'центр' },
      { value: 'bottom', label: 'снизу' },
    ],
  },
];

// Запасной текст для превью, если у пользователя пустой скрипт.
const PREVIEW_FALLBACK =
  'превью текста\nтак он будет\nвыглядеть в суфлёре';

function buildPreviewSnippet(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return PREVIEW_FALLBACK;
  // Берём начало текста, ограничиваем длиной, чтобы крупный шрифт
  // не вылезал десятками строк за пределы превью.
  return trimmed.slice(0, 240);
}

function applyPreviewSettings(textEl, settings) {
  textEl.style.fontSize = `${settings.fontSize}px`;
  textEl.style.lineHeight = String(settings.lineHeight);
  textEl.style.maxWidth = `${settings.textWidth ?? 90}%`;
  textEl.style.fontFamily = getFontStack(settings.font);
}

export function openSettings({
  parent,
  settings,
  onChange,
  exclude = [],
  previewText,
}) {
  const excluded = new Set(exclude);
  const sliders = SLIDERS.filter((s) => !excluded.has(s.key));
  const toggles = TOGGLES.filter((t) => !excluded.has(t.key));
  const selects = SELECTS.filter((s) => !excluded.has(s.key));
  const showPreview = previewText !== undefined;
  const snippet = showPreview ? buildPreviewSnippet(previewText) : '';

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
      ${
        showPreview
          ? `<div class="sheet__preview" data-role="preview">
               <span class="sheet__preview-label">превью</span>
               <div class="sheet__preview-text" data-role="preview-text">${escapeHtml(snippet)}</div>
             </div>`
          : ''
      }
      <div class="sheet__content">
        ${
          excluded.has('font') || FONTS.length <= 1
            ? ''
            : renderFontPicker(settings.font)
        }
        ${sliders.length > 0 ? '<div class="sheet__divider"></div>' : ''}
        ${sliders.map((s) => renderSlider(s, settings[s.key])).join('')}
        ${selects.length > 0 ? '<div class="sheet__divider"></div>' : ''}
        ${selects.map((s) => renderSelect(s, settings[s.key])).join('')}
        ${toggles.length > 0 ? '<div class="sheet__divider"></div>' : ''}
        ${toggles.map((t) => renderToggle(t, settings[t.key])).join('')}
      </div>
    </div>
  `;
  parent.appendChild(sheet);

  const previewTextEl = sheet.querySelector('[data-role="preview-text"]');
  if (previewTextEl) applyPreviewSettings(previewTextEl, settings);

  // Любая правка через onChange может затрагивать визуал текста —
  // обновляем превью на каждое изменение, не дублируя список ключей.
  const refreshPreview = (key, value) => {
    if (!previewTextEl) return;
    if (
      key === 'font' ||
      key === 'fontSize' ||
      key === 'lineHeight' ||
      key === 'textWidth'
    ) {
      const next = { ...settings, [key]: value };
      applyPreviewSettings(previewTextEl, next);
    }
  };

  requestAnimationFrame(() => sheet.classList.add('sheet--open'));

  const close = () => {
    sheet.classList.remove('sheet--open');
    setTimeout(() => sheet.remove(), 240);
  };

  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="sheet-close"]')) close();
    const fontChip = e.target.closest('.font-chip');
    if (fontChip) {
      const value = fontChip.dataset.value;
      sheet.querySelectorAll('.font-chip').forEach((chip) => {
        chip.classList.toggle('is-selected', chip.dataset.value === value);
      });
      settings = { ...settings, font: value };
      refreshPreview('font', value);
      onChange('font', value);
    }
    const segmentedOption = e.target.closest('.segmented__option');
    if (segmentedOption) {
      const segmented = segmentedOption.closest('[data-segmented]');
      if (!segmented) return;
      const key = segmented.dataset.segmented;
      const value = segmentedOption.dataset.value;
      segmented.querySelectorAll('.segmented__option').forEach((opt) => {
        opt.classList.toggle('is-selected', opt.dataset.value === value);
      });
      settings = { ...settings, [key]: value };
      refreshPreview(key, value);
      onChange(key, value);
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
      if (valueEl) valueEl.textContent = formatValue(key, value);
      settings = { ...settings, [key]: value };
      refreshPreview(key, value);
      onChange(key, value);
    });
  });

  sheet.querySelectorAll('.font-chip').forEach((chip) => {
    chip.style.fontFamily = chip.dataset.stack;
  });

  return { close };
}

function renderFontPicker(currentFont) {
  return `
    <div class="setting-row setting-row--font">
      <span class="setting-row__label">шрифт</span>
      <div class="font-strip">
        ${FONTS.map(
          (f) => `
          <button
            class="font-chip ${currentFont === f.key ? 'is-selected' : ''}"
            data-value="${escapeHtml(f.key)}"
            data-stack="${escapeHtml(f.stack)}"
            type="button"
          >${escapeHtml(f.label)}</button>
        `,
        ).join('')}
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

function renderSelect(spec, value) {
  return `
    <div class="setting-row setting-row--select">
      <span class="setting-row__label">${escapeHtml(spec.label)}</span>
      <div class="segmented" data-segmented="${escapeHtml(spec.key)}">
        ${spec.options
          .map(
            (o) => `
              <button
                class="segmented__option ${value === o.value ? 'is-selected' : ''}"
                data-value="${escapeHtml(o.value)}"
                type="button"
              >${escapeHtml(o.label)}</button>
            `,
          )
          .join('')}
      </div>
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

const ICON_CLOSE = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;
