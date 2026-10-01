'use client';

import { use, useEffect, useState } from 'react';
import { userAvatarStyle } from '@/lib/format';

export const PENDING_INVITE_KEY = 'hmo_pending_invite';

type InviterInfo = { id: string; name: string; handle: string; avatarUrl: string | null };

// Plain client page, deliberately outside AppProvider/AppGate (same as
// /u/[handle]) — this is a link handed to someone who may not have an
// account or an active session yet, so it can't depend on app state.
// Wrapped in its own .rd scope for the new redesign classes.
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
    <div className="rd">
      <div className="modalbg" style={{ position: 'fixed', inset: 0 }}>
        <div className="tile t-ink modal" style={{ maxWidth: 380, width: '100%', textAlign: 'center', padding: 28 }}>
          {notFound ? (
            <p className="muted">This invite link isn&apos;t valid anymore.</p>
          ) : !inviter ? (
            <p className="muted">Loading…</p>
          ) : isSelf ? (
            <p className="muted">This is your own invite link — share it with someone else.</p>
          ) : (
            <>
              <div className="dot" style={{ width: 76, height: 76, fontSize: 28, margin: '0 auto 14px', ...userAvatarStyle(inviter) }}>{inviter.name[0]}</div>
              <p><b>{inviter.name}</b> invited you to HearMeOut</p>
              <p className="muted" style={{ marginBottom: 22 }}>Compare your music taste and see how much you agree.</p>

              {authed === false && (
                <button className="btn lg" style={{ width: '100%' }} onClick={goSignUp}>Sign up to add {inviter.name.split(' ')[0]}</button>
              )}
              {authed === true && alreadyFriends && (
                <p className="muted">You&apos;re already friends with {inviter.name.split(' ')[0]}.</p>
              )}
              {authed === true && !alreadyFriends && status !== 'done' && (
                <button className="btn lg" style={{ width: '100%' }} disabled={status === 'accepting'} onClick={accept}>
                  {status === 'accepting' ? 'Adding…' : `Add ${inviter.name.split(' ')[0]} as a friend`}
                </button>
              )}
              {status === 'done' && <p>You&apos;re friends now — open HearMeOut to see them.</p>}
              {status === 'error' && <p className="muted">Something went wrong. Try again.</p>}
            </>
          )}

          <div style={{ marginTop: 24 }}><a href="/" className="link">HearMeOut →</a></div>
        </div>
      </div>
    </div>
  );
}
