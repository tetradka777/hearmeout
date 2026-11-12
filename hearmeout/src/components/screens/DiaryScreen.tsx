'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { cachedJson, invalidateJson, useCachedJson } from '@/lib/cachedJson';
import { toLocale } from '@/lib/i18n';
import type { DiaryEntry } from '@/lib/musicDiary';
import type { Device } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { MusicAlbumPicker } from '../ui/MusicAlbumPicker';

type Draft = Pick<DiaryEntry, 'albumId' | 'moment' | 'note' | 'mood' | 'listenedOn' | 'visibility'>;
type Page = { entries: DiaryEntry[]; next: number | null; total: number };
function newDraft(albumId = ''): Draft {
  const d = new Date();
  return { albumId, moment: '', note: '', mood: null, listenedOn: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, visibility: 'private' };
}

export function DiaryScreen(_props: { device: Device }) {
  const { state, me, t, goBack } = useApp();
  const shared = !!state.diaryUserId && state.diaryUserId !== me?.id;
  const [draft, setDraft] = useState<Draft>(() => newDraft(state.diaryAlbumId));
  const [baseline, setBaseline] = useState(() => JSON.stringify(newDraft(state.diaryAlbumId)));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(!!state.diaryAlbumId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const incoming = useRef(state.diaryAlbumId);
  const account = useRef(me?.id);
  const lifecycle = useRef({ active: true });
  const dirty = JSON.stringify(draft) !== baseline;

  useEffect(() => {
    const token = lifecycle.current;
    token.active = true;
    return () => { token.active = false; };
  }, []);

  function reset(next: Draft, id: string | null = null, show = true) {
    setDraft(next); setBaseline(JSON.stringify(next)); setEditingId(id); setComposing(show); setError(false);
  }
  // The mounted screen retains unsaved notes when navigating to another screen.
  // An explicit album entry point must never silently replace those notes.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (account.current !== me?.id) {
        account.current = me?.id;
        reset(newDraft(), null, false);
      }
      if (state.activeScreen !== 'diary' || shared) { incoming.current = ''; return; }
      if (incoming.current === state.diaryAlbumId) return;
      incoming.current = state.diaryAlbumId;
      if (!state.diaryAlbumId || state.diaryAlbumId === draft.albumId) return;
      if (!dirty || window.confirm(t('diary.discardConfirm'))) reset(newDraft(state.diaryAlbumId));
    });
    return () => { active = false; };
    // Only navigation/account changes may prompt; typing must never trigger a prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeScreen, state.diaryAlbumId, shared, me?.id]);

  async function save(): Promise<boolean> {
    if (busy || shared || !draft.albumId || !draft.moment.trim()) return false;
    const savingAccount = me?.id;
    const currentAccount = () => lifecycle.current.active && account.current === savingAccount;
    setBusy(true); setError(false);
    try {
      const res = await fetch('/api/diary', {
        method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, ...(editingId ? { id: editingId } : {}) }),
      });
      if (!currentAccount()) return false;
      if (!res.ok) { setError(true); return false; }
      invalidateJson('/api/diary');
      void cachedJson('/api/diary?summary=1', { force: true });
      reset(newDraft(), null, false); setRevision((v) => v + 1);
      return true;
    } catch { if (currentAccount()) setError(true); return false; } finally { if (currentAccount()) setBusy(false); }
  }
  function canDiscard() { return !dirty || window.confirm(t('diary.discardConfirm')); }
  if (!me) return null;
  if (shared && !me.friends.some((friend) => friend.id === state.diaryUserId)) return <div className="diary36">
    <button className="btn diary36-back" onClick={() => goBack('friend')}>{t('diary.back')}</button>
    <h1>{t('diary.title')}</h1><p role="alert">{t('diary.loadFailed')}</p>
  </div>;
  return (
    <div className="diary36">
      <button className="btn diary36-back" onClick={() => goBack(shared ? 'friend' : 'profile')}>{t('diary.back')}</button>
      <header className="diary36-header">
        <span className="diary36-eyebrow">{t(shared ? 'diary.sharedTitle' : 'diary.eyebrow')}</span>
        <h1>{t('diary.title')}</h1>
        <p className="muted">{t(shared ? 'diary.sharedHint' : 'diary.subtitle')}</p>
        {!shared && !composing && <button className="btn primary" onClick={() => reset(newDraft())}>{t('diary.add')}</button>}
      </header>
      {!shared && composing && <DiaryComposer draft={draft} busy={busy} editing={!!editingId} error={error}
        onChange={(next) => setDraft(next)}
        onAlbum={(albumId) => { if (albumId !== draft.albumId && canDiscard()) reset(newDraft(albumId), editingId); }}
        onSave={save} onCancel={() => { if (!busy && canDiscard()) reset(newDraft(), null, false); }} />}
      <DiaryEntries key={`${me.id}:${shared ? state.diaryUserId : 'self'}:${revision}:${state.activeScreen === 'diary'}`} userId={shared ? state.diaryUserId : undefined}
        isCurrentAccount={() => lifecycle.current.active && account.current === me.id}
        busy={busy || (!!editingId && composing)} onDeleted={() => {
          setRevision((v) => v + 1);
        }} onEdit={(entry) => {
          if (busy || !canDiscard()) return;
          reset({ albumId: entry.albumId, moment: entry.moment, note: entry.note, mood: entry.mood, listenedOn: entry.listenedOn, visibility: entry.visibility }, entry.id);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }} />
    </div>
  );
}

function DiaryComposer({ draft, busy, editing, error, onChange, onAlbum, onSave, onCancel }: {
  draft: Draft; busy: boolean; editing: boolean; error: boolean; onChange: (draft: Draft) => void;
  onAlbum: (id: string) => void; onSave: () => Promise<boolean>; onCancel: () => void;
}) {
  const { t } = useApp();
  return (
    <form className="tile t-paper diary36-compose" onSubmit={(e) => { e.preventDefault(); void onSave(); }}>
      <h2>{t(editing ? 'diary.editTitle' : 'diary.newTitle')}</h2>
      <fieldset disabled={busy}>
        <div className="diary36-field"><span>{t('diary.album')}</span><MusicAlbumPicker value={draft.albumId} onChange={onAlbum} disabled={busy} /></div>
        <label className="diary36-field"><span>{t('diary.moment')}</span><input required maxLength={120} value={draft.moment} onChange={(e) => onChange({ ...draft, moment: e.target.value })} placeholder={t('diary.momentPlaceholder')} /></label>
        <label className="diary36-field"><span>{t('diary.note')}</span><textarea maxLength={2000} rows={5} value={draft.note} onChange={(e) => onChange({ ...draft, note: e.target.value })} placeholder={t('diary.notePlaceholder')} /><small className="muted">{draft.note.length}/2000</small></label>
        <div className="diary36-fields">
          <label className="diary36-field"><span>{t('diary.date')}</span><input type="date" required value={draft.listenedOn} onChange={(e) => onChange({ ...draft, listenedOn: e.target.value })} /></label>
          <label className="diary36-field"><span>{t('diary.mood')}</span><select value={draft.mood || ''} onChange={(e) => onChange({ ...draft, mood: (e.target.value || null) as Draft['mood'] })}>
            <option value="">{t('diary.noMood')}</option><option value="calm">{t('diary.calm')}</option><option value="nostalgic">{t('diary.nostalgic')}</option><option value="energised">{t('diary.energised')}</option>
          </select></label>
          <label className="diary36-field"><span>{t('diary.visibility')}</span><select value={draft.visibility} onChange={(e) => onChange({ ...draft, visibility: e.target.value as Draft['visibility'] })}>
            <option value="private">{t('diary.private')}</option><option value="friends">{t('diary.friends')}</option>
          </select></label>
        </div>
        <p className="muted">{t(draft.visibility === 'private' ? 'diary.privateHint' : 'diary.friendsHint')}</p>
        {error && <p role="alert">{t('diary.saveFailed')}</p>}
        <div className="diary36-actions"><button className="btn primary" type="submit" disabled={!draft.albumId || !draft.moment.trim() || busy}>{t(busy ? 'diary.saving' : 'diary.save')}</button><button className="btn" type="button" onClick={onCancel}>{t('diary.cancel')}</button></div>
      </fieldset>
    </form>
  );
}

function DiaryEntries({ userId, busy, onEdit, onDeleted, isCurrentAccount }: {
  userId?: string; busy: boolean; onEdit: (entry: DiaryEntry) => void; onDeleted: () => void; isCurrentAccount: () => boolean;
}) {
  const { t, language, state, openAlbum } = useApp();
  const url = `/api/diary?from=0${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`;
  const { data, failed, reload } = useCachedJson<Page>(state.activeScreen === 'diary' ? url : null, { sensitive: !!userId });
  const [extra, setExtra] = useState<DiaryEntry[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const requestScope = useRef({ active: true });
  useEffect(() => {
    const token = requestScope.current;
    token.active = true;
    return () => { token.active = false; };
  }, []);
  const entries = data ? [...data.entries, ...extra].filter((entry, index, all) => all.findIndex((x) => x.id === entry.id) === index) : [];
  const cursor = !data ? null : next === undefined ? data.next : next;
  async function more() {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true); setPageError(false);
    const result = await cachedJson<Page>(`/api/diary?from=${cursor}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`, { sensitive: !!userId });
    if (!requestScope.current.active || !isCurrentAccount()) return;
    if (result) { setExtra((v) => [...v, ...result.entries]); setNext(result.next); } else setPageError(true);
    setLoadingMore(false);
  }
  async function remove(entry: DiaryEntry) {
    if (deleting || busy || !window.confirm(t('diary.deleteConfirm'))) return;
    setDeleting(entry.id); setDeleteError(false);
    try {
      const res = await fetch(`/api/diary?id=${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      if (!isCurrentAccount()) return;
      if (!res.ok) { setDeleteError(true); return; }
      invalidateJson('/api/diary'); void cachedJson('/api/diary?summary=1', { force: true }); onDeleted();
    } catch { if (requestScope.current.active && isCurrentAccount()) setDeleteError(true); } finally { if (requestScope.current.active && isCurrentAccount()) setDeleting(null); }
  }
  return <section className="diary36-list" aria-label={t('diary.entries')} aria-busy={!data && !failed}>
    {data && <p className="muted">{t('diary.count', { n: data.total })}</p>}
    {!data && <div className="tile t-paper diary36-empty"><p role={failed ? 'alert' : 'status'}>{t(failed ? 'diary.loadFailed' : 'diary.loading')}</p>{failed && <button className="btn" onClick={() => void reload()}>{t('diary.retry')}</button>}</div>}
    {data && !entries.length && <div className="tile t-paper diary36-empty"><h2>{t(userId ? 'diary.sharedEmpty' : 'diary.empty')}</h2><p className="muted">{t(userId ? 'diary.sharedHint' : 'diary.emptyHint')}</p></div>}
    {deleteError && <p role="alert">{t('diary.deleteFailed')}</p>}
    {entries.map((entry) => <article className="tile t-paper diary36-entry" key={entry.id}>
      <div className="diary36-entryhead"><time dateTime={entry.listenedOn}>{new Date(`${entry.listenedOn}T12:00:00`).toLocaleDateString(toLocale(language), { day: 'numeric', month: 'long', year: 'numeric' })}</time><span className="muted">{t(entry.visibility === 'private' ? 'diary.private' : 'diary.friends')}</span></div>
      <h2>{entry.moment}</h2>
      <button className="diary36-album" onClick={() => openAlbum(entry.albumId)}><CoverArt url={entry.cover ?? undefined} fallbackLetter={entry.albumTitle[0] || '?'} className="cov" style={{ width: 64, height: 64 }} /><span><b>{entry.albumTitle}</b><small className="muted">{entry.artist}</small></span></button>
      {entry.note && <p className="diary36-note">{entry.note}</p>}
      {entry.mood && <span className="tag">{t(`diary.${entry.mood}`)}</span>}
      {!userId && <div className="diary36-actions"><button className="btn" disabled={busy || !!deleting} onClick={() => onEdit(entry)}>{t('diary.edit')}</button><button className="btn" disabled={busy || !!deleting} onClick={() => void remove(entry)}>{t(deleting === entry.id ? 'diary.deleting' : 'diary.delete')}</button></div>}
    </article>)}
    {pageError && <p role="alert">{t('diary.loadFailed')}</p>}
    {cursor != null && <button className="btn" disabled={loadingMore} onClick={() => void more()}>{t(loadingMore ? 'diary.loading' : pageError ? 'diary.retry' : 'diary.more')}</button>}
  </section>;
}
