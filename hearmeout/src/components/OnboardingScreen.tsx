'use client';

import { useEffect, useRef, useState } from 'react';
import { ArtistAvatar } from './ui/ArtistName';
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
              {/* Photo but no link: leaving mid-onboarding would lose the step. */}
              <small className="muted arl" style={{ fontWeight: 600, cursor: 'default' }}><ArtistAvatar name={a.artist} size={16} /><span className="arn">{a.artist}</span></small>
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
            <span className="chk"><i className="ic ic-check" /></span>
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
          <button key={p.id} className="palbtn" role="radio" aria-label={p.name} title={p.name} aria-checked={me.palette === p.id} onClick={() => updateAppearance({ palette: p.id })}>
            <span className="sws" data-palette={p.id}>
              <i style={{ background: 'var(--pick)' }} />
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
    <div className="obwrap9">
    <div className="obmain9">
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
    {/* Rev 9: a side card per step on wide screens (hidden on phones). */}
    <aside className="obside9" aria-hidden="true"><OnboardingAside step={step} /></aside>
    </div>
  );
}

function AsideRow({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="r9">
      <span className="i9"><i className={`ic ic-${icon}`} /></span>
      <span className="g"><b>{title}</b><small className="muted">{sub}</small></span>
    </div>
  );
}

function OnboardingAside({ step }: { step: 0 | 1 | 2 }) {
  const { t } = useApp();
  if (step === 0) {
    return (
      <>
        <div className="tile t-ac aside9">
          <small className="k9">{t('onboarding.asideAfterConnect')}</small>
          <p style={{ font: '800 26px/1.05 var(--font-display)', margin: '8px 0 4px' }}>{t('onboarding.asideHistoryTitle')}</p>
          <p style={{ fontWeight: 700 }}>{t('onboarding.asideHistoryBody')}</p>
        </div>
        <div className="tile aside9" style={{ marginTop: 14 }}>
          <AsideRow icon="check" title={t('home.rateWhatPlayed')} sub={t('onboarding.asideRateSub')} />
          <AsideRow icon="check" title={t('home.tasteMatchTitle')} sub={t('onboarding.asideMatchSub')} />
          <AsideRow icon="x" title={t('settings.neverPost')} sub={t('settings.neverPostSub')} />
        </div>
      </>
    );
  }
  if (step === 1) {
    return (
      <div className="tile aside9">
        <small className="k9 muted">{t('onboarding.asideLookTitle')}</small>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 10 }}>
          <div className="tile t-ink" style={{ minHeight: 90, padding: 12 }}><span className="pill" style={{ fontSize: 11 }}>{t('home.heroSticker')}</span></div>
          <div className="tile t-ac" style={{ minHeight: 90, padding: 12 }} />
          <div className="tile t-pop" style={{ minHeight: 60, padding: 12 }} />
          <div className="tile t-soft2" style={{ minHeight: 60, padding: 12 }} />
        </div>
        <p className="muted" style={{ fontWeight: 600, marginTop: 10 }}>{t('onboarding.asideLookBody')}</p>
      </div>
    );
  }
  return (
    <div className="tile t-pop aside9">
      <small className="k9">{t('onboarding.asideWhyFriends')}</small>
      <AsideRow icon="users" title={t('home.tasteMatchTitle')} sub={t('onboarding.asideMatchSub')} />
      <AsideRow icon="star" title={t('groups.title')} sub={t('onboarding.asideGroupsSub')} />
      <AsideRow icon="disc" title={t('recap.friendsRecaps')} sub={t('onboarding.asideRecapsSub')} />
    </div>
  );
}
