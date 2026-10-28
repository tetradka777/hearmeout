'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { toLocale } from '@/lib/i18n';
import type { LaterRepeat } from '@/lib/types';
import { LATER_REMIND_EVENT, laterRemindReady, presetTime, saveLaterReminder, toLocalInput, openLaterReminder, type Preset, type RemindTarget } from '@/lib/laterRemind';
import { CoverArt } from './ui/CoverArt';
import { CloseIcon } from './ui/Icons';
import type { TranslationKey } from '@/lib/i18n';

const PRESETS: { id: Preset; key: TranslationKey }[] = [
  { id: 'hour', key: 'remind.inHour' },
  { id: 'tonight', key: 'remind.tonight' },
  { id: 'tomorrow', key: 'remind.tomorrow' },
  { id: 'weekend', key: 'remind.weekend' },
  { id: 'nextWeek', key: 'remind.nextWeek' },
];
const REPEATS: { id: LaterRepeat | null; key: TranslationKey }[] = [
  { id: null, key: 'remind.once' },
  { id: 'day', key: 'remind.daily' },
  { id: 'week', key: 'remind.weekly' },
  { id: 'month', key: 'remind.monthly' },
];
const REPEAT_KEY: Record<LaterRepeat, TranslationKey> = { day: 'remind.daily', week: 'remind.weekly', month: 'remind.monthly' };

// "Sat, Nov 1, 11:00" in the account's language and clock.
function useWhen() {
  const { language, me } = useApp();
  return (d: Date) => d.toLocaleString(toLocale(language), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: me?.timeFormat === '12' });
}

// Mounted once in the shell: opens the picker whenever something asks for
// it (lib/laterRemind).
export function LaterReminderHost() {
  const [target, setTarget] = useState<RemindTarget | null>(null);
  useEffect(() => {
    const on = (e: Event) => setTarget((e as CustomEvent<RemindTarget>).detail);
    window.addEventListener(LATER_REMIND_EVENT, on);
    return () => window.removeEventListener(LATER_REMIND_EVENT, on);
  }, []);
  if (!target || typeof document === 'undefined' || !document.querySelector('.rd')) return null;
  return createPortal(<ReminderSheet key={target.id} target={target} onClose={() => setTarget(null)} />, document.querySelector('.rd')!);
}

function ReminderSheet({ target, onClose }: { target: RemindTarget; onClose: () => void }) {
  const { t, showToast, refreshLater } = useApp();
  const when = useWhen();
  const [at, setAt] = useState<Date | null>(() => (target.remindAt ? new Date(target.remindAt) : presetTime('tomorrow')));
  const [preset, setPreset] = useState<Preset | 'custom' | null>(target.remindAt ? 'custom' : 'tomorrow');
  const [every, setEvery] = useState<LaterRepeat | null>(target.remindEvery ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (next: Date | null) => {
    if (next && next.getTime() < Date.now() - 60000) { showToast(t('remind.inPast')); return; }
    setBusy(true);
    const r = await saveLaterReminder(target.id, next, every);
    setBusy(false);
    if (r === 'ok') {
      await refreshLater();
      showToast(next ? t('remind.setToast', { when: when(next) }) : t('remind.offToast'));
      onClose();
    } else showToast(t(r === 'not_ready' ? 'remind.notReady' : 'generic.loadError'));
  };

  const pushOff = typeof Notification !== 'undefined' && Notification.permission !== 'granted';

  return (
    <div className="modalbg rm23bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile rm23" role="dialog" aria-modal="true" aria-labelledby="rmtitle">
        <div className="rmh">
          <CoverArt url={target.cover ?? undefined} fallbackLetter={(target.artist || target.title)[0] || '?'} className="cov" px={64} />
          <span className="g">
            <small>{t('remind.eyebrow')}</small>
            <b id="rmtitle">{target.title}</b>
            {target.artist && <small className="muted">{target.artist}</small>}
          </span>
          <button className="ib" onClick={onClose} aria-label={t('recap.close')}><CloseIcon /></button>
        </div>

        <p className="rml">{t('remind.when')}</p>
        <div className="chips rmc">
          {PRESETS.map((p) => {
            const d = presetTime(p.id);
            if (!d) return null;
            return <button key={p.id} className={`chip${preset === p.id ? ' on' : ''}`} onClick={() => { setPreset(p.id); setAt(d); }}>{t(p.key)}</button>;
          })}
          <button className={`chip${preset === 'custom' ? ' on' : ''}`} onClick={() => setPreset('custom')}>{t('remind.pick')}</button>
        </div>
        {preset === 'custom' && (
          <input
            className="field"
            type="datetime-local"
            aria-label={t('remind.pick')}
            min={toLocalInput(new Date())}
            value={at ? toLocalInput(at) : ''}
            onChange={(e) => { const d = new Date(e.target.value); setAt(Number.isNaN(d.getTime()) ? null : d); }}
          />
        )}

        <p className="rml">{t('remind.repeat')}</p>
        <div className="btab14 rmr" role="radiogroup" aria-label={t('remind.repeat')}>
          {REPEATS.map((r) => (
            <button key={r.key} role="radio" aria-checked={every === r.id} className={every === r.id ? 'on' : ''} onClick={() => setEvery(r.id)}>{t(r.key)}</button>
          ))}
        </div>

        {at && <p className="rmn"><i className="ic ic-clock" aria-hidden="true" /> {t('remind.next', { when: when(at) })}{every ? ` · ${t(REPEAT_KEY[every])}` : ''}</p>}
        {pushOff && <p className="muted rmp">{t('remind.pushHint')}</p>}

        <div className="acts">
          <button className="btn" disabled={busy || !at} onClick={() => save(at)}>{t('remind.set')}</button>
          <button className="btn ghost" disabled={busy} onClick={() => (target.remindAt ? save(null) : onClose())}>{t(target.remindAt ? 'remind.turnOff' : 'remind.skip')}</button>
        </div>
      </div>
    </div>
  );
}

// The clock on a Listen later row: when the next reminder is, or "remind me".
export function ReminderButton({ item }: { item: RemindTarget }) {
  const { t } = useApp();
  const when = useWhen();
  if (!laterRemindReady()) return null;
  const on = !!item.remindAt;
  return (
    <button
      className={`ib rmb${on ? ' on' : ''}`}
      onClick={() => openLaterReminder(item)}
      aria-label={on ? t('remind.nextAria', { when: when(new Date(item.remindAt!)) }) : t('remind.button')}
      title={on ? when(new Date(item.remindAt!)) : t('remind.button')}
    >
      <i className="ic ic-clock" aria-hidden="true" />
    </button>
  );
}

// The next reminder under a Listen later row's title.
export function ReminderNote({ item }: { item: RemindTarget }) {
  const { t } = useApp();
  const when = useWhen();
  if (!item.remindAt) return null;
  return <small className="rmo"><i className="ic ic-clock" aria-hidden="true" /> {when(new Date(item.remindAt))}{item.remindEvery ? ` · ${t(REPEAT_KEY[item.remindEvery])}` : ''}</small>;
}
