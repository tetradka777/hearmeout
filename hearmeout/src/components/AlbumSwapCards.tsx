'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import type { SwapView } from '@/lib/albumSwaps';
import { CoverArt } from './ui/CoverArt';

const active = (swap: SwapView) => !swap.completedAt && !swap.cancelledAt;

export function MatchSwapCard({ friendId }: { friendId: string }) {
  const { t, me, openSwap, state } = useApp();
  const { data } = useCachedJson<{ swaps: SwapView[] }>(me && state.activeScreen === 'match' ? '/api/album-swaps' : null);
  if (!me || !me.friends.some(friend => friend.id === friendId)) return null;
  const swap = data?.swaps.find(item => item.me.user.id === me.id && item.friend.user.id === friendId && active(item));
  return <button type="button" className="tile t-paper swap37-card" onClick={() => openSwap(friendId, swap?.id)}>
    <i className="ic ic-repeat" aria-hidden="true" />
    <span><b>{t(swap ? 'swap.continue' : 'swap.title')}</b><small>{t(swap ? 'swap.activeHint' : 'swap.inviteHint')}</small></span>
    <i className="ic ic-chev" aria-hidden="true" />
  </button>;
}

export function ActiveSwapCard() {
  const { t, me, openSwap, state } = useApp();
  const { data } = useCachedJson<{ swaps: SwapView[] }>(me && state.activeScreen === 'catalog' ? '/api/album-swaps' : null);
  const swap = data?.swaps.find(item => item.me.user.id === me?.id && active(item));
  if (!swap) return null;
  const album = swap.friend.album ?? swap.me.album;
  return <button type="button" className="tile t-paper swap37-card" onClick={() => openSwap(swap.friend.user.id, swap.id)}>
    <CoverArt url={album?.cover} fallbackLetter={album?.title[0] ?? '?'} className="cov" px={56} />
    <span><b>{t('swap.withFriend', { name: swap.friend.user.name ?? swap.friend.user.handle ?? '' })}</b><small>{t(swap.me.finishedAt ? 'swap.waitingFriend' : 'swap.activeHint')}</small></span>
    <i className="ic ic-chev" aria-hidden="true" />
  </button>;
}
