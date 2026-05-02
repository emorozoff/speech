import { getScript, updateScript } from '../storage/scripts.js';
import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';
import { debounce } from '../lib/debounce.js';
import { ScrollEngine } from '../lib/prompter-engine.js';
import { SmoothScroller } from '../lib/smooth-scroll.js';
import { VoiceFollower } from '../lib/voice-follower.js';
import { isSpeechSupported } from '../lib/recognition.js';
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
  let voice = null;
  let currentWordIdx = 0;
  let currentWordEl = null;

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
  const mirrorButton = section.querySelector('[data-action="toggle-mirror"]');
  const lineButton = section.querySelector('[data-action="toggle-line"]');
  const voiceButton = section.querySelector('[data-action="toggle-voice"]');
  const wordElements = textEl.querySelectorAll('.prompter__word');

  applyTextSettings(textEl, settings);
  applyVisualSettings(section, viewport, settings);
  syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
  updatePadding();

  if (!isSpeechSupported() && voiceButton) {
    voiceButton.setAttribute('disabled', 'true');
    voiceButton.title = 'распознавание речи не поддерживается';
  }

  const engine = new ScrollEngine(viewport, settings.speed);
  engine.onEnd = () => pause();
  const scroller = new SmoothScroller(viewport);

  const showControls = () => {
    section.classList.remove('prompter--idle');
    if (controlsTimer) {
      clearTimeout(controlsTimer);
      controlsTimer = null;
    }
    if (isPlaying || (voice && settings.voiceFollow)) {
      controlsTimer = setTimeout(() => {
        section.classList.add('prompter--idle');
      }, CONTROLS_HIDE_AFTER_MS);
    }
  };

  const play = async () => {
    if (settings.voiceFollow) {
      // в режиме голоса play не нужен — голос ведёт
      return;
    }
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
    engine.stop();
    scroller.cancel();
    isPlaying = false;
    section.classList.remove('prompter--playing');
    viewport.scrollTop = 0;
    setCurrentWord(0);
    if (voice) voice.setCursor(0);
    showControls();
  };

  const adjustSpeed = (delta) => {
    settings.speed = clamp(settings.speed + delta, SPEED_MIN, SPEED_MAX);
    engine.setSpeed(settings.speed);
    speedReadout.textContent = String(settings.speed);
    persistSettings();
  };

  const adjustFontSize = (delta) => {
    settings.fontSize = clamp(
      settings.fontSize + delta,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX,
    );
    applyTextSettings(textEl, settings);
    fontReadout.textContent = String(settings.fontSize);
    updatePadding();
    if (currentWordEl) {
      // удерживаем подсвеченное слово на линии чтения после изменения размера
      requestAnimationFrame(() => scrollToWord(currentWordIdx, 0));
    }
    persistSettings();
  };

  const toggleMirror = () => {
    settings.mirrorH = !settings.mirrorH;
    applyVisualSettings(section, viewport, settings);
    syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
    persistSettings();
  };

  const toggleReadingLine = () => {
    settings.readingLine = !settings.readingLine;
    applyVisualSettings(section, viewport, settings);
    syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
    persistSettings();
  };

  const enableVoice = () => {
    if (!isSpeechSupported()) {
      window.alert('Распознавание речи не поддерживается этим браузером');
      settings.voiceFollow = false;
      syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
      return;
    }
    if (isPlaying) pause();

    voice = new VoiceFollower({
      scriptBody: script.body || '',
      onPosition: (idx) => {
        currentWordIdx = idx;
        setCurrentWord(idx);
        scrollToWord(idx);
      },
      onStateChange: (state) => {
        if (voiceButton) {
          voiceButton.classList.toggle('is-listening', state === 'listening');
        }
      },
      onError: (msg) => {
        settings.voiceFollow = false;
        if (voice) {
          voice.stop();
          voice = null;
        }
        syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
        persistSettings();
        window.alert(`Голосовое следование: ${msg}`);
      },
    });
    voice.setCursor(currentWordIdx);
    voice.start();
  };

  const disableVoice = () => {
    if (voice) {
      voice.stop();
      voice = null;
    }
    if (voiceButton) voiceButton.classList.remove('is-listening');
    clearCurrentWord();
  };

  const toggleVoice = () => {
    settings.voiceFollow = !settings.voiceFollow;
    if (settings.voiceFollow) enableVoice();
    else disableVoice();
    syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
    persistSettings();
  };

  function setCurrentWord(idx) {
    if (currentWordEl) currentWordEl.classList.remove('prompter__word--current');
    const next = wordElements[idx];
    if (next) {
      next.classList.add('prompter__word--current');
      currentWordEl = next;
    } else {
      currentWordEl = null;
    }
  }

  function clearCurrentWord() {
    if (currentWordEl) currentWordEl.classList.remove('prompter__word--current');
    currentWordEl = null;
  }

  function scrollToWord(idx, durationMs = 250) {
    const word = wordElements[idx];
    if (!word) return;
    const wordRect = word.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const wordCenter =
      viewport.scrollTop +
      (wordRect.top - viewportRect.top) +
      wordRect.height / 2;
    const target = wordCenter - viewport.clientHeight / 2;
    scroller.scrollTo(target, durationMs);
  }

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    isPlaying = false;
    engine.stop();
    scroller.cancel();
    if (voice) {
      voice.stop();
      voice = null;
    }
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
    if (document.hidden && isPlaying) pause();
  }

  window.addEventListener('resize', updatePadding);
  document.addEventListener('visibilitychange', onVisibility);

  if (settings.voiceFollow) enableVoice();

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
    } else if (action === 'toggle-mirror') {
      toggleMirror();
      showControls();
    } else if (action === 'toggle-line') {
      toggleReadingLine();
      showControls();
    } else if (action === 'toggle-voice') {
      toggleVoice();
      showControls();
    } else if (e.target.closest('[data-role="controls"]')) {
      showControls();
    } else {
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

function applyVisualSettings(section, viewport, settings) {
  viewport.classList.toggle('prompter__viewport--mirror-h', !!settings.mirrorH);
  viewport.classList.toggle('prompter__viewport--mirror-v', !!settings.mirrorV);
  section.classList.toggle('prompter--with-line', !!settings.readingLine);
}

function syncToggleStates({ mirrorButton, lineButton, voiceButton, settings }) {
  if (mirrorButton) {
    mirrorButton.classList.toggle('is-on', !!settings.mirrorH);
    mirrorButton.setAttribute(
      'aria-pressed',
      settings.mirrorH ? 'true' : 'false',
    );
  }
  if (lineButton) {
    lineButton.classList.toggle('is-on', !!settings.readingLine);
    lineButton.setAttribute(
      'aria-pressed',
      settings.readingLine ? 'true' : 'false',
    );
  }
  if (voiceButton) {
    voiceButton.classList.toggle('is-on', !!settings.voiceFollow);
    voiceButton.setAttribute(
      'aria-pressed',
      settings.voiceFollow ? 'true' : 'false',
    );
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderBodyWithWords(body) {
  if (!body) return '<span class="prompter__empty">пустой текст</span>';
  const re = /[\p{L}\p{N}]+/gu;
  const out = [];
  let last = 0;
  let i = 0;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      out.push(escapeHtml(body.slice(last, m.index)));
    }
    out.push(
      `<span class="prompter__word" data-i="${i}">${escapeHtml(m[0])}</span>`,
    );
    i++;
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    out.push(escapeHtml(body.slice(last)));
  }
  return out.join('');
}

function renderTemplate(script, settings) {
  const body = script.body || '';
  return `
    <section class="prompter">
      <div class="prompter__viewport" data-role="viewport">
        <div class="prompter__pad" data-role="pad-top"></div>
        <div class="prompter__text" data-role="text">${renderBodyWithWords(body)}</div>
        <div class="prompter__pad" data-role="pad-bottom"></div>
      </div>

      <div class="prompter__reading-line" aria-hidden="true"></div>

      <div class="prompter__zone-hint prompter__zone-hint--left" aria-hidden="true">−</div>
      <div class="prompter__zone-hint prompter__zone-hint--right" aria-hidden="true">+</div>

      <div class="prompter__controls" data-role="controls">
        <div class="prompter__group">
          <button class="prompter__icon" data-action="exit" aria-label="выход">
            ${ICON_CLOSE}
          </button>
          <button
            class="prompter__icon"
            data-action="toggle-mirror"
            aria-label="зеркало"
            aria-pressed="false"
          >${ICON_MIRROR}</button>
          <button
            class="prompter__icon"
            data-action="toggle-line"
            aria-label="линия чтения"
            aria-pressed="false"
          >${ICON_LINE}</button>
          <button
            class="prompter__icon"
            data-action="toggle-voice"
            aria-label="голосовое следование"
            aria-pressed="false"
          >${ICON_MIC}</button>
        </div>

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

const ICON_MIRROR = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M12 3v18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2"/>
    <path d="M9 7 4 12l5 5V7Z" fill="currentColor"/>
    <path d="M15 7v10l5-5-5-5Z" fill="currentColor" opacity="0.5"/>
  </svg>
`;

const ICON_LINE = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M3 12h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
  </svg>
`;

const ICON_MIC = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
    <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;
