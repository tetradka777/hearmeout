'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { cachedJson, invalidateJson, peekJson, storeJson, useCachedJson } from '@/lib/cachedJson';
import type { SwapSide, SwapView } from '@/lib/albumSwaps';
import type { Device } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { MusicAlbumPicker } from '../ui/MusicAlbumPicker';

type Draft = { albumId: string; note: string; receivedAlbumId: string; score: string; reaction: string };
type SwapList = { swaps: SwapView[] };

function Gift({ side, label }: { side: SwapSide; label: string }) {
  const { t, openAlbum } = useApp();
  return <section className="tile t-paper swap37-gift">
    <small>{label}</small>
    <h2>{side.user.name ?? side.user.handle ?? t('swap.friend')}</h2>
    {side.album ? <button type="button" className="swap37-album" onClick={() => openAlbum(side.album!.albumId)}>
      <CoverArt url={side.album.cover} fallbackLetter={side.album.title[0] ?? '?'} className="cov" px={160} />
      <span><b>{side.album.title}</b><small>{side.album.artist}</small></span>
    </button> : <p className="muted">{t('swap.waitingPick')}</p>}
    {side.note && <p className="swap37-note">{side.note}</p>}
  </section>;
}

export function AlbumSwapScreen({ device }: { device: Device }) {
  const { state, me, t, goBack, openSwap } = useApp();
  const visible = state.activeScreen === 'swap';
  const id = state.currentSwapId;
  const friendId = state.swapFriendId;
  const singleUrl = id ? `/api/album-swaps?id=${encodeURIComponent(id)}` : null;
  const list = useCachedJson<SwapList>(visible && me && !id ? '/api/album-swaps' : null);
  const single = useCachedJson<{ swap: SwapView }>(visible && me ? singleUrl : null);
  // Drafts are account- and target-specific and survive hidden-screen navigation.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyKey, setBusyKey] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmKey, setConfirmKey] = useState('');
  const selection = useRef({ account: me?.id, target: `${id || friendId}`, visible });
  const lifecycle = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = lifecycle.current;
    mounted.active = true;
    return () => { mounted.active = false; };
  }, []);
  // Update before asynchronous responses can observe a newly committed account/target.
  useLayoutEffect(() => { selection.current = { account: me?.id, target: `${id || friendId}`, visible }; }, [me?.id, id, friendId, visible]);
  if (!visible) return null;

  const loaded = id ? single.data?.swap.id === id : list.data !== null;
  const failed = id ? single.failed : list.failed;
  const rawSwap = id ? single.data?.swap : list.data?.swaps.find(item => item.friend.user.id === friendId && !item.completedAt && !item.cancelledAt);
  const swap = rawSwap?.me.user.id === me?.id ? rawSwap : undefined;
  const friend = me?.friends.find(item => item.id === (swap?.friend.user.id ?? friendId));
  const key = `${me?.id ?? ''}:${id || friendId}`;
  const receivedAlbumId = swap?.friend.album?.albumId ?? '';
  const defaultDraft: Draft = { albumId: swap?.me.album?.albumId ?? '', note: swap?.me.note ?? '', receivedAlbumId, score: swap?.me.score == null ? '' : String(swap.me.score), reaction: swap?.me.reaction ?? '' };
  const storedDraft = drafts[key] ?? defaultDraft;
  const albumChanged = storedDraft.receivedAlbumId !== receivedAlbumId;
  // Keep the old reaction in its original draft, but never reuse it for a new gift.
  // Entering a new score/reaction explicitly starts a draft for the displayed album.
  const draft = albumChanged ? { ...storedDraft, score: '', reaction: '' } : storedDraft;
  const change = (value: Partial<Draft>) => setDrafts(previous => {
    const previousDraft = previous[key] ?? defaultDraft;
    const editingOutcome = 'score' in value || 'reaction' in value;
    const base = editingOutcome && previousDraft.receivedAlbumId !== receivedAlbumId
      ? { ...previousDraft, receivedAlbumId, score: '', reaction: '' } : previousDraft;
    return { ...previous, [key]: { ...base, ...value } };
  });
  const busy = busyKey === key;
  const closed = Boolean(swap?.completedAt || swap?.cancelledAt);
  const canPick = !closed && !swap?.me.finishedAt && !swap?.friend.finishedAt;
  const unsavedGift = Boolean(swap && canPick && (draft.albumId !== swap.me.album?.albumId || draft.note !== swap.me.note));
  const canFinish = Boolean(swap?.me.album && swap.friend.album && !closed && !swap.me.finishedAt);
  const name = swap?.friend.user.name ?? friend?.name ?? swap?.friend.user.handle ?? t('swap.friend');
  const history = (list.data?.swaps ?? []).filter(item => item.me.user.id === me?.id && item.friend.user.id === friendId && (item.completedAt || item.cancelledAt));

  async function mutate(action: 'create' | 'pick' | 'finish' | 'cancel') {
    if (busy) return;
    if (action === 'finish' && (albumChanged || !draft.score || !draft.receivedAlbumId)) return;
    const accountId = me?.id;
    setBusyKey(key);
    setErrors(previous => ({ ...previous, [key]: '' }));
    try {
      const payload = action === 'create' ? { friendId, albumId: draft.albumId, note: draft.note }
        : action === 'pick' ? { id: swap?.id, action, albumId: draft.albumId, note: draft.note }
          : action === 'finish' ? { id: swap?.id, action, score: Number(draft.score), reaction: draft.reaction, expectedReceivedAlbumId: draft.receivedAlbumId }
            : { id: swap?.id, action };
      const response = await fetch('/api/album-swaps', { method: action === 'create' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!lifecycle.current.active || selection.current.account !== accountId) return;
      const body = await response.json().catch(() => null) as { swap?: SwapView; error?: string } | null;
      if (!lifecycle.current.active || selection.current.account !== accountId) return;
      if (!response.ok && body?.error === 'album_changed') {
        setErrors(previous => ({ ...previous, [key]: t('swap.albumChanged') }));
        if (swap) void cachedJson(`/api/album-swaps?id=${encodeURIComponent(swap.id)}`, { force: true });
        void cachedJson('/api/album-swaps', { force: true });
        return;
      }
      if (!response.ok || !body?.swap || body.swap.me.user.id !== accountId) throw new Error('request_failed');
      const updated = body.swap;
      invalidateJson('/api/album-swaps');
      storeJson(`/api/album-swaps?id=${encodeURIComponent(updated.id)}`, { swap: updated });
      const previous = peekJson<SwapList>('/api/album-swaps');
      storeJson('/api/album-swaps', { swaps: [updated, ...(previous?.swaps ?? []).filter(item => item.id !== updated.id)] });
      void cachedJson('/api/album-swaps', { force: true });
      setDrafts(previousDrafts => {
        const next = { ...previousDrafts };
        if (action === 'pick' && next[key]) next[key] = { ...next[key], albumId: updated.me.album?.albumId ?? '', note: updated.me.note };
        else delete next[key];
        return next;
      });
      setConfirmKey('');
      if (action === 'create' && selection.current.visible && selection.current.target === (id || friendId)) openSwap(updated.friend.user.id, updated.id);
    } catch {
      if (lifecycle.current.active && selection.current.account === accountId) setErrors(previous => ({ ...previous, [key]: t('swap.saveError') }));
    } finally {
      if (lifecycle.current.active && selection.current.account === accountId) setBusyKey(current => current === key ? '' : current);
    }
  }

  return <div className={`screen swap37 ${device}`}>
    <button type="button" className="btn swap37-back" onClick={() => goBack('match')}>{t('swap.back')}</button>
    <header className="swap37-header"><h1>{t('swap.title')}</h1><p>{t('swap.withFriend', { name })}</p></header>
    {me && <button type="button" className="btn" disabled={busy} onClick={() => { if (singleUrl) void cachedJson(singleUrl, { force: true }); void cachedJson('/api/album-swaps', { force: true }); }}>{t('swap.refresh')}</button>}
    {!me ? <p>{t('swap.signIn')}</p> : failed && !loaded ? <div role="alert" className="tile t-paper swap37-message"><p>{t('swap.loadError')}</p><button type="button" className="btn" onClick={() => { void (id ? single.reload() : list.reload()); }}>{t('swap.retry')}</button></div>
      : !loaded ? <p role="status">{t('swap.loading')}</p>
        : id && !swap ? <p>{t('swap.loadError')}</p>
          : !swap && !friend ? <p>{t('swap.chooseFriend')}</p>
            : <>
              <p className="swap37-intro">{t('swap.blindHint')}</p>
              {swap && <>
                <div className="swap37-gifts"><Gift side={swap.me} label={t('swap.youGive')} /><Gift side={swap.friend} label={t('swap.youReceive')} /></div>
                <p role="status" className="swap37-status">{t(swap.cancelledAt ? 'swap.cancelled' : swap.completedAt ? 'swap.completed' : swap.me.finishedAt ? 'swap.waitingFriend' : swap.friend.finishedAt ? 'swap.friendFinished' : 'swap.activeHint')}</p>
              </>}
              {canPick && <form className="tile t-paper swap37-form" onSubmit={event => { event.preventDefault(); void mutate(swap ? 'pick' : 'create'); }}>
                <h2>{t(swap ? 'swap.changeGift' : 'swap.chooseGift')}</h2>
                <MusicAlbumPicker value={draft.albumId} onChange={albumId => change({ albumId })} disabled={busy} />
                <label><span>{t('swap.note')}</span><textarea maxLength={500} rows={3} value={draft.note} disabled={busy} onChange={event => change({ note: event.target.value })} /></label>
                <small>{draft.note.length}/500</small>
                <button type="submit" className="btn primary" disabled={busy || !draft.albumId}>{t(busy ? 'swap.saving' : swap ? 'swap.saveGift' : 'swap.send')}</button>
              </form>}
              {canFinish && <form className="tile t-paper swap37-form" onSubmit={event => { event.preventDefault(); void mutate('finish'); }}>
                <h2>{t('swap.finishTitle')}</h2><p>{t('swap.receivedOnly', { album: swap!.friend.album!.title })}</p>
                {albumChanged && <p role="alert" className="swap37-error">{t('swap.albumChanged')}</p>}
                <label><span>{t('swap.score')}</span><input type="number" min="0.1" max="5" step="0.1" required value={draft.score} disabled={busy} onChange={event => change({ score: event.target.value })} /></label>
                <label><span>{t('swap.reaction')}</span><textarea maxLength={2000} rows={4} value={draft.reaction} disabled={busy} onChange={event => change({ reaction: event.target.value })} /></label>
                <small>{draft.reaction.length}/2000</small>
                {unsavedGift && <p className="muted">{t('swap.saveGiftFirst')}</p>}
                <button type="submit" className="btn primary" disabled={busy || unsavedGift || albumChanged || !draft.score}>{t(busy ? 'swap.saving' : 'swap.finish')}</button>
              </form>}
              {swap?.me.finishedAt && <section className="tile t-paper swap37-results"><h2>{t('swap.yourResult')}</h2><p>{swap.friend.album?.title}</p><b>{swap.me.score?.toFixed(1)} / 5</b>{swap.me.reaction && <p className="swap37-note">{swap.me.reaction}</p>}</section>}
              {swap?.canReveal && <section className="tile t-paper swap37-results"><h2>{t('swap.friendResult', { name })}</h2><p>{swap.me.album?.title}</p><b>{swap.friend.score?.toFixed(1)} / 5</b>{swap.friend.reaction && <p className="swap37-note">{swap.friend.reaction}</p>}</section>}
              {swap && !swap.canReveal && !swap.cancelledAt && <p className="swap37-blind">{t('swap.resultsHidden')}</p>}
              {errors[key] && <p role="alert" className="swap37-error">{errors[key]}</p>}
              {swap && !closed && (confirmKey === key ? <div className="tile t-paper swap37-confirm"><p>{t('swap.cancelConfirm')}</p><button type="button" className="btn" disabled={busy} onClick={() => { void mutate('cancel'); }}>{t('swap.confirmCancel')}</button><button type="button" className="btn" disabled={busy} onClick={() => setConfirmKey('')}>{t('swap.keep')}</button></div> : <button type="button" className="btn" disabled={busy} onClick={() => setConfirmKey(key)}>{t('swap.cancel')}</button>)}
              {history.length > 0 && <section className="swap37-history"><h2>{t('swap.history')}</h2>{history.map(item => <button type="button" className="tile t-paper swap37-history-item" key={item.id} onClick={() => openSwap(item.friend.user.id, item.id)}><span>{item.me.album?.title} / {item.friend.album?.title ?? t('swap.waitingPick')}</span><small>{t(item.cancelledAt ? 'swap.cancelled' : 'swap.completed')}</small></button>)}</section>}
            </>}
  </div>;
}
