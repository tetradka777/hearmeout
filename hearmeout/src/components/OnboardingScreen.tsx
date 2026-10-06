'use client';

import { useEffect, useRef, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import { invitePath } from '@/lib/pendingInvite';
import type { DiscoverMatchPerson } from '@/lib/types';
import { CoverArt } from './ui/CoverArt';
import { StarSlider } from './redesign/Stars';
import { ConnectionRows, ImportTile } from './ConnectionBlocks';
import { DesignPreview, Segc } from './screens/SettingsScreen';
import { PALETTES, type Design, type Mode } from '@/lib/palettes';
import { userAvatarStyle } from '@/lib/format';

// vOnboarding() in reference/app.js: a page (not a modal) in the main
// column, max 680px wide — "welcome to hearmeout", three step chips, then
// one tile with the step's title, lead, body and Back / Skip · Next / Finish.

function PeopleStep() {
  const { t, me, friendRequests, addFriend, respondToFriendRequest, showToast } = useApp();
  const [people, setPeople] = useState<DiscoverMatchPerson[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/match/discover').then((r) => (r.ok ? r.json() : { people: [] })).then((d) => { if (!cancelled) setPeople(d.people); });
    return () => { cancelled = true; };
  }, []);
  if (!me) return null;

  const copyInvite = async () => {
    const url = `${window.location.origin}${invitePath(me)}`;
    try { await navigator.clipboard.writeText(url); showToast(t('toast.inviteCopied')); } catch { showToast(url); }
  };
  const sm = { padding: '8px 16px' };

  return (
    <>
      <h3 style={{ margin: '14px 0 4px' }}>{t('discover.peopleYouMayKnow')}</h3>
      {people === null ? <p className="muted" style={{ fontWeight: 600 }}>{t('discover.searching')}</p>
        : !people.length ? <p className="muted" style={{ fontWeight: 600 }}>{t('onboarding.noSuggestions')}</p>
        : people.slice(0, 5).map((p) => {
          const isFriend = me.friends.some((f) => f.id === p.id);
          const out = friendRequests.outgoing.find((r) => r.user.id === p.id);
          const inc = friendRequests.incoming.find((r) => r.user.id === p.id);
          return (
            <div className="conn" key={p.id}>
              <span className="dot" style={userAvatarStyle(p)}>{!p.avatarUrl && p.name[0]}</span>
              <div className="g"><b>{p.name}</b><br /><small className="muted" style={{ fontWeight: 600 }}>{t('onboarding.personSub', { pct: p.score, handle: p.handle.replace(/^@/, '') })}</small></div>
              {isFriend ? <span className="tag">{t('friend.friendsTag')}</span>
                : out ? <button className="btn ghost" style={sm} onClick={() => respondToFriendRequest(out.id, 'cancel')}>{t('friend.requestSent')}</button>
                : inc ? <button className="btn" style={sm} onClick={() => respondToFriendRequest(inc.id, 'accept')}>{t('friends.accept')}</button>
                : <button className="btn" style={sm} onClick={() => addFriend(p.handle)}>{t('friend.addFriend')}</button>}
            </div>
          );
        })}
      <div className="acts" style={{ marginTop: 8 }}><button className="btn ghost" onClick={copyInvite}>{t('onboarding.copyInvite')}</button></div>
    </>
  );
}

function CalibrateStep() {
  const { t, albums, spotifyCovers, myRatings, publishRating } = useApp();
  // Three random catalog albums, picked once per mount (lazy state, so the
  // pick doesn't change on re-render). Fisher–Yates rather than
  // sort(() => 0.5 - Math.random()), which is biased.
  const [picks] = useState(() => {
    const pool = [...albums];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  });
  const [values, setValues] = useState<Record<string, number>>({});
  // Publish once ~400ms after the last pointer move, not on every tick of
  // the drag (redesign fix B7) — calibration has no Post button.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const rate = (albumId: string, v: number) => {
    setValues((s) => ({ ...s, [albumId]: v }));
    if (timers.current[albumId]) clearTimeout(timers.current[albumId]);
    timers.current[albumId] = setTimeout(() => publishRating(albumId, v, ''), 400);
  };

  return (
    <>
      <h3 style={{ margin: '26px 0 4px' }}>{t('onboarding.calibrate')}</h3>
      <p className="muted" style={{ fontWeight: 600, marginBottom: 8 }}>{t('onboarding.calibrateHint')}</p>
      {picks.map((a) => {
        const already = myRatings.find((r) => r.albumId === a.id);
        const val = values[a.id] ?? already?.stars ?? 0;
        return (
          <div key={a.id} className="conn">
            <CoverArt url={spotifyCovers[a.id] || a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 54, height: 54 }} />
            <div className="g">
              <b>{a.title}</b><br />
              <small className="muted" style={{ fontWeight: 600 }}>{a.artist}</small>
              <div style={{ marginTop: 6 }}><StarSlider value={val} onChange={(v) => rate(a.id, v)} size={26} /></div>
            </div>
            <span className="num" style={{ fontSize: 26, width: 44, textAlign: 'right' }}>{val > 0 ? fmt1(val) : '–'}</span>
          </div>
        );
      })}
    </>
  );
}

function LookStep() {
  const { t, me, updateAppearance } = useApp();
  if (!me) return null;
  const mode: 'light' | 'dark' = me.mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : me.mode;
  const DESIGNS: [Design, string][] = [['cream-pop', 'Cream Pop'], ['toxic', 'Toxic']];
  return (
    <>
      <div className="optgrid" role="radiogroup" aria-label={t('settings.design')}>
        {DESIGNS.map(([id, name]) => (
          <button key={id} className="optcard" role="radio" aria-checked={me.design === id} onClick={() => updateAppearance({ design: id })}>
            <span className="chk">✓</span>
            <DesignPreview design={id} mode={mode} />
            <b>{name}</b>
          </button>
        ))}
      </div>
      <Segc<Mode>
        title={t('settings.mode')}
        hint={t('onboarding.modeHint')}
        value={me.mode}
        options={[['light', t('settings.light')], ['dark', t('settings.dark')], ['system', t('settings.system')]]}
        onPick={(m) => updateAppearance({ mode: m })}
      />
      <div className="palgrid" style={{ marginTop: 16 }} role="radiogroup" aria-label={t('settings.colorPalette')}>
        {PALETTES.map((p) => (
          <button key={p.id} className="palbtn" role="radio" aria-checked={me.palette === p.id} onClick={() => updateAppearance({ palette: p.id })}>
            <span className="sws" data-palette={p.id}>
              <i style={{ background: 'var(--ink)' }} /><i style={{ background: 'var(--ac)' }} /><i style={{ background: 'var(--pop)' }} /><i style={{ background: 'var(--hi)' }} />
            </span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function OnboardingScreen() {
  const { t, me, state, dismissOnboarding } = useApp();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  // A nav click while the tour is open leaves it, as in the prototype where
  // onboarding is just another view.
  const startScreen = useRef(state.activeScreen);
  useEffect(() => {
    if (state.activeScreen !== startScreen.current) dismissOnboarding(true);
  }, [state.activeScreen, dismissOnboarding]);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  if (!me) return null;

  const steps = [t('onboarding.stepConnect'), t('onboarding.stepLook'), t('onboarding.stepFriends')];
  const title = [t('onboarding.connectTitle'), t('onboarding.lookTitle'), t('onboarding.peopleTitle')][step];
  const sub = [t('onboarding.connectBody'), t('onboarding.lookSubtitle'), t('onboarding.peopleBody')][step];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <p className="eyebrow muted">{t('onboarding.eyebrow')}</p>
      <div className="chips">
        {steps.map((x, i) => <span key={x} className={`chip${i === step ? ' on' : ''}`}>{i + 1} · {x}</span>)}
      </div>
      <div className="tile">
        <h1 className="big" style={{ fontSize: 'clamp(30px,6vw,48px)' }}>{title}</h1>
        <p className="muted" style={{ fontWeight: 600, marginBottom: 8 }}>{sub}</p>
        {step === 0 && <><ConnectionRows onboarding /><ImportTile /></>}
        {step === 1 && <LookStep />}
        {step === 2 && <><PeopleStep /><CalibrateStep /></>}
        <div className="acts" style={{ justifyContent: 'space-between', marginTop: 24 }}>
          <div>
            {step > 0
              ? <button className="btn ghost" onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}>{t('onboarding.back')}</button>
              : <button className="btn ghost" onClick={() => dismissOnboarding(true)}>{t('onboarding.skip')}</button>}
          </div>
          <button className="btn lg" onClick={() => (step < 2 ? setStep((s) => (s + 1) as 0 | 1 | 2) : dismissOnboarding())}>
            {step < 2 ? t('onboarding.next') : t('onboarding.finish')}
          </button>
        </div>
      </div>
    </div>
  );
}
