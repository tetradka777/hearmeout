'use client';

import { useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';

// importHtml(): three steps, a file button, and a report after the upload.
export function ImportTile() {
  const { t, importStreamingHistory } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ files: number; imported: number; skipped: number; errors: string[] } | null>(null);
  const onFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true);
    setReport(null);
    const res = await importStreamingHistory(files);
    setBusy(false);
    if (res) setReport({ files: files.length, imported: res.imported, skipped: res.skipped, errors: res.errors || [] });
    if (inputRef.current) inputRef.current.value = '';
  };
  return (
    <div className="tile t-soft2 imp">
      <h3>{t('profile.importTitle')}</h3>
      <p className="muted" style={{ fontWeight: 600, marginTop: 4 }}>{t('settings.importLead')}</p>
      <ol>
        <li>{t('settings.importStep1')}</li>
        <li>{t('settings.importStep2')}</li>
        <li>{t('settings.importStep3Pre')} <b>Streaming_History_Audio_*.json</b> {t('settings.importStep3Post')}</li>
      </ol>
      <label className="btn" htmlFor="impfile" tabIndex={0} role="button" aria-disabled={busy}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}>
        {busy ? t('profile.importUploading') : t('settings.importChoose')}
      </label>
      <input ref={inputRef} type="file" id="impfile" accept=".json,application/json" multiple hidden onChange={(e) => onFiles(Array.from(e.target.files || []))} />
      {report && (
        <div className="rep" role="status">
          <b>{t('settings.importFinished')}</b><br />
          {t('settings.importReport', { files: report.files, plays: report.imported.toLocaleString(), skipped: report.skipped })}
          {report.errors.length > 0 && <><br /><span className="ferr" style={{ display: 'inline' }}>{t('settings.importErrors', { list: report.errors.join(', ') })}</span></>}
        </div>
      )}
    </div>
  );
}

// connRows(ob): Spotify / Apple Music (soon) / Last.fm (soon), each with a
// coloured letter badge, a status line and its buttons. In onboarding
// (`onboarding`) a connected account shows no Sync / Disconnect.
export function ConnectionRows({ onboarding = false }: { onboarding?: boolean }) {
  const { t, me, syncSpotify, onSpotifyConnected, showToast } = useApp();
  if (!me) return null;
  const disconnect = async () => {
    const res = await fetch('/api/auth/spotify', { method: 'DELETE' });
    if (!res.ok) { showToast(t('settings.disconnectFailed')); return; }
    await onSpotifyConnected();
    showToast(t('settings.disconnected'));
  };
  const rows: { id: string; letter: string; name: string; color: string; soon: boolean }[] = [
    { id: 'spotify', letter: 'S', name: 'Spotify', color: '#1DB954', soon: false },
    { id: 'apple', letter: 'A', name: 'Apple Music', color: '#FA243C', soon: true },
    { id: 'lastfm', letter: 'L', name: 'Last.fm', color: '#D51007', soon: true },
  ];
  return (
    <>
      {rows.map((c) => {
        const on = c.id === 'spotify' && me.connections.spotify;
        return (
          <div className="conn" key={c.id}>
            <span className="lg" style={{ background: c.color, color: '#fff', opacity: c.soon ? 0.55 : 1 }}>{c.letter}</span>
            <div className="g"><b>{c.name}</b><br /><small className="muted" style={{ fontWeight: 600 }}>{c.soon ? t('settings.comingSoon') : on ? t('settings.connected') : t('settings.notConnected')}</small></div>
            {c.soon ? <button className="btn ghost" disabled>{t('settings.soon')}</button>
              : on ? (onboarding ? null : <><button className="btn ghost" onClick={() => syncSpotify()}>{t('profile.syncNow')}</button><button className="btn ghost" onClick={disconnect}>{t('settings.disconnect')}</button></>)
              : <a className="btn" href="/api/auth/spotify">{t('settings.connect')}</a>}
          </div>
        );
      })}
    </>
  );
}
