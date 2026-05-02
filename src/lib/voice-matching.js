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

export function findBestPosition(
  scriptTokens,
  recognizedBuffer,
  cursor,
  lookahead,
) {
  if (recognizedBuffer.length === 0 || scriptTokens.length === 0) {
    return { pos: cursor, score: 0 };
  }
  const start = Math.max(0, cursor);
  const end = Math.min(cursor + lookahead, scriptTokens.length);
  let bestPos = cursor;
  let bestScore = 0;
  for (let p = start; p < end; p++) {
    const score = scoreAlignment(scriptTokens, recognizedBuffer, p);
    if (score > bestScore) {
      bestScore = score;
      bestPos = p;
    }
  }
  return { pos: bestPos, score: bestScore };
}
