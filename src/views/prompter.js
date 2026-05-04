import {
  getScript,
  updateScript,
  setLastPosition,
  DEFAULT_SETTINGS,
} from '../storage/scripts.js';
import { getProfile, DEFAULT_WPM } from '../storage/profile.js';
import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';
import { debounce } from '../lib/debounce.js';
import { ScrollEngine } from '../lib/prompter-engine.js';
import { SmoothScroller } from '../lib/smooth-scroll.js';
import { VoiceFollower } from '../lib/voice-follower.js';
import { isSpeechSupported } from '../lib/recognition.js';
import { getFontStack } from '../lib/fonts.js';
import {
  enterFullscreen,
  exitFullscreen,
  acquireWakeLock,
  releaseWakeLock,
} from '../lib/screen.js';
import { openSettings } from '../lib/settings-sheet.js';

const FONT_SIZE_STEP = 2;
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 52;
const SPEED_STEP = 1;
const SPEED_MIN = 1;
const SPEED_MAX = 20;
const CONTROLS_HIDE_AFTER_MS = 2500;

export async function renderPrompter(root, { id }) {
  const [script, profile] = await Promise.all([getScript(id), getProfile()]);
  if (!script) {
    navigate('/', { replace: true });
    return;
  }

  const settings = { ...DEFAULT_SETTINGS, ...(script.settings ?? {}) };
  // Защита от испорченного профиля (wpm: 0 ломал бы расчёт времени).
  const wpm = Math.max(1, profile?.wpm ?? DEFAULT_WPM);
  let isPlaying = false;
  let wakeLock = null;
  let controlsTimer = null;
  let cleaned = false;
  let voice = null;
  let currentWordIdx = 0;
  let currentWordEl = null;
  let totalWords = 0;
  let totalSeconds = 0;

  // «продолжить с N%»: позиция валидна, если она в осмысленном диапазоне
  // и тело скрипта не было сильно переписано после паузы.
  const stored = typeof script.lastPosition === 'number' ? script.lastPosition : 0;
  const storedLen = typeof script.lastBodyLength === 'number' ? script.lastBodyLength : 0;
  const currentLen = (script.body ?? '').length;
  const lengthDrift = storedLen > 0 && Math.abs(currentLen - storedLen) > Math.max(50, currentLen * 0.1);
  let canResume = stored >= 0.05 && stored < 0.98 && !lengthDrift;
  const resumePercent = Math.max(1, Math.round(stored * 100));

  const persistSettings = debounce(async () => {
    await updateScript(id, { settings });
  }, 500);

  root.innerHTML = renderTemplate(script, settings, { canResume, resumePercent });
  const section = root.firstElementChild;
  section.classList.add('prompter--not-started');

  const viewport = section.querySelector('[data-role="viewport"]');
  const padTop = section.querySelector('[data-role="pad-top"]');
  const padBottom = section.querySelector('[data-role="pad-bottom"]');
  const shiftEl = section.querySelector('[data-role="shift"]');
  const textEl = section.querySelector('[data-role="text"]');
  const speedReadout = section.querySelector('[data-readout="speed"]');
  const fontReadout = section.querySelector('[data-readout="fontSize"]');
  const mirrorButton = section.querySelector('[data-action="toggle-mirror"]');
  const lineButton = section.querySelector('[data-action="toggle-line"]');
  const voiceButton = section.querySelector('[data-action="toggle-voice"]');
  const introIcon = section.querySelector('[data-role="intro-icon"]');
  const introLabel = section.querySelector('[data-role="intro-label"]');
  const progressTopEl = section.querySelector('[data-role="progress-top"]');
  const progressBottomEl = section.querySelector('[data-role="progress-bottom"]');
  const timerEl = section.querySelector('[data-role="timer"]');
  const wordElements = textEl.querySelectorAll('.prompter__word');
  totalWords = wordElements.length;
  totalSeconds = wpm > 0 ? (totalWords / wpm) * 60 : 0;

  const persistPosition = debounce(async () => {
    const max = viewport.scrollHeight - viewport.clientHeight;
    if (max <= 0) return;
    const pos = Math.min(1, Math.max(0, viewport.scrollTop / max));
    await setLastPosition(id, pos, currentLen);
  }, 1500);

  const clearStoredPosition = async () => {
    persistPosition.cancel();
    canResume = false;
    await setLastPosition(id, 0, currentLen);
  };

  function findWordIndexAtScroll(scrollTop) {
    const target = scrollTop + viewport.clientHeight * readingLineRatio();
    for (let i = 0; i < wordElements.length; i++) {
      const w = wordElements[i];
      if (w.offsetTop + w.offsetHeight >= target) return i;
    }
    return Math.max(0, wordElements.length - 1);
  }

  function applyResume() {
    const max = viewport.scrollHeight - viewport.clientHeight;
    if (max <= 0) return;
    const targetScroll = stored * max;
    viewport.scrollTop = targetScroll;
    const idx = findWordIndexAtScroll(targetScroll);
    currentWordIdx = idx;
    setCurrentWord(idx);
  }

  function readingLineRatio() {
    if (settings.readingLinePosition === 'top') return 0.25;
    if (settings.readingLinePosition === 'bottom') return 0.75;
    return 0.5;
  }

  function applyReadingLinePosition() {
    section.style.setProperty(
      '--reading-line-top',
      `${readingLineRatio() * 100}%`,
    );
  }

  applyReadingLinePosition();
  applyTextSettings(textEl, settings);
  applyVisualSettings(section, viewport, settings);
  syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
  syncIntroLabel();
  updatePadding();
  updateProgressAndTimer();

  function updateProgressAndTimer() {
    const max = viewport.scrollHeight - viewport.clientHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, viewport.scrollTop / max)) : 0;
    const pct = `${(progress * 100).toFixed(2)}%`;
    if (progressTopEl) progressTopEl.style.width = pct;
    if (progressBottomEl) progressBottomEl.style.width = pct;
    if (timerEl) {
      const remaining = Math.max(0, (1 - progress) * totalSeconds);
      timerEl.textContent = formatTimer(remaining);
    }
    if (isPlaying && progress > 0) persistPosition();
  }

  function syncIntroLabel() {
    if (!introIcon || !introLabel) return;
    introIcon.innerHTML = settings.voiceFollow ? ICON_MIC_LARGE : ICON_PLAY_LARGE;
    if (canResume) {
      introLabel.textContent = `продолжить · ${resumePercent}%`;
    } else {
      introLabel.textContent = settings.voiceFollow
        ? 'запустить с голосом'
        : 'запустить';
    }
  }

  function syncVoiceListening() {
    if (!voiceButton) return;
    const listening = settings.voiceFollow && voice && isPlaying;
    voiceButton.classList.toggle('is-listening', !!listening);
  }

  if (!isSpeechSupported() && voiceButton) {
    voiceButton.setAttribute('disabled', 'true');
    voiceButton.title = 'распознавание речи не поддерживается';
  }

  const engine = new ScrollEngine(viewport, settings.speed, {
    onFrame: (subPixel) => {
      shiftEl.style.transform = subPixel > 0
        ? `translate3d(0, -${subPixel}px, 0)`
        : '';
    },
  });
  engine.onEnd = async () => {
    pause();
    await persistPosition.flush();
    await clearStoredPosition();
  };
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

  const hideControlsImmediately = () => {
    if (controlsTimer) {
      clearTimeout(controlsTimer);
      controlsTimer = null;
    }
    section.classList.add('prompter--idle');
  };

  const acquireScreenLocks = async () => {
    if (wakeLock) return;
    try {
      await enterFullscreen(section);
      wakeLock = await acquireWakeLock();
    } catch {
      /* may fail if not in a user gesture (e.g. voice command) */
    }
  };

  const play = async () => {
    if (isPlaying) return;
    isPlaying = true;
    section.classList.add('prompter--playing');
    section.classList.remove('prompter--not-started');
    await acquireScreenLocks();
    if (settings.voiceFollow) {
      if (!voice) await enableVoice();
      else voice.resume();
    } else {
      engine.start();
    }
    syncVoiceListening();
    showControls();
  };

  const pause = () => {
    if (!isPlaying) return;
    isPlaying = false;
    section.classList.remove('prompter--playing');
    if (settings.voiceFollow && voice) {
      voice.pause();
    } else {
      engine.stop();
    }
    persistPosition.flush();
    syncVoiceListening();
    showControls();
  };

  const togglePlay = async () => {
    if (isPlaying) pause();
    else await play();
  };

  const reset = async () => {
    engine.stop();
    scroller.cancel();
    isPlaying = false;
    section.classList.remove('prompter--playing');
    viewport.scrollTop = 0;
    currentWordIdx = 0;
    setCurrentWord(0);
    if (voice) {
      voice.setCursor(0);
      voice.pause();
    }
    await clearStoredPosition();
    showControls();
  };

  const rewind = (n) => {
    const next = Math.max(0, currentWordIdx - n);
    currentWordIdx = next;
    setCurrentWord(next);
    scrollToWord(next, 350);
    if (voice) voice.setCursor(next);
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

  const enableVoice = async () => {
    if (!isSpeechSupported()) {
      settings.voiceFollow = false;
      syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
      syncIntroLabel();
      showVoiceErrorOverlay({
        title: 'распознавание речи недоступно',
        body: 'этот браузер не поддерживает распознавание речи. на iOS/iPadOS используйте Safari.',
      });
      return;
    }

    engine.stop();
    await acquireScreenLocks();

    voice = new VoiceFollower({
      scriptBody: script.body || '',
      onPosition: (idx) => {
        currentWordIdx = idx;
        setCurrentWord(idx);
        scrollToWord(idx);
        // Диктовка пошла — UI прячется сразу, чтобы не отвлекать.
        // Контролы вернутся по тапу.
        hideControlsImmediately();
      },
      onCommand: (cmd) => handleCommand(cmd),
      onStateChange: () => {
        syncVoiceListening();
      },
      onError: (msg, code) => {
        settings.voiceFollow = false;
        if (voice) {
          voice.stop();
          voice = null;
        }
        isPlaying = false;
        section.classList.remove('prompter--playing');
        syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
        syncVoiceListening();
        syncIntroLabel();
        persistSettings();
        if (code === 'permission-denied') {
          showVoiceErrorOverlay({
            title: 'микрофон недоступен',
            body: 'разрешите доступ к микрофону, чтобы текст следовал за вашей речью.',
            hint: 'Настройки → Safari → Микрофон → Разрешить',
          });
        } else {
          showVoiceErrorOverlay({
            title: 'голос отключён',
            body: msg || 'произошла ошибка распознавания речи.',
          });
        }
      },
    });
    voice.setCursor(currentWordIdx);
    voice.start();
    syncVoiceListening();
  };

  function showVoiceErrorOverlay({ title, body, hint }) {
    let overlay = section.querySelector('[data-role="voice-error"]');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'prompter__voice-error';
      overlay.dataset.role = 'voice-error';
      overlay.innerHTML = `
        <div class="prompter__voice-error-content">
          <span class="prompter__voice-error-icon" aria-hidden="true">${ICON_MIC_OFF}</span>
          <h3 class="prompter__voice-error-title" data-role="ve-title"></h3>
          <p class="prompter__voice-error-body" data-role="ve-body"></p>
          <p class="prompter__voice-error-hint" data-role="ve-hint"></p>
          <button
            class="button button--primary prompter__voice-error-button"
            data-action="voice-error-dismiss"
            type="button"
          >понятно</button>
        </div>
      `;
      section.appendChild(overlay);
    }
    overlay.querySelector('[data-role="ve-title"]').textContent = title;
    overlay.querySelector('[data-role="ve-body"]').textContent = body;
    const hintEl = overlay.querySelector('[data-role="ve-hint"]');
    if (hint) {
      hintEl.textContent = hint;
      hintEl.style.display = '';
    } else {
      hintEl.style.display = 'none';
    }
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
  }

  function hideVoiceErrorOverlay() {
    const overlay = section.querySelector('[data-role="voice-error"]');
    if (!overlay) return;
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 240);
  }

  const handleCommand = (cmd) => {
    showCommandToast(cmd.label);
    switch (cmd.action) {
      case 'pause':
        pause();
        break;
      case 'play':
        play();
        break;
      case 'reset':
        reset();
        break;
      case 'speedUp':
        adjustSpeed(SPEED_STEP);
        break;
      case 'speedDown':
        adjustSpeed(-SPEED_STEP);
        break;
      case 'fontUp':
        adjustFontSize(FONT_SIZE_STEP);
        break;
      case 'fontDown':
        adjustFontSize(-FONT_SIZE_STEP);
        break;
      case 'rewind':
        rewind(cmd.amount);
        break;
    }
    showControls();
  };

  function showCommandToast(label) {
    const toast = section.querySelector('[data-role="command-toast"]');
    if (!toast) return;
    toast.textContent = label;
    toast.classList.add('is-visible');
    if (showCommandToast._timer) clearTimeout(showCommandToast._timer);
    showCommandToast._timer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 1200);
  }

  const disableVoice = () => {
    if (voice) {
      voice.stop();
      voice = null;
    }
    isPlaying = false;
    section.classList.remove('prompter--playing');
    syncVoiceListening();
    clearCurrentWord();
  };

  const openPromptSettings = () => {
    openSettings({
      parent: section,
      settings,
      previewText: script.body,
      onChange: (key, value) => {
        settings[key] = value;
        if (
          key === 'font' ||
          key === 'fontSize' ||
          key === 'lineHeight' ||
          key === 'textWidth'
        ) {
          applyTextSettings(textEl, settings);
          updatePadding();
          if (key === 'fontSize' && fontReadout) {
            fontReadout.textContent = String(settings.fontSize);
          }
          if (currentWordEl) {
            requestAnimationFrame(() => scrollToWord(currentWordIdx, 0));
          }
        } else if (
          key === 'mirrorH' ||
          key === 'mirrorV' ||
          key === 'readingLine'
        ) {
          applyVisualSettings(section, viewport, settings);
          syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
        } else if (key === 'readingLinePosition') {
          applyReadingLinePosition();
          if (currentWordEl) {
            requestAnimationFrame(() => scrollToWord(currentWordIdx, 0));
          }
        } else if (key === 'speed') {
          engine.setSpeed(settings.speed);
          if (speedReadout) speedReadout.textContent = String(settings.speed);
        } else if (key === 'voiceFollow') {
          // Голос меняется через настройки: если выключили — глушим сейчас,
          // если включили — подхватится при следующем play (включать на ходу
          // нельзя, нужен явный user gesture для микрофона).
          if (!settings.voiceFollow && voice) {
            disableVoice();
          }
          syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
          syncIntroLabel();
        }
        persistSettings();
      },
    });
  };

  const toggleVoice = async () => {
    settings.voiceFollow = !settings.voiceFollow;
    if (settings.voiceFollow) {
      await enableVoice();
      if (voice) {
        isPlaying = true;
        section.classList.add('prompter--playing');
        syncVoiceListening();
      }
    } else {
      disableVoice();
    }
    syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
    syncIntroLabel();
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
    // Сбрасываем sub-pixel offset, иначе smooth-scroller считает позицию
    // по «дрейфующему» базису и слово окажется не на линии чтения.
    shiftEl.style.transform = '';
    const wordRect = word.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const wordCenter =
      viewport.scrollTop +
      (wordRect.top - viewportRect.top) +
      wordRect.height / 2;
    const target = wordCenter - viewport.clientHeight * readingLineRatio();
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
    if (showCommandToast._timer) {
      clearTimeout(showCommandToast._timer);
      showCommandToast._timer = null;
    }
    window.removeEventListener('resize', updatePadding);
    window.removeEventListener('hashchange', onHashChange);
    document.removeEventListener('visibilitychange', onVisibility);
    viewport.removeEventListener('scroll', updateProgressAndTimer);
    if (wakeLock) {
      await releaseWakeLock(wakeLock);
      wakeLock = null;
    }
    await exitFullscreen();
    await persistSettings.flush();
    await persistPosition.flush();
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
    updateProgressAndTimer();
  }

  async function onVisibility() {
    if (document.hidden && isPlaying) pause();
  }

  // Если пользователь нажмёт «назад» в браузере, exit() не вызовется
  // и engine/voice/wakeLock останутся висеть. Ловим hashchange и чистим.
  function onHashChange() {
    const path = window.location.hash.slice(1);
    if (!path.startsWith(`/prompter/${id}`)) {
      cleanup();
    }
  }

  window.addEventListener('resize', updatePadding);
  window.addEventListener('hashchange', onHashChange);
  document.addEventListener('visibilitychange', onVisibility);
  viewport.addEventListener('scroll', updateProgressAndTimer, { passive: true });

  // settings.voiceFollow auto-enable удалено: микрофон требует
  // явного user gesture, иначе iOS может молча отказать.

  section.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'intro-start') {
      e.preventDefault();
      e.stopPropagation();
      if (canResume) applyResume();
      await play();
      return;
    }
    if (action === 'intro-restart') {
      e.preventDefault();
      e.stopPropagation();
      await clearStoredPosition();
      currentWordIdx = 0;
      setCurrentWord(0);
      viewport.scrollTop = 0;
      await play();
      return;
    }
    if (action === 'play') {
      await togglePlay();
    } else if (action === 'reset') {
      await reset();
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
    } else if (action === 'settings-open') {
      e.stopPropagation();
      openPromptSettings();
      showControls();
    } else if (action === 'voice-error-dismiss') {
      e.stopPropagation();
      hideVoiceErrorOverlay();
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
  const width = settings.textWidth ?? 90;
  textEl.style.maxWidth = `${width}%`;
  textEl.style.fontFamily = getFontStack(settings.font);
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

function formatTimer(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

function renderTemplate(script, settings, resume) {
  const body = script.body || '';
  return `
    <section class="prompter">
      <div class="prompter__progress prompter__progress--top" aria-hidden="true">
        <div class="prompter__progress-bar" data-role="progress-top"></div>
      </div>

      <div class="prompter__viewport" data-role="viewport">
        <div class="prompter__pad" data-role="pad-top"></div>
        <div class="prompter__shift" data-role="shift">
          <div class="prompter__text" data-role="text">${renderBodyWithWords(body)}</div>
        </div>
        <div class="prompter__pad" data-role="pad-bottom"></div>
      </div>

      <div class="prompter__reading-line" aria-hidden="true"></div>

      <div class="prompter__progress prompter__progress--bottom" aria-hidden="true">
        <div class="prompter__progress-bar" data-role="progress-bottom"></div>
      </div>

      <div class="prompter__timer" data-role="timer">0:00</div>

      <button
        class="prompter__settings-button"
        data-action="settings-open"
        aria-label="настройки"
      >${ICON_GEAR}</button>

      <div class="prompter__zone-hint prompter__zone-hint--left" aria-hidden="true">−</div>
      <div class="prompter__zone-hint prompter__zone-hint--right" aria-hidden="true">+</div>

      <div class="prompter__command-toast" data-role="command-toast" role="status" aria-live="polite"></div>

      <div class="prompter__intro" data-role="intro">
        <button class="prompter__intro-button" data-action="intro-start">
          <span class="prompter__intro-icon" data-role="intro-icon"></span>
          <span class="prompter__intro-label" data-role="intro-label"></span>
        </button>
        ${
          resume.canResume
            ? `<button
                class="prompter__intro-secondary"
                data-action="intro-restart"
                type="button"
              >начать сначала</button>`
            : ''
        }
        <p class="prompter__intro-hint">
          разрешите микрофон при первом запуске,<br/>затем
          <strong>«суфлёр стоп»</strong> и <strong>«суфлёр старт»</strong> голосом
        </p>
      </div>

      <div class="prompter__controls" data-role="controls">
        <div class="prompter__group prompter__group--utility">
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

        <div class="prompter__group prompter__group--font">
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

        <div class="prompter__group prompter__group--speed">
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

const ICON_MIC_OFF = `
  <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
    <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  </svg>
`;

const ICON_GEAR = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>
`;

const ICON_MIC_LARGE = `
  <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
    <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;

const ICON_PLAY_LARGE = `
  <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" fill="none">
    <path d="M8 5.5v13L19 12 8 5.5Z" fill="currentColor"/>
  </svg>
`;
