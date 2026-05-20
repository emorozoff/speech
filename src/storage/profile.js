import { STORE_PROFILE, dbGet, dbPut } from './db.js';

const PROFILE_ID = 'self';
export const DEFAULT_WPM = 160;

export async function getProfile() {
  const record = await dbGet(STORE_PROFILE, PROFILE_ID);
  return record ?? null;
}

export async function saveWpm(wpm) {
  const value = Math.round(Number(wpm));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('WPM must be a positive number');
  }
  const current = (await getProfile()) ?? { id: PROFILE_ID };
  const profile = {
    ...current,
    id: PROFILE_ID,
    wpm: value,
    calibratedAt: Date.now(),
  };
  await dbPut(STORE_PROFILE, profile);
  return profile;
}

export async function getEffectiveWpm() {
  const profile = await getProfile();
  return profile?.wpm ?? DEFAULT_WPM;
}

export function estimateReadingSeconds(wordCount, wpm) {
  if (!wordCount || wordCount <= 0) return 0;
  if (!wpm || wpm <= 0) return 0;
  return (wordCount / wpm) * 60;
}

export function formatReadingTime(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total} сек`;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (sec === 0) return `${min} мин`;
  return `${min} мин ${sec} сек`;
}
