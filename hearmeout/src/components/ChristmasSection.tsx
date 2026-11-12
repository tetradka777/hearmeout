'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { christmasSeasonActive, subscribeChristmasSeason } from '@/lib/christmasSeason';

const ChristmasTracks = dynamic(() => import('./ChristmasTracks').then(m => m.ChristmasTracks));
const snapshot = () => christmasSeasonActive();
const serverSnapshot = () => false;

export function ChristmasSection() {
  const active = useSyncExternalStore(subscribeChristmasSeason, snapshot, serverSnapshot);
  // Even the catalogue/code chunk stays unloaded outside the season.
  return active ? <ChristmasTracks /> : null;
}
