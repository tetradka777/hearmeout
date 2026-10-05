'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { getRegionCodes, regionDisplayName, toLocale, LANGUAGES, LANGUAGE_LABEL, type Language } from '@/lib/i18n';
import { PALETTES, type Design, type Mode } from '@/lib/palettes';
import { AccountBlock, ConnectBlock, ImportHistoryBlock } from '../ProfileBlocks';
import { exportRatingsCsv } from '@/lib/csvExport';

type Section = 'appearance' | 'language' | 'account' | 'connections' | 'privacy';

// Settings (spec 7.1): five sections. Appearance replaces the old single
// accent-theme/toxicity/banner system entirely with the redesign's own
// Design + Mode + 13-palette picker (none of it premium-gated — premium
// is being removed from the product). Privacy is a new section.

function DesignSection({ device }: { device: Device }) {
  const { t, me, updateAppearance } = useApp();
  if (!me) return null;
  const design = me.design;

  const DESIGNS: { id: Design; name: string; hint: string }[] = [
    { id: 'cream-pop', name: 'Cream Pop', hint: 'Playful, outlined, top menu' },
    { id: 'toxic', name: 'Toxic', hint: 'Neon, sidebar, now-playing bar' },
  ];

  return (
    <div className="sec">
      <h3>{t('settings.design')}</h3>
      <div className="optgrid" style={{ marginTop: 10 }}>
        {DESIGNS.map((d) => (
          <button key={d.id} className="optcard" role="radio" aria-checked={design === d.id} onClick={() => updateAppearance({ design: d.id })}>
            <span className="chk">✓</span>
            <div className="tile" style={{ height: 70, marginBottom: 10, pointerEvents: 'none' }} data-design-preview={d.id}>
              <div className="tile t-ac" style={{ height: '100%', padding: 8 }} />
            </div>
            <b>{d.name}</b>
            <div className="muted">{d.hint}</div>
          </button>
        ))}
      </div>

      <div className="seg" role="radiogroup" style={{ marginTop: 14 }}>
        {(['light', 'dark', 'system'] as Mode[]).map((m) => (
          <button key={m} className={me.mode === m ? 'on' : ''} role="radio" aria-checked={me.mode === m} onClick={() => updateAppearance({ mode: m })}>
            {t(`settings.${m}` as never)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PaletteSection() {
  const { t, me, updateAppearance } = useApp();
  if (!me) return null;
  const groups: { key: 'classic' | 'neon'; label: string }[] = [
    { key: 'classic', label: t('settings.paletteClassic') },
    { key: 'neon', label: t('settings.paletteNeon') },
  ];
  return (
    <div className="sec">
      <h3>{t('settings.colorPalette')}</h3>
      {groups.map((grp) => (
        <div key={grp.key}>
          <div className="palgroup">{grp.label}</div>
          <div className="palgrid">
            {PALETTES.filter((p) => p.group === grp.key).map((p) => (
              <button key={p.id} className="palbtn" role="radio" aria-checked={me.palette === p.id} onClick={() => updateAppearance({ palette: p.id })}>
                <span className="sws" data-palette={p.id}>
                  <i style={{ background: 'var(--ink)' }} /><i style={{ background: 'var(--ac)' }} /><i style={{ background: 'var(--pop)' }} />
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExtrasSection() {
  const { t, me, updateAppearance, showScreen } = useApp();
  if (!me) return null;
  return (
    <div className="sec">
      <h3>{t('settings.extras')}</h3>
      <div className="setrow">
        <div><b>{t('settings.activityStrip')}</b></div>
        <button className="sw" role="switch" aria-checked={me.tickerEnabled} onClick={() => updateAppearance({ tickerEnabled: !me.tickerEnabled })}><i /></button>
      </div>
      <div className="setrow">
        <div><b>{t('settings.animations')}</b></div>
        <button className="sw" role="switch" aria-checked={me.motionEnabled} onClick={() => updateAppearance({ motionEnabled: !me.motionEnabled })}><i /></button>
      </div>
      <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => showScreen('states')}>{t('settings.viewStates')}</button>
    </div>
  );
}

function AppearanceSection({ device }: { device: Device }) {
  const { t } = useApp();
  return (
    <>
      <h2>{t('settings.appearance')}</h2>
      <DesignSection device={device} />
      <PaletteSection />
      <ExtrasSection />
    </>
  );
}

// Weekday name in the interface language (0 = Sunday), from Intl rather
// than a dictionary key per day. 4 Jan 2026 is a Sunday.
function weekdayName(day: number, language: Language): string {
  const name = new Date(Date.UTC(2026, 0, 4 + day)).toLocaleDateString(toLocale(language), { weekday: 'long', timeZone: 'UTC' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function LanguageRegionSection() {
  const { t, me, language, updateLanguage, updateRegion, updateRegionAuto, updateAppearance } = useApp();
  const regionCodes = useMemo(() => getRegionCodes(), []);
  if (!me) return null;

  return (
    <>
      <h2>{t('settings.languageRegion')}</h2>
      <div className="sec">
        <h3>{t('settings.language')}</h3>
        <p className="muted">{t('settings.languageHint')}</p>
        <div className="chips" style={{ marginTop: 10 }}>
          {LANGUAGES.map((l) => (
            <button key={l} className={`chip ${language === l ? 'on' : ''}`} onClick={() => updateLanguage(l)}>{LANGUAGE_LABEL[l]}</button>
          ))}
        </div>
      </div>
      <div className="sec">
        <h3>{t('profile.region')}</h3>
        {/* Spec 7.1: "Detect from my streaming account" (on by default). While
            it's on and a country is known, the field is locked to it. */}
        <div className="setrow" style={{ marginTop: 6 }}>
          <div>
            <b>{t('settings.regionAuto')}</b>
            <div><small className="muted">
              {!me.regionAuto ? t('settings.regionAutoHint')
                : me.detectedRegion ? t('settings.regionAutoDetected', { country: regionDisplayName(me.detectedRegion, language) })
                : me.connections.spotify ? t('settings.regionAutoReconnect') : t('settings.regionAutoConnect')}
            </small></div>
          </div>
          <button className="sw" role="switch" aria-checked={me.regionAuto} onClick={() => updateRegionAuto(!me.regionAuto)}><i /></button>
        </div>
        <select className="field" style={{ marginTop: 10, width: '100%' }} disabled={me.regionAuto && !!me.detectedRegion} value={me.region ?? ''} onChange={(e) => updateRegion(e.target.value || null)}>
          <option value="">{t('profile.regionNone')}</option>
          {regionCodes.map((code) => <option key={code} value={code}>{regionDisplayName(code, language)}</option>)}
        </select>
      </div>
      <div className="sec">
        <h3>{t('settings.timeFormat')}</h3>
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={me.timeFormat === '24' ? 'on' : ''} onClick={() => updateAppearance({ timeFormat: '24' })}>{t('settings.hour24')}</button>
          <button className={me.timeFormat === '12' ? 'on' : ''} onClick={() => updateAppearance({ timeFormat: '12' })}>{t('settings.hour12')}</button>
        </div>
      </div>
      <div className="sec">
        <h3>{t('settings.weekStart')}</h3>
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={me.weekStart === 'mon' ? 'on' : ''} onClick={() => updateAppearance({ weekStart: 'mon' })}>{weekdayName(1, language)}</button>
          <button className={me.weekStart === 'sun' ? 'on' : ''} onClick={() => updateAppearance({ weekStart: 'sun' })}>{weekdayName(0, language)}</button>
        </div>
      </div>
    </>
  );
}

// Redesign fix (item 21): spec 7.1/9.9 calls this a single switch, "Private
// profile" — it was built as a two-button Open/Closed segmented control,
// which is a different control than the prototype's for the same setting.
function ProfileVisibilitySection() {
  const { t, me, updateOpenProfile } = useApp();
  if (!me) return null;
  const isPrivate = !me.isOpenProfile;

  return (
    <div className="setrow">
      <div>
        <b>{t('settings.privateProfile')}</b>
        <div><small className="muted">{isPrivate ? t('settings.profileVisibilityClosedHint') : t('settings.profileVisibilityOpenHint')}</small></div>
      </div>
      <button className="sw" role="switch" aria-checked={isPrivate} onClick={() => updateOpenProfile(isPrivate)}><i /></button>
    </div>
  );
}

function ReplayOnboardingRow() {
  const { t, replayOnboarding } = useApp();
  return (
    <div className="sec">
      <div className="setrow">
        <div>
          <b>{t('settings.replayOnboarding')}</b>
          <div><small className="muted">{t('settings.replayOnboardingHint')}</small></div>
        </div>
        <button className="btn ghost" onClick={replayOnboarding}>{t('settings.replayOnboardingBtn')}</button>
      </div>
    </div>
  );
}

// Redesign fix (item 21): spec's two-step delete requires typing the exact
// word DELETE before the button enables — this used to just be a plain
// Confirm/Cancel pair with no typed safety check.
function DeleteAccountBlock() {
  const { t, deleteAccount, showToast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="sec">
      <h3>{t('settings.dangerZone')}</h3>
      <p className="muted">{t('settings.deleteAccountHint')}</p>
      <a href="/privacy" target="_blank" rel="noreferrer" className="link" style={{ display: 'inline-block', margin: '10px 0' }}>{t('settings.whatWeStoreLink')}</a>
      {!confirming ? (
        <button className="btn danger" onClick={() => setConfirming(true)}>{t('settings.deleteAccountBtn')}</button>
      ) : (
        <div className="tile t-pop">
          <p>{t('settings.deleteAccountConfirm')}</p>
          <input
            className="field"
            style={{ marginTop: 10 }}
            placeholder={t('settings.deleteAccountTypeDelete')}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            aria-label={t('settings.deleteAccountTypeDelete')}
          />
          <div className="acts">
            <button className="btn ghost" onClick={() => { setConfirming(false); setConfirmText(''); }} disabled={busy}>{t('settings.deleteAccountCancel')}</button>
            <button className="btn danger" disabled={busy || confirmText !== 'DELETE'} onClick={async () => {
              setBusy(true);
              const ok = await deleteAccount();
              if (!ok) { setBusy(false); showToast(t('settings.deleteAccountFailed')); }
            }}>{t('settings.deleteAccountReallyBtn')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PrivacySection() {
  const { t, me, updatePrivacy, myRatings, albums, liveAlbums } = useApp();
  if (!me) return null;
  const rows: { key: keyof typeof me; label: string; hint: string; set: (v: boolean) => void }[] = [
    { key: 'ratingsVisible', label: t('settings.ratingsVisible'), hint: t('settings.ratingsVisibleHint'), set: (v) => updatePrivacy({ ratingsVisible: v }) },
    { key: 'shareLive', label: t('settings.shareLive'), hint: t('settings.shareLiveHint'), set: (v) => updatePrivacy({ shareLive: v }) },
    { key: 'publicReviews', label: t('settings.publicReviews'), hint: t('settings.publicReviewsHint'), set: (v) => updatePrivacy({ publicReviews: v }) },
    { key: 'discoverable', label: t('settings.discoverable'), hint: t('settings.discoverableHint'), set: (v) => updatePrivacy({ discoverable: v }) },
  ];
  return (
    <>
      {rows.map((r) => (
        <div className="setrow" key={r.key}>
          <div><b>{r.label}</b><div><small className="muted">{r.hint}</small></div></div>
          <button className="sw" role="switch" aria-checked={!!me[r.key]} onClick={() => r.set(!me[r.key])}><i /></button>
        </div>
      ))}
      {/* Redesign fix (item 21): same ratings CSV as History's own export
          button (prototype's doCsv(), reachable from both places). */}
      <div className="acts">
        <button
          className="btn ghost"
          disabled={!myRatings.length}
          onClick={() => exportRatingsCsv(myRatings, (id) => liveAlbums[id] || albums.find((x) => x.id === id))}
        >
          {t('settings.exportMyData')}
        </button>
        <a className="btn ghost" href="/privacy" target="_blank" rel="noreferrer">{t('landing.whatWeStore')}</a>
      </div>
    </>
  );
}

export function SettingsScreen({ device }: { device: Device }) {
  const { t, me, syncSpotify } = useApp();
  const [section, setSection] = useState<Section>('appearance');
  if (!me) return null;

  const NAV: { key: Section; label: string }[] = [
    { key: 'appearance', label: t('settings.appearance') },
    { key: 'language', label: t('settings.languageRegion') },
    { key: 'account', label: t('profile.accountSection') },
    { key: 'connections', label: t('profile.connection') },
    { key: 'privacy', label: t('settings.privacy') },
  ];

  const body = (
    <>
      {section === 'appearance' && <AppearanceSection device={device} />}
      {section === 'language' && <LanguageRegionSection />}
      {section === 'account' && (
        <>
          <h2>{t('profile.accountSection')}</h2>
          <AccountBlock />
          <ReplayOnboardingRow />
          <DeleteAccountBlock />
        </>
      )}
      {section === 'connections' && (
        <>
          <h2>{t('profile.connection')}</h2>
          <ConnectBlock />
          {me.connections.spotify && <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => syncSpotify()}>{t('profile.syncNow')}</button>}
          <div className="sec"><ImportHistoryBlock /></div>
        </>
      )}
      {section === 'privacy' && (
        <>
          {/* One card, as in the prototype's privacy tab: the five switches
              (Private profile first) and the Export / What we store actions. */}
          <div className="tile">
            <h2>{t('settings.privacy')}</h2>
            <ProfileVisibilitySection />
            <PrivacySection />
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      <div className="eyebrow">{t('settings.eyebrow')}</div>
      <h1 className="big">{t('settings.title')}</h1>
      <div className="setgrid">
        <div className="stabs">
          {NAV.map((n) => (
            <button key={n.key} className={section === n.key ? 'on' : ''} onClick={() => setSection(n.key)}>{n.label}</button>
          ))}
        </div>
        <div>{body}</div>
      </div>
    </>
  );
}
