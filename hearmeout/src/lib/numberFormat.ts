import { toLocale, type Language } from './i18n';

// Scores and averages with one decimal in the interface language's style
// ("4,5" in ru/fr/es/de, "4.5" in en). The app shell sets the language once
// (AppContext); server pages pass it explicitly.
let current: Language = 'en';
const cache = new Map<Language, Intl.NumberFormat>();

export function setNumberLanguage(language: Language) {
  current = language;
}

export function fmt1(n: number, language: Language = current): string {
  let f = cache.get(language);
  if (!f) {
    f = new Intl.NumberFormat(toLocale(language), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    cache.set(language, f);
  }
  return f.format(n);
}

// Whole numbers with the language's thousands separator.
export function fmtInt(n: number, language: Language = current): string {
  return Math.round(n).toLocaleString(toLocale(language));
}
