export function tokenize(text) {
  if (!text) return [];
  return (
    String(text)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export function wordsMatch(a, b) {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 3) return false;
  const tolerance = Math.max(1, Math.floor(minLen / 4));
  return levenshtein(a, b) <= tolerance;
}

export function scoreAlignment(scriptTokens, recognizedBuffer, hypothesizedEnd) {
  if (recognizedBuffer.length === 0) return 0;
  let matches = 0;
  for (let i = 0; i < recognizedBuffer.length; i++) {
    const scriptIdx = hypothesizedEnd - recognizedBuffer.length + 1 + i;
    if (scriptIdx < 0 || scriptIdx >= scriptTokens.length) continue;
    if (wordsMatch(recognizedBuffer[i], scriptTokens[scriptIdx])) {
      matches++;
    }
  }
  return matches / recognizedBuffer.length;
}

// Внутренняя версия: дополнительно считает количество УНИКАЛЬНЫХ совпавших
// слов из буфера. Это нужно для backward-прыжков, где «4 раза слово "и"» —
// плохой сигнал, а «4 разных слова подряд» — уверенное совпадение.
function alignmentDetail(scriptTokens, recognizedBuffer, hypothesizedEnd) {
  if (recognizedBuffer.length === 0) return { score: 0, unique: 0 };
  let matches = 0;
  const uniqueWords = new Set();
  for (let i = 0; i < recognizedBuffer.length; i++) {
    const scriptIdx = hypothesizedEnd - recognizedBuffer.length + 1 + i;
    if (scriptIdx < 0 || scriptIdx >= scriptTokens.length) continue;
    if (wordsMatch(recognizedBuffer[i], scriptTokens[scriptIdx])) {
      matches++;
      uniqueWords.add(recognizedBuffer[i]);
    }
  }
  return {
    score: matches / recognizedBuffer.length,
    unique: uniqueWords.size,
  };
}

// Ищет лучшую позицию конца буфера в полуоткрытом диапазоне [startIdx, endIdx).
// Возвращает { pos, score, unique }.
export function findBestPositionInRange(
  scriptTokens,
  recognizedBuffer,
  startIdx,
  endIdx,
) {
  const start = Math.max(0, startIdx);
  const end = Math.min(endIdx, scriptTokens.length);
  if (
    recognizedBuffer.length === 0 ||
    scriptTokens.length === 0 ||
    start >= end
  ) {
    return { pos: start, score: 0, unique: 0 };
  }
  let bestPos = start;
  let bestScore = 0;
  let bestUnique = 0;
  for (let p = start; p < end; p++) {
    const { score, unique } = alignmentDetail(scriptTokens, recognizedBuffer, p);
    if (score > bestScore) {
      bestScore = score;
      bestPos = p;
      bestUnique = unique;
    }
  }
  return { pos: bestPos, score: bestScore, unique: bestUnique };
}

export function findBestPosition(
  scriptTokens,
  recognizedBuffer,
  cursor,
  lookahead,
) {
  return findBestPositionInRange(
    scriptTokens,
    recognizedBuffer,
    cursor,
    cursor + lookahead,
  );
}
