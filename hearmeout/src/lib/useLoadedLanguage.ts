import { useEffect, useState } from 'react';
import { loadLanguage, type Language } from './i18n';

// The language to translate with: `language` once its dictionary has
// loaded, English until then. Starts as English on the server and the
// client alike, so hydration matches.
export function useLoadedLanguage(language: Language): Language {
  const [loaded, setLoaded] = useState<Language>('en');
  useEffect(() => {
    let off = false;
    loadLanguage(language).then(() => { if (!off) setLoaded(language); });
    return () => { off = true; };
  }, [language]);
  return loaded === language ? language : 'en';
}
