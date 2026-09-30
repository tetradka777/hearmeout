'use client';

import { use, useEffect, useState } from 'react';
import { LogoMark } from '@/components/ui/Icons';

// The one place the "pending invite" id waits between visiting this page
// while logged out and completing signup/login back on "/" — AppContext
// checks this key once auth resolves and, if present, calls accept-invite
// itself so the friendship completes without the user doing anything extra.
export const PENDING_INVITE_KEY = 'hmo_pending_invite';

type InviterInfo = { id: string; name: string; handle: string; avatarUrl: string | null };

// Plain client page, deliberately outside AppProvider/AppGate (same as
// /u/[handle]) — this is a link handed to someone who may not have an
// account or an active session yet, so it can't depend on app state.
export default function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [alreadyFriends, setAlreadyFriends] = useState(false);
  const [status, setStatus] = useState<'idle' | 'accepting' | 'done' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/users/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/me').then((r) => (r.ok ? r.json() : null)),
    ]).then(([profile, me]) => {
      if (cancelled) return;
      if (!profile) { setNotFound(true); return; }
      setInviter({ id: profile.id, name: profile.name, handle: profile.handle, avatarUrl: profile.avatarUrl });
      setAuthed(!!me);
      if (me) {
        setIsSelf(me.id === id);
        setAlreadyFriends((me.friends || []).some((f: { id: string }) => f.id === id));
      }
    });
    return () => { cancelled = true; };
  }, [id]);

  const accept = async () => {
    setStatus('accepting');
    const res = await fetch('/api/friends/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId: id }),
    });
    setStatus(res.ok ? 'done' : 'error');
  };

  const goSignUp = () => {
    try { localStorage.setItem(PENDING_INVITE_KEY, id); } catch {}
    window.location.href = '/';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-legacy)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'center' }}><LogoMark size={44} /></div>

        {notFound ? (
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>This invite link isn&apos;t valid anymore.</p>
        ) : !inviter ? (
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading…</p>
        ) : isSelf ? (
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>This is your own invite link — share it with someone else.</p>
        ) : (
          <>
            <div
              className="avatar-lg"
              style={{ width: 76, height: 76, margin: '0 auto 14px', ...(inviter.avatarUrl ? { backgroundImage: `url('${inviter.avatarUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}) }}
            />
            <p style={{ fontSize: 15, marginBottom: 4 }}><strong>{inviter.name}</strong> invited you to HearMeOut</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 22 }}>Compare your music taste and see how much you agree.</p>

            {authed === false && (
              <button className="btn-primary" style={{ width: '100%' }} onClick={goSignUp}>Sign up to add {inviter.name.split(' ')[0]}</button>
            )}
            {authed === true && alreadyFriends && (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>You&apos;re already friends with {inviter.name.split(' ')[0]}.</p>
            )}
            {authed === true && !alreadyFriends && status !== 'done' && (
              <button className="btn-primary" style={{ width: '100%' }} disabled={status === 'accepting'} onClick={accept}>
                {status === 'accepting' ? 'Adding…' : `Add ${inviter.name.split(' ')[0]} as a friend`}
              </button>
            )}
            {status === 'done' && <p style={{ fontSize: 13, color: 'var(--lime)' }}>You&apos;re friends now — open HearMeOut to see them.</p>}
            {status === 'error' && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Something went wrong. Try again.</p>}
          </>
        )}

        <div style={{ marginTop: 30 }}>
          <a href="/" style={{ color: 'var(--lime)', fontSize: 13, fontFamily: 'var(--font-ibm-plex-mono),monospace' }}>HearMeOut →</a>
        </div>
      </div>
    </div>
  );
}
