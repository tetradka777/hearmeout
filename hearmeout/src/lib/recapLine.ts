import type { RecapData } from './types';
import { pluralForKey, type Language, type TranslationKey } from './i18n';

// "{n} plays, mostly <em>Rock.</em>" — the recap's generated one-liner
// (story card, vibe pill, friends' recaps, the Home and Stats recap
// tiles), split so the last words can be emphasised (spec 3.12).
export function recapLine(
  r: RecapData,
  language: Language,
  t: (k: TranslationKey, v?: Record<string, string | number>) => string,
): { lead: string; em: string } {
  if (!r.trackCount) return { lead: t('recap.vibeEmpty'), em: '' };
  const plays = `${r.trackCount} ${pluralForKey(language, r.trackCount, 'recap.trackOne', 'recap.trackFew', 'recap.trackMany')}`;
  const genre = r.topGenres[0]?.genre;
  return genre ? { lead: t('recap.storyLead', { plays }), em: `${genre}.` } : { lead: `${plays}.`, em: '' };
}
