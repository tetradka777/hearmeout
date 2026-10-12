'use client';

import { useApp } from '@/lib/AppContext';
import type { TranslationKey } from '@/lib/i18n';

// Award cards (prototype rev 9c): a glyph, the award, one line on what it
// means, and earned or not yet (dashed and grey). Locked cards are for
// your own profile only.
export const AWARDS = ['awardMostActive', 'awardNightOwl', 'awardHarshestCritic', 'awardGenreExplorer', 'awardStreak', 'awardScout', 'awardStuck', 'awardTimeTraveler'] as const;

export const AWARD_ICON: Record<string, string> = {
  awardMostActive: 'bolt', awardNightOwl: 'moon', awardHarshestCritic: 'lens', awardGenreExplorer: 'compass',
  awardStreak: 'flame', awardScout: 'target', awardStuck: 'repeat', awardTimeTraveler: 'clock',
};

export function AwardGallery({ earned, showLocked }: { earned: string[]; showLocked?: boolean }) {
  const { t } = useApp();
  const locked = showLocked ? AWARDS.filter((a) => !earned.includes(a)) : [];
  const card = (label: string, on: boolean) => (
    <div className={`awc9${on ? '' : ' off'}`} key={label}>
      <span className="gl9" aria-hidden="true"><i className={`ic ic-${AWARD_ICON[label] ?? 'star'}`} /></span>
      <b>{t(`groups.${label}` as TranslationKey)}</b>
      <small>{t(`groups.${label}Desc` as TranslationKey)}</small>
      <span className={`tag${on ? ' on9' : ''}`}>{on ? t('awards.earned') : t('awards.locked')}</span>
    </div>
  );
  return <div className="awg9 big">{earned.map((a) => card(a, true))}{locked.map((a) => card(a, false))}</div>;
}
