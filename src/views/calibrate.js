import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';
import { VoiceFollower } from '../lib/voice-follower.js';
import { isSpeechSupported } from '../lib/recognition.js';
import { getProfile, saveWpm } from '../storage/profile.js';
import { tokenize } from '../lib/voice-matching.js';
import { acquireWakeLock, releaseWakeLock } from '../lib/screen.js';

const CALIBRATION_TEXT =
  `Привет. Это калибровка скорости речи. Прочитайте этот текст вслух в своём обычном темпе. ` +
  `Говорите так, как если бы вы записывали видео для своего блога. Не торопитесь и не замедляйтесь специально, ` +
  `это испортит результат. Просто читайте как обычно, без особых усилий. ` +
  `Калибровка нужна для того, чтобы приложение могло точно посчитать сколько времени займёт ` +
  `чтение любого вашего скрипта. После того как закончите читать последнее предложение, ` +
  `ничего нажимать не надо — суфлёр сам поймёт что вы дочитали. ` +
  `Если возникнут сложности, можно нажать кнопку готово ниже.`;

const TOTAL_WORDS = tokenize(CALIBRATION_TEXT).length;

export async function renderCalibrate(root) {
  const profile = await getProfile();

  let voice = null;
  let wakeLock = null;
  let startTime = 0;
  let currentWordIdx = 0;
  let measuredWpm = 0;
  let cleaned = false;

  root.innerHTML = renderTemplate(profile);
  const section = root.firstElementChild;
  const textEl = section.querySelector('[data-role="text"]');
  const wpmReadout = section.querySelector('[data-result="wpm"]');
  const progressEl = section.querySelector('[data-role="progress"]');
  const wordElements = textEl.querySelectorAll('.calibrate__word');

  let currentWordEl = null;

  function setCurrentWord(idx) {
    if (currentWordEl) currentWordEl.classList.remove('calibrate__word--current');
    if (idx >= 0 && wordElements[idx]) {
      wordElements[idx].classList.add('calibrate__word--current');
      currentWordEl = wordElements[idx];
      // плавный скролл к слову, чтобы оно было в видимой части
      currentWordEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function setProgress(idx) {
    if (!progressEl) return;
    const pct = Math.min(100, Math.round((idx / TOTAL_WORDS) * 100));
    progressEl.style.width = `${pct}%`;
  }

  const start = async () => {
    if (!isSpeechSupported()) {
      window.alert('Распознавание речи не поддерживается этим браузером');
      return;
    }
    section.classList.remove('calibrate--ready');
    section.classList.add('calibrate--recording');
    wakeLock = await acquireWakeLock();
    startTime = Date.now();
    currentWordIdx = 0;

    voice = new VoiceFollower({
      scriptBody: CALIBRATION_TEXT,
      onPosition: (idx) => {
        currentWordIdx = idx;
        setCurrentWord(idx);
        setProgress(idx + 1);
        if (idx >= TOTAL_WORDS - 2) {
          // дошёл до конца — завершаем через короткую паузу,
          // чтобы пользователь успел сказать последнее слово
          setTimeout(finish, 700);
        }
      },
      onError: (msg) => {
        window.alert(`Не удалось запустить микрофон: ${msg}`);
        cancel();
      },
    });
    voice.start();
  };

  const finish = async () => {
    if (!section.classList.contains('calibrate--recording')) return;
    const elapsedSec = (Date.now() - startTime) / 1000;
    if (elapsedSec < 3 || currentWordIdx < 5) {
      window.alert('Слишком мало данных для калибровки. Попробуйте ещё раз.');
      cancel();
      return;
    }
    measuredWpm = Math.round((currentWordIdx / elapsedSec) * 60);
    if (wpmReadout) wpmReadout.textContent = String(measuredWpm);

    await stopVoice();

    section.classList.remove('calibrate--recording');
    section.classList.add('calibrate--done');
  };

  const cancel = async () => {
    await stopVoice();
    section.classList.remove('calibrate--recording');
    section.classList.add('calibrate--ready');
    setCurrentWord(-1);
    setProgress(0);
  };

  const stopVoice = async () => {
    if (voice) {
      voice.stop();
      voice = null;
    }
    if (wakeLock) {
      await releaseWakeLock(wakeLock);
      wakeLock = null;
    }
  };

  const save = async () => {
    if (!measuredWpm) return;
    await saveWpm(measuredWpm);
    navigate('/');
  };

  const retry = () => {
    section.classList.remove('calibrate--done');
    section.classList.add('calibrate--ready');
    measuredWpm = 0;
    currentWordIdx = 0;
    if (wpmReadout) wpmReadout.textContent = '—';
    setCurrentWord(-1);
    setProgress(0);
  };

  const back = async () => {
    if (cleaned) return;
    cleaned = true;
    await stopVoice();
    navigate('/');
  };

  section.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'start') await start();
    else if (action === 'finish') await finish();
    else if (action === 'cancel') await cancel();
    else if (action === 'save') await save();
    else if (action === 'retry') retry();
    else if (action === 'back') await back();
  });

  // hashchange навигация — чистим если пользователь нажал назад в браузере
  window.addEventListener(
    'hashchange',
    () => {
      stopVoice();
    },
    { once: true },
  );
}

function renderTemplate(profile) {
  return `
    <section class="calibrate calibrate--ready">
      <header class="topbar">
        <button class="topbar__back" data-action="back" aria-label="назад">
          ${ICON_BACK}
        </button>
        <h1 class="topbar__title">калибровка</h1>
        <span class="topbar__spacer"></span>
      </header>

      <main class="calibrate__body">
        <div class="calibrate__intro">
          <span class="calibrate__icon">${ICON_MIC_LARGE}</span>
          <h2 class="calibrate__heading">узнаем вашу скорость речи</h2>
          <p class="calibrate__instruction">
            прочитайте короткий текст вслух в обычном темпе, как для камеры.
            результат используется чтобы показывать ожидаемое время чтения каждого скрипта.
          </p>
          ${
            profile
              ? `<p class="calibrate__current">сейчас сохранено: <strong>${profile.wpm} wpm</strong></p>`
              : '<p class="calibrate__current">пока не откалибровано · используется средняя скорость 160 wpm</p>'
          }
          <button class="button button--primary calibrate__start-button" data-action="start">
            начать
          </button>
        </div>

        <div class="calibrate__reading">
          <div class="calibrate__progress-track">
            <div class="calibrate__progress-bar" data-role="progress"></div>
          </div>
          <div class="calibrate__text" data-role="text">
            ${renderTextWithWords(CALIBRATION_TEXT)}
          </div>
          <div class="calibrate__reading-actions">
            <button class="button button--ghost" data-action="cancel">отмена</button>
            <button class="button button--primary" data-action="finish">готово</button>
          </div>
        </div>

        <div class="calibrate__result">
          <p class="calibrate__result-label">ваша скорость</p>
          <p class="calibrate__result-value">
            <strong data-result="wpm">—</strong>
            <span class="calibrate__result-unit">wpm</span>
          </p>
          <p class="calibrate__result-hint">
            это значение будет использоваться для расчёта времени чтения каждого скрипта.
          </p>
          <div class="calibrate__result-actions">
            <button class="button button--ghost" data-action="retry">заново</button>
            <button class="button button--primary" data-action="save">сохранить</button>
          </div>
        </div>
      </main>
    </section>
  `;
}

function renderTextWithWords(body) {
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
      `<span class="calibrate__word" data-i="${i}">${escapeHtml(m[0])}</span>`,
    );
    i++;
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    out.push(escapeHtml(body.slice(last)));
  }
  return out.join('');
}

const ICON_BACK = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path d="M14.5 18 8 12l6.5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const ICON_MIC_LARGE = `
  <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
    <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;
