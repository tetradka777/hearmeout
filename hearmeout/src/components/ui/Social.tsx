'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { formatRelative, userAvatarStyle } from '@/lib/format';
import { REACTIONS, type ReactionKind } from '@/lib/reactions';
import { setCommentCount, toggleReaction, useSocial } from '@/lib/socialClient';
import type { SocialComment } from '@/app/api/social/comments/route';
import type { TranslationKey } from '@/lib/i18n';
import { CloseIcon } from './Icons';

const ICON: Record<ReactionKind, string> = { heart: 'heart', flame: 'flame', spark: 'spark', repeat: 'repeat', star: 'star' };
const LABEL: Record<ReactionKind, TranslationKey> = {
  heart: 'social.rHeart', flame: 'social.rFlame', spark: 'social.rSpark', repeat: 'social.rRepeat', star: 'social.rStar',
};

// Comments and reactions under a card (after Superfan): a speech bubble
// with the comment count, the reactions given so far, and a smiley that
// opens the five reactions. Nothing is shown where the viewer can't take
// part (or before migration 029 is applied).
export function SocialBar({ target, title }: { target: string | null; title?: string }) {
  const { t } = useApp();
  const s = useSocial(target);
  const [picker, setPicker] = useState(false);
  const [comments, setComments] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setPicker(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [picker]);
  if (!target || s === null) return null;
  const counts = s?.reactions ?? {};
  const mine = s?.mine ?? [];
  const react = (k: ReactionKind) => { setPicker(false); toggleReaction(target, k); };
  return (
    <span className="sb14" onClick={(e) => e.stopPropagation()} ref={wrap}>
      <button className="sbb" onClick={() => setComments(true)} aria-label={t('social.comments')}>
        <i className="ic ic-chat" aria-hidden="true" />{s && s.comments > 0 && <b>{s.comments}</b>}
      </button>
      {REACTIONS.filter((k) => (counts[k] || 0) > 0).map((k) => (
        <button key={k} className={`rxc${mine.includes(k) ? ' on' : ''}`} onClick={() => react(k)} aria-pressed={mine.includes(k)} aria-label={t(LABEL[k])}>
          <i className={`ic ic-${ICON[k]}`} aria-hidden="true" /><b>{counts[k]}</b>
        </button>
      ))}
      <span className="rpk">
        <button className="sbb" onClick={() => setPicker((v) => !v)} aria-expanded={picker} aria-label={t('social.react')}>
          <i className="ic ic-smile" aria-hidden="true" />
        </button>
        {picker && (
          <span className="pk14" role="menu">
            {REACTIONS.map((k) => (
              <button key={k} role="menuitem" className={mine.includes(k) ? 'on' : ''} onClick={() => react(k)} aria-label={t(LABEL[k])} title={t(LABEL[k])}>
                <i className={`ic ic-${ICON[k]}`} aria-hidden="true" />
              </button>
            ))}
          </span>
        )}
      </span>
      {comments && <CommentsModal target={target} title={title} onClose={() => setComments(false)} />}
    </span>
  );
}

// The comments on one thing, and a field to add yours. Portaled into .rd:
// screens animate a transform, which would trap position:fixed.
function CommentsModal({ target, title, onClose }: { target: string; title?: string; onClose: () => void }) {
  const { t, language, me, viewFriend, showToast } = useApp();
  const [list, setList] = useState<SocialComment[] | null>(null);
  const [ready, setReady] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/social/comments?target=${encodeURIComponent(target)}`).catch(() => null);
    const d = res?.ok ? await res.json() as { comments: SocialComment[]; ready: boolean } : { comments: [], ready: true };
    setList(d.comments);
    setReady(d.ready);
    setCommentCount(target, d.comments.length);
  };
  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await fetch('/api/social/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, body }) }).catch(() => null);
    setSending(false);
    if (!res?.ok) { showToast(res?.status === 503 ? t('social.notReady') : res?.status === 429 ? t('social.tooMany') : t('social.failed')); return; }
    setText('');
    load();
  };
  const remove = async (id: number) => {
    const res = await fetch(`/api/social/comments?id=${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) load(); else showToast(t('social.failed'));
  };

  return createPortal(
    <div className="modalbg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile cm14" role="dialog" aria-modal="true" aria-labelledby="cmtitle">
        <div className="hd">
          <div><h2 id="cmtitle" style={{ margin: 0 }}>{t('social.comments')}</h2>{title && <small className="muted">{title}</small>}</div>
          <button className="ib" onClick={onClose} aria-label={t('recap.close')}><CloseIcon /></button>
        </div>
        <div className="ls">
          {list === null ? <p className="muted">{t('app.loading')}</p>
            : !ready ? <p className="muted" style={{ fontWeight: 600 }}>{t('social.notReady')}</p>
            : !list.length ? <p className="muted" style={{ fontWeight: 600 }}>{t('social.noComments')}</p>
            : list.map((c) => (
              <div className="cmt" key={c.id}>
                <button className="dot" style={{ ...userAvatarStyle(c.user), backgroundSize: 'cover' }} onClick={() => { if (c.user.id !== me?.id) { onClose(); viewFriend(c.user.id); } }} aria-label={c.user.name}>{!c.user.avatarUrl && c.user.name[0]?.toUpperCase()}</button>
                <div className="g">
                  <b>{c.user.name} <small className="muted">· {formatRelative(c.createdAt, language)}</small></b>
                  <p>{c.body}</p>
                </div>
                {c.canDelete && <button className="link del" onClick={() => remove(c.id)}>{t('social.delete')}</button>}
              </div>
            ))}
        </div>
        {ready && (
          <div className="nw">
            <textarea className="field" rows={2} maxLength={500} placeholder={t('social.writeComment')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn" onClick={send} disabled={!text.trim() || sending}>{t('social.send')}</button>
          </div>
        )}
      </div>
    </div>,
    document.querySelector('.rd') ?? document.body,
  );
}
