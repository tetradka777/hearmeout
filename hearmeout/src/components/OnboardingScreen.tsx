'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';
import { StarSlider } from './redesign/Stars';
import { ConnectBlock, ImportHistoryBlock } from './ProfileBlocks';
import { PALETTES, type Design } from '@/lib/palettes';

type PersonResult = { id: string; name: string; handle: string; avatarUrl: string | null };

function FindPeopleStep() {
  const { t, me, friendRequests, addFriend } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonResult[] | null>(null);

  const search = (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults(null); return; }
    fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`).then((r) => (r.ok ? r.json() : [])).then(setResults);
  };

  if (!me) return null;

  return (
    <div className="sec">
      <h3>{t('onboarding.findPeople')}</h3>
      <input className="field" style={{ width: '100%', marginTop: 10 }} placeholder={t('onboarding.findPeoplePlaceholder')} value={query} onChange={(e) => search(e.target.value)} />
      <div className="stack" style={{ marginTop: 10 }}>
        {results && results.map((p) => {
          const isFriend = me.friends.some((f) => f.id === p.id);
          const isPending = friendRequests.outgoing.some((r) => r.user.id === p.id);
          return (
            <div className="row" key={p.id}>
              <div className="g"><b>{p.name}</b><div className="muted">{p.handle}</div></div>
              {isFriend ? <span className="tag">{t('friend.alreadyFriend')}</span>
                : isPending ? <span className="tag">{t('friend.requestSent')}</span>
                : <button className="chip" onClick={() => addFriend(p.handle)}>{t('friend.addThem')}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalibrateStep() {
  const { t, albums, spotifyCovers, myRatings, publishRating } = useApp();
  const picks = useMemo(() => [...albums].sort(() => 0.5 - Math.random()).slice(0, 3), [albums]);
  const [values, setValues] = useState<Record<string, number>>({});

  return (
    <div className="sec">
      <h3>{t('onboarding.calibrate')}</h3>
      <div className="stack" style={{ marginTop: 10 }}>
        {picks.map((a) => {
          const already = myRatings.find((r) => r.albumId === a.id);
          const val = values[a.id] ?? already?.stars ?? 0;
          return (
            <div key={a.id} className="row">
              <CoverArt url={spotifyCovers[a.id] || a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 40, height: 40 }} />
              <div className="g">
                <b>{a.title}</b>
                <div className="muted">{a.artist}</div>
                <div style={{ marginTop: 6 }}>
                  <StarSlider value={val} onChange={(v) => { setValues((s) => ({ ...s, [a.id]: v })); publishRating(a.id, v, ''); }} size={20} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LookStep() {
  const { t, me, updateAppearance } = useApp();
  if (!me) return null;
  const DESIGNS: { id: Design; name: string; hint: string }[] = [
    { id: 'cream-pop', name: 'Cream Pop', hint: 'Playful, outlined, top menu' },
    { id: 'toxic', name: 'Toxic', hint: 'Neon, sidebar, now-playing bar' },
  ];
  return (
    <div className="sec">
      <h3>{t('onboarding.lookTitle') || 'Pick your look'}</h3>
      <div className="optgrid" style={{ marginTop: 10 }}>
        {DESIGNS.map((d) => (
          <button key={d.id} className="optcard" role="radio" aria-checked={me.design === d.id} onClick={() => updateAppearance({ design: d.id })}>
            <span className="chk">✓</span>
            <b>{d.name}</b>
            <div className="muted">{d.hint}</div>
          </button>
        ))}
      </div>
      <div className="palgrid" style={{ marginTop: 14 }}>
        {PALETTES.map((p) => (
          <button key={p.id} className="palbtn" role="radio" aria-checked={me.palette === p.id} onClick={() => updateAppearance({ palette: p.id })}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OnboardingScreen() {
  const { t, me, dismissOnboarding } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  if (!me) return null;

  return (
    <div className="rd">
      <div className="modalbg">
        <div className="tile modal" style={{ maxWidth: 520, padding: 26 }}>
          <div className="setrow" style={{ border: 0, padding: 0 }}>
            <div className="logo"><span className="mk" />hearmeout</div>
            <small className="muted">{t('onboarding.stepLabel', { step, total: 3 })}</small>
          </div>
          <div className="seg" style={{ marginTop: 14 }}>
            <button className={step === 1 ? 'on' : ''} disabled>1</button>
            <button className={step === 2 ? 'on' : ''} disabled>2</button>
            <button className={step === 3 ? 'on' : ''} disabled>3</button>
          </div>

          {step === 1 && (
            <>
              <div className="eyebrow" style={{ marginTop: 18 }}>{t('onboarding.connectLabel')}</div>
              <h2>{t('onboarding.connectTitle')}</h2>
              <p className="muted">{t('onboarding.connectBody')}</p>
              <ConnectBlock />
              <div className="sec"><ImportHistoryBlock /></div>
            </>
          )}
          {step === 2 && <LookStep />}
          {step === 3 && (
            <>
              <div className="eyebrow" style={{ marginTop: 18 }}>{t('onboarding.peopleLabel')}</div>
              <h2>{t('onboarding.peopleTitle')}</h2>
              <FindPeopleStep />
              <CalibrateStep />
            </>
          )}

          <div className="acts" style={{ marginTop: 20 }}>
            {step < 3 ? (
              <>
                <button className="btn lg" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>{t('onboarding.continue')}</button>
                <button className="btn ghost" onClick={() => setStep(3)}>{t('onboarding.skip')}</button>
              </>
            ) : (
              <>
                <button className="btn lg" onClick={dismissOnboarding}>{t('onboarding.finish')}</button>
                <button className="btn ghost" onClick={dismissOnboarding}>{t('onboarding.skip')}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
