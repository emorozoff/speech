export async function enterFullscreen(element) {
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    }
  } catch {
    /* fullscreen not granted; UI keeps working in plain mode */
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch {
    /* ignore */
  }
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function lockOrientation(orientation = 'landscape') {
  try {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      await screen.orientation.lock(orientation);
    }
  } catch {
    /* not supported in this browser / context, fine */
  }
}

export function unlockOrientation() {
  try {
    if (screen.orientation && typeof screen.orientation.unlock === 'function') {
      screen.orientation.unlock();
    }
  } catch {
    /* ignore */
  }
}

export async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      const lock = await navigator.wakeLock.request('screen');
      return lock;
    }
  } catch {
    /* permission denied or not supported */
  }
  return null;
}

export async function releaseWakeLock(lock) {
  if (!lock) return;
  try {
    await lock.release();
  } catch {
    /* ignore */
  }
}
