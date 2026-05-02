export function isSpeechSupported() {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
}

export function createRecognition({ lang = 'ru-RU' } = {}) {
  const Ctor =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) throw new Error('SpeechRecognition не поддерживается');

  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = lang;
  rec.maxAlternatives = 1;
  return rec;
}
