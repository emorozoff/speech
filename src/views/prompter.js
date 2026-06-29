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
const TEXT_OFFSET_STEP = 30;
const TEXT_OFFSET_Y_STEP = 10;
const TEXT_OFFSET_MAX = 200;
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

  const persistSettings = debounce(async () => {
    await updateScript(id, { settings });
  }, 500);

  root.innerHTML = renderTemplate(script, settings);
  const section = root.firstElementChild;

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

  // Горизонтальный pan через transform на тексте. Sub-pixel offset от
  // движка совмещаем тут же, чтобы было одно место с применением
  // transform.
  // Вертикальный pan (textOffsetY) НЕ применяется через transform —
  // он смещает reading line, а scroll engine сам кладёт слово на новую
  // линию. Иначе визуально слово оказывалось не там, где пользователь
  // ожидает его видеть после сдвига.
  let currentSubPixel = 0;
  function applyShiftTransform() {
    const offsetX = settings.textOffset ?? 0;
    if (offsetX === 0 && currentSubPixel === 0) {
      shiftEl.style.transform = '';
    } else {
      shiftEl.style.transform = `translate3d(${offsetX}px, ${-currentSubPixel}px, 0)`;
    }
  }

  // «Линия чтения» в пикселях от верха viewport — учитывает и базовый
  // ratio из настроек (top/center/bottom), и пользовательский Y-сдвиг.
  function readingLineY() {
    return (
      viewport.clientHeight * readingLineRatio() +
      (settings.textOffsetY ?? 0)
    );
  }

  function findWordIndexAtScroll(scrollTop) {
    const target = scrollTop + readingLineY();
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
    section.style.setProperty(
      '--reading-line-y-offset',
      `${settings.textOffsetY ?? 0}px`,
    );
  }

  applyReadingLinePosition();
  applyTextSettings(textEl, settings);
  applyVisualSettings(section, viewport, settings);
  applyShiftTransform();
  syncToggleStates({ mirrorButton, lineButton, voiceButton, settings });
  updatePadding();
  updateProgressAndTimer();

  // Если есть валидная сохранённая позиция — сразу её применяем.
  // requestAnimationFrame нужен, чтобы дождаться layout
  // (scrollHeight доступен только после первого браузерного фрейма).
  if (canResume) {
    requestAnimationFrame(() => applyResume());
  }

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
      currentSubPixel = subPixel;
      applyShiftTransform();
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
    // В голосовом режиме иконки видны до первой реплики — прячет их
    // hideControlsImmediately из onPosition. Таймер автоскрытия взводим
    // только когда движок сам крутит текст без голоса.
    const inVoiceMode = voice && settings.voiceFollow;
    if (isPlaying && !inVoiceMode) {
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

  const adjustTextOffsetX = (delta) => {
    const next = clamp(
      (settings.textOffset ?? 0) + delta,
      -TEXT_OFFSET_MAX,
      TEXT_OFFSET_MAX,
    );
    if (next === settings.textOffset) return;
    settings.textOffset = next;
    applyShiftTransform();
    persistSettings();
  };

  const adjustTextOffsetY = (delta) => {
    const next = clamp(
      (settings.textOffsetY ?? 0) + delta,
      -TEXT_OFFSET_MAX,
      TEXT_OFFSET_MAX,
    );
    if (next === settings.textOffsetY) return;
    settings.textOffsetY = next;
    applyReadingLinePosition();
    // Подкручиваем scroll, чтобы текущее слово сразу оказалось на новой
    // позиции линии чтения — иначе после сдвига оно осталось бы там, где
    // было до сдвига, и ждать пришлось бы пока voice его «догонит».
    if (currentWordEl) {
      requestAnimationFrame(() => scrollToWord(currentWordIdx, 0));
    }
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
      showVoiceErrorOverlay({
        title: 'Распознавание речи недоступно',
        body: 'Этот браузер не умеет распознавать речь. Откройте speech в Safari на iPhone — там работает.',
      });
      return;
    }

    engine.stop();
    await acquireScreenLocks();

    // Подстраховка: гасим прошлый экземпляр, если он почему-то остался,
    // чтобы не запустить два recognition разом — iOS этого не прощает и
    // новый «молча» не стартует (типичная причина «помогает перезапуск»).
    if (voice) {
      voice.stop();
      voice = null;
    }

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
        persistSettings();
        if (code === 'permission-denied') {
          showVoiceErrorOverlay({
            title: 'Микрофон недоступен',
            body: 'Дайте микрофону зелёный свет — и текст начнёт послушно бежать за вашим голосом.',
            hint: 'Настройки → Safari → Микрофон → Разрешить',
          });
        } else {
          showVoiceErrorOverlay({
            title: 'Голос отключён',
            body: msg || 'Что-то сломалось в распознавании речи. Попробуйте ещё раз.',
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
          >Понятно</button>
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
    // Сбрасываем sub-pixel остаток, иначе smooth-scroller считает позицию
    // по «дрейфующему» базису и слово окажется не на линии чтения.
    // Горизонтальный offset сохраняется — он не влияет на расчёт scrollTop.
    currentSubPixel = 0;
    applyShiftTransform();
    const wordRect = word.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const wordCenter =
      viewport.scrollTop +
      (wordRect.top - viewportRect.top) +
      wordRect.height / 2;
    const target = wordCenter - readingLineY();
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
    if (!document.hidden) return;
    // Уход в фон: останавливаем прокрутку и жёстко отпускаем микрофон
    // (suspend). Иначе на iOS индикатор записи горит ещё долго после
    // сворачивания, а recognition пытается «воскреснуть» в фоне.
    // Вернётся к жизни при следующем тапе Play (voice.resume() внутри play).
    if (isPlaying) pause();
    if (voice) voice.suspend();
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
    } else if (action === 'pan-up') {
      e.stopPropagation();
      adjustTextOffsetY(-TEXT_OFFSET_Y_STEP);
      showControls();
    } else if (action === 'pan-down') {
      e.stopPropagation();
      adjustTextOffsetY(TEXT_OFFSET_Y_STEP);
      showControls();
    } else if (e.target.closest('[data-role="controls"]')) {
      showControls();
    } else {
      // Боковые зоны двигают текст по горизонтали — удобно подогнать
      // его под лицо в кадре, не залезая в настройки. Вертикаль —
      // через явные кнопки сверху, потому что нижняя четверть была бы
      // под controls bar и недоступна.
      const rect = section.getBoundingClientRect();
      const fromLeft = e.clientX - rect.left;
      const fromRight = rect.width - fromLeft;
      const HORIZ_EDGE = rect.width * 0.25;
      const minH = Math.min(fromLeft, fromRight);

      if (minH < HORIZ_EDGE) {
        let goRight = fromLeft > fromRight;
        if (settings.mirrorH) goRight = !goRight;
        adjustTextOffsetX(goRight ? TEXT_OFFSET_STEP : -TEXT_OFFSET_STEP);
      }
      showControls();
    }
  });
}

function applyTextSettings(textEl, settings) {
  textEl.style.fontSize = `${settings.fontSize}px`;
  textEl.style.lineHeight = String(settings.lineHeight);
  // 65% — потолок ширины: шире никогда не нужно и хуже читается. Старые
  // скрипты могли сохранить 75% — клампим при применении.
  const width = Math.min(65, settings.textWidth ?? 65);
  textEl.style.maxWidth = `${width}%`;
  textEl.style.fontFamily = getFontStack(settings.font);
}

function applyVisualSettings(section, viewport, settings) {
  // Зеркалим весь UI через wrap, а не только текст — иконки, контролы,
  // прогресс. Settings-sheet и voice-error overlay создаются динамически
  // как siblings wrap'а, поэтому остаются читаемыми.
  section.classList.toggle('prompter--mirror-h', !!settings.mirrorH);
  section.classList.toggle('prompter--mirror-v', !!settings.mirrorV);
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

function renderTemplate(script, settings) {
  const body = script.body || '';
  return `
    <section class="prompter">
      <div class="prompter__mirror-wrap" data-role="mirror-wrap">
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

      <div class="prompter__pan-y-group">
        <button
          class="prompter__pan-y"
          data-action="pan-up"
          aria-label="сдвинуть текст вверх"
        >${ICON_CHEVRON_UP}</button>
        <button
          class="prompter__pan-y"
          data-action="pan-down"
          aria-label="сдвинуть текст вниз"
        >${ICON_CHEVRON_DOWN}</button>
      </div>

      <div class="prompter__zone-hint prompter__zone-hint--left" aria-hidden="true">‹</div>
      <div class="prompter__zone-hint prompter__zone-hint--right" aria-hidden="true">›</div>

      <div class="prompter__command-toast" data-role="command-toast" role="status" aria-live="polite"></div>

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

const ICON_CHEVRON_UP = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="m6 15 6-6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const ICON_CHEVRON_DOWN = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
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
