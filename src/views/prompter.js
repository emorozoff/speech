import { getScript, updateScript } from '../storage/scripts.js';
import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';
import { debounce } from '../lib/debounce.js';
import { ScrollEngine } from '../lib/prompter-engine.js';
import {
  enterFullscreen,
  exitFullscreen,
  lockOrientation,
  unlockOrientation,
  acquireWakeLock,
  releaseWakeLock,
} from '../lib/screen.js';

const FONT_SIZE_STEP = 6;
const FONT_SIZE_MIN = 24;
const FONT_SIZE_MAX = 128;
const SPEED_STEP = 5;
const SPEED_MIN = 1;
const SPEED_MAX = 100;
const CONTROLS_HIDE_AFTER_MS = 2500;

export async function renderPrompter(root, { id }) {
  const script = await getScript(id);
  if (!script) {
    navigate('/', { replace: true });
    return;
  }

  const settings = { ...script.settings };
  let isPlaying = false;
  let wakeLock = null;
  let controlsTimer = null;
  let cleaned = false;

  const persistSettings = debounce(async () => {
    await updateScript(id, { settings });
  }, 500);

  root.innerHTML = renderTemplate(script, settings);
  const section = root.firstElementChild;
  const viewport = section.querySelector('[data-role="viewport"]');
  const padTop = section.querySelector('[data-role="pad-top"]');
  const padBottom = section.querySelector('[data-role="pad-bottom"]');
  const textEl = section.querySelector('[data-role="text"]');
  const speedReadout = section.querySelector('[data-readout="speed"]');
  const fontReadout = section.querySelector('[data-readout="fontSize"]');

  applyTextSettings(textEl, settings);
  updatePadding();

  const engine = new ScrollEngine(viewport, settings.speed);
  engine.onEnd = () => pause();

  const showControls = () => {
    section.classList.remove('prompter--idle');
    if (controlsTimer) {
      clearTimeout(controlsTimer);
      controlsTimer = null;
    }
    if (isPlaying) {
      controlsTimer = setTimeout(() => {
        section.classList.add('prompter--idle');
      }, CONTROLS_HIDE_AFTER_MS);
    }
  };

  const play = async () => {
    isPlaying = true;
    section.classList.add('prompter--playing');
    if (!wakeLock) {
      await enterFullscreen(section);
      await lockOrientation('landscape');
      wakeLock = await acquireWakeLock();
    }
    engine.start();
    showControls();
  };

  const pause = () => {
    isPlaying = false;
    section.classList.remove('prompter--playing');
    engine.stop();
    showControls();
  };

  const togglePlay = async () => {
    if (isPlaying) pause();
    else await play();
  };

  const reset = () => {
    engine.reset();
    showControls();
  };

  const adjustSpeed = (delta) => {
    settings.speed = clamp(settings.speed + delta, SPEED_MIN, SPEED_MAX);
    engine.setSpeed(settings.speed);
    speedReadout.textContent = String(settings.speed);
    persistSettings();
  };

  const adjustFontSize = (delta) => {
    settings.fontSize = clamp(settings.fontSize + delta, FONT_SIZE_MIN, FONT_SIZE_MAX);
    applyTextSettings(textEl, settings);
    fontReadout.textContent = String(settings.fontSize);
    persistSettings();
  };

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    isPlaying = false;
    engine.stop();
    if (controlsTimer) clearTimeout(controlsTimer);
    window.removeEventListener('resize', updatePadding);
    document.removeEventListener('visibilitychange', onVisibility);
    if (wakeLock) {
      await releaseWakeLock(wakeLock);
      wakeLock = null;
    }
    unlockOrientation();
    await exitFullscreen();
    await persistSettings.flush();
  };

  const exit = async () => {
    await cleanup();
    navigate(`/editor/${id}`);
  };

  function updatePadding() {
    const h = viewport.clientHeight;
    if (h <= 0) return;
    const pad = `${Math.round(h / 2)}px`;
    padTop.style.height = pad;
    padBottom.style.height = pad;
  }

  async function onVisibility() {
    if (document.hidden) {
      if (isPlaying) pause();
    } else if (wakeLock === null) {
      // wake lock auto-released when tab hidden — re-acquire if we're back
      // (only matters if user re-plays manually, no-op here)
    }
  }

  window.addEventListener('resize', updatePadding);
  document.addEventListener('visibilitychange', onVisibility);

  section.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'play') {
      await togglePlay();
    } else if (action === 'reset') {
      reset();
    } else if (action === 'exit') {
      await exit();
    } else if (action === 'speed-up') {
      adjustSpeed(SPEED_STEP);
      showControls();
    } else if (action === 'speed-down') {
      adjustSpeed(-SPEED_STEP);
      showControls();
    } else if (action === 'font-up') {
      adjustFontSize(FONT_SIZE_STEP);
      showControls();
    } else if (action === 'font-down') {
      adjustFontSize(-FONT_SIZE_STEP);
      showControls();
    } else if (e.target.closest('[data-role="controls"]')) {
      // tap внутри панели контролов, но не на кнопке — просто разбудить
      showControls();
    } else {
      // тап по тексту — определяем зону
      const rect = section.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      if (ratio < 0.25) {
        adjustSpeed(-SPEED_STEP);
      } else if (ratio > 0.75) {
        adjustSpeed(SPEED_STEP);
      }
      showControls();
    }
  });
}

function applyTextSettings(textEl, settings) {
  textEl.style.fontSize = `${settings.fontSize}px`;
  textEl.style.lineHeight = String(settings.lineHeight);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderTemplate(script, settings) {
  const body = script.body || '';
  return `
    <section class="prompter">
      <div class="prompter__viewport" data-role="viewport">
        <div class="prompter__pad" data-role="pad-top"></div>
        <div class="prompter__text" data-role="text">${escapeHtml(body) || '<span class="prompter__empty">пустой текст</span>'}</div>
        <div class="prompter__pad" data-role="pad-bottom"></div>
      </div>

      <div class="prompter__zone-hint prompter__zone-hint--left" aria-hidden="true">−</div>
      <div class="prompter__zone-hint prompter__zone-hint--right" aria-hidden="true">+</div>

      <div class="prompter__controls" data-role="controls">
        <button class="prompter__icon" data-action="exit" aria-label="выход">
          ${ICON_CLOSE}
        </button>

        <div class="prompter__group">
          <button class="prompter__btn-text" data-action="font-down" aria-label="меньше шрифт">A−</button>
          <span class="prompter__readout">
            <span class="prompter__readout-label">шрифт</span>
            <strong data-readout="fontSize">${settings.fontSize}</strong>
          </span>
          <button class="prompter__btn-text" data-action="font-up" aria-label="больше шрифт">A+</button>
        </div>

        <div class="prompter__group prompter__group--main">
          <button class="prompter__icon" data-action="reset" aria-label="к началу">
            ${ICON_RESET}
          </button>
          <button class="prompter__play" data-action="play" aria-label="играть/пауза">
            <span class="prompter__play-icon prompter__play-icon--play">${ICON_PLAY}</span>
            <span class="prompter__play-icon prompter__play-icon--pause">${ICON_PAUSE}</span>
          </button>
        </div>

        <div class="prompter__group">
          <button class="prompter__icon" data-action="speed-down" aria-label="медленнее">
            ${ICON_MINUS}
          </button>
          <span class="prompter__readout">
            <span class="prompter__readout-label">скорость</span>
            <strong data-readout="speed">${settings.speed}</strong>
          </span>
          <button class="prompter__icon" data-action="speed-up" aria-label="быстрее">
            ${ICON_PLUS}
          </button>
        </div>
      </div>
    </section>
  `;
}

const ICON_CLOSE = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;

const ICON_PLAY = `
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none">
    <path d="M8 5.5v13L19 12 8 5.5Z" fill="currentColor"/>
  </svg>
`;

const ICON_PAUSE = `
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none">
    <rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>
    <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>
  </svg>
`;

const ICON_RESET = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M4 12a8 8 0 1 0 2.34-5.66" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M3 4v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const ICON_MINUS = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </svg>
`;

const ICON_PLUS = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </svg>
`;
