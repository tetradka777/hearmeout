'use client';

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination --
   This page lives outside AppProvider; links into the app ("/", "/?auth=…")
   must be full page loads so the app shell boots fresh (RegisterModal reads
   ?auth= at module load, before the first history entry rewrites "/"). */
import { useEffect, useState } from 'react';
import { userAvatarStyle } from '@/lib/format';
import { translate, type Language, type TranslationKey } from '@/lib/i18n';
import { isDemoAccountId } from '@/lib/demoAccounts';
import { PENDING_INVITE_KEY, PENDING_INVITE_NAME_KEY } from '@/lib/pendingInvite';

export type InviterInfo = { id: string; name: string; handle: string; avatarUrl: string | null };
type Relation = 'self' | 'demo' | 'friend' | 'out' | 'in' | 'none';

// Plain client page, deliberately outside AppProvider/AppGate (same as
// /u/[handle]) — this is a link handed to someone who may not have an
// account or an active session yet, so it can't depend on app state.
// vInvite() in reference/app.js: one centred ink card. Adding sends a
// normal friend request that stays pending until the inviter accepts
// (spec 13.x), not an instant friendship.
// The server page (page.tsx) resolves the inviter and the visitor's language
// up front, so the card and the <title> are there in the first HTML.
export default function InviteClient({ id, initialInviter, initialLanguage }: { id: string; initialInviter: InviterInfo | null; initialLanguage: Language }) {
  const [inviter, setInviter] = useState<InviterInfo | null>(initialInviter);
  // `id` from the URL may be an invite code; API calls need the account id.
  const userId = initialInviter?.id ?? id;
  const [notFound, setNotFound] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [relation, setRelation] = useState<Relation>('none');
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');

  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(language, key, vars);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/users/${userId}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/me').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/friends/requests').then((r) => (r.ok ? r.json() : null)),
    ]).then(([profile, me, requests]) => {
      if (cancelled) return;
      // Signed-out visitors can't read /api/users; the server already
      // resolved the inviter for them.
      if (profile) setInviter({ id: profile.id, name: profile.name, handle: profile.handle, avatarUrl: profile.avatarUrl });
      else if (!initialInviter) { setNotFound(true); return; }
      setAuthed(!!me);
      if (!me) return;
      if (me.language) setLanguage(me.language);
      const hasId = (list: { user: { id: string } }[] | undefined) => (list || []).some((r) => r.user.id === userId);
      setRelation(
        me.id === userId ? 'self'
          : isDemoAccountId(userId) ? 'demo'
          : (me.friends || []).some((f: { id: string }) => f.id === userId) ? 'friend'
          : hasId(requests?.outgoing) ? 'out'
          : hasId(requests?.incoming) ? 'in'
          : 'none',
      );
    });
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    setStatus('sending');
    const res = await fetch('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (data?.error === 'already_friends') { setRelation('friend'); setStatus('idle'); return; }
      setStatus('error');
      return;
    }
    setRelation(data?.status === 'accepted' ? 'friend' : 'out');
    setStatus('idle');
  };

  const goAuth = (mode: 'register' | 'login') => {
    if (!inviter) return;
    try {
      localStorage.setItem(PENDING_INVITE_KEY, userId);
      localStorage.setItem(PENDING_INVITE_NAME_KEY, inviter.name.split(' ')[0]);
    } catch { /* storage unavailable: the visitor can still add them later */ }
    window.location.href = `/?auth=${mode}`;
  };

  const host = typeof window !== 'undefined' ? window.location.host : 'hearmeout.art';

  let body;
  if (notFound) {
    body = <p className="muted" style={{ fontWeight: 600 }}>{t('invite.invalid')}</p>;
  } else if (!inviter) {
    body = <p className="muted" style={{ fontWeight: 600 }}>{t('invite.loading')}</p>;
  } else {
    const first = inviter.name.split(' ')[0];
    let cta;
    if (relation === 'self') cta = <p className="muted" style={{ fontWeight: 600 }}>{t('invite.self')}</p>;
    else if (authed === false) cta = (
      <>
        <button className="btn lg" onClick={() => goAuth('register')}>{t('pub.signUpToAdd', { name: first })}</button>
        <button className="btn ghost lg" onClick={() => goAuth('login')}>{t('invite.haveAccount')}</button>
      </>
    );
    else if (relation === 'demo') cta = <p className="muted" style={{ fontWeight: 600 }}>{t('invite.demo')}</p>;
    else if (relation === 'friend') cta = <span className="tag">{t('invite.alreadyFriends')}</span>;
    else if (relation === 'out') cta = <span className="tag">{t('invite.requestSent')}</span>;
    else if (authed) cta = (
      <button className="btn lg" disabled={status === 'sending'} onClick={add}>
        {status === 'sending' ? t('invite.adding') : t('invite.add', { name: first })}
      </button>
    );

    body = (
      <>
        <span className="avt lgA" style={userAvatarStyle(inviter)}>{!inviter.avatarUrl && inviter.name[0].toUpperCase()}</span>
        <p className="eyebrow muted" style={{ margin: 0 }}>{host}/invite/{inviter.handle.replace(/^@/, '')}</p>
        <h1 className="big" style={{ margin: 0, fontSize: 'clamp(30px,6vw,48px)' }}>{t('invite.title', { name: inviter.name })}</h1>
        <p className="muted" style={{ fontWeight: 600, maxWidth: '40ch' }}>{t('invite.body', { name: first })}</p>
        <div className="acts" style={{ justifyContent: 'center' }}>{cta}</div>
        {status === 'error' && <p className="ferr" role="alert">{t('invite.error')}</p>}
        {authed === false && relation !== 'self' && <small className="muted" style={{ fontWeight: 700 }}>{t('invite.autoNote')}</small>}
      </>
    );
  }

  return (
    <div className="rd">
      <div className="wrap">
        <div className="tile t-ink glow" style={{ maxWidth: 640, margin: '20px auto', textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 10 }}>
          {body}
        </div>
        <div style={{ textAlign: 'center' }}><a href="/" className="link">{t('invite.openApp')}</a></div>
      </div>
    </div>
  );
}
