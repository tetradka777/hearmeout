'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { getRegionCodes, regionDisplayName } from '@/lib/i18n';
import { PALETTES, type Design, type Mode } from '@/lib/palettes';
import { AccountBlock, ConnectBlock, ImportHistoryBlock } from '../ProfileBlocks';

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
      <h3>{t('settings.design') || 'Design'}</h3>
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
    { key: 'classic', label: t('settings.paletteClassic') || 'Classic' },
    { key: 'neon', label: t('settings.paletteNeon') || 'Neon' },
  ];
  return (
    <div className="sec">
      <h3>{t('settings.colorPalette') || 'Color palette'}</h3>
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
      <h3>{t('settings.extras') || 'Extras'}</h3>
      <div className="setrow">
        <div><b>{t('settings.activityStrip') || 'Activity strip'}</b></div>
        <button className="sw" role="switch" aria-checked={me.tickerEnabled} onClick={() => updateAppearance({ tickerEnabled: !me.tickerEnabled })}><i /></button>
      </div>
      <div className="setrow">
        <div><b>{t('settings.animations') || 'Animations'}</b></div>
        <button className="sw" role="switch" aria-checked={me.motionEnabled} onClick={() => updateAppearance({ motionEnabled: !me.motionEnabled })}><i /></button>
      </div>
      <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => showScreen('settings')}>{t('settings.viewStates') || 'View loading, empty and error states'}</button>
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

function LanguageRegionSection() {
  const { t, me, language, updateRegion, updateAppearance } = useApp();
  const regionCodes = useMemo(() => getRegionCodes(), []);
  if (!me) return null;

  return (
    <>
      <h2>{t('profile.region')}</h2>
      <div className="sec">
        <h3>{t('profile.region')}</h3>
        <select className="field" style={{ marginTop: 10, width: '100%' }} value={me.region ?? ''} onChange={(e) => updateRegion(e.target.value || null)}>
          <option value="">{t('profile.regionNone')}</option>
          {regionCodes.map((code) => <option key={code} value={code}>{regionDisplayName(code, language)}</option>)}
        </select>
      </div>
      <div className="sec">
        <h3>{t('settings.timeFormat') || 'Time format'}</h3>
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={me.timeFormat === '24' ? 'on' : ''} onClick={() => updateAppearance({ timeFormat: '24' })}>24-hour</button>
          <button className={me.timeFormat === '12' ? 'on' : ''} onClick={() => updateAppearance({ timeFormat: '12' })}>12-hour</button>
        </div>
      </div>
      <div className="sec">
        <h3>{t('settings.weekStart') || 'Week starts on'}</h3>
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={me.weekStart === 'mon' ? 'on' : ''} onClick={() => updateAppearance({ weekStart: 'mon' })}>Monday</button>
          <button className={me.weekStart === 'sun' ? 'on' : ''} onClick={() => updateAppearance({ weekStart: 'sun' })}>Sunday</button>
        </div>
      </div>
    </>
  );
}

function ProfileVisibilitySection() {
  const { t, me, updateOpenProfile } = useApp();
  if (!me) return null;
  const isOpen = me.isOpenProfile;

  return (
    <div className="sec">
      <h3>{t('settings.profileVisibility')}</h3>
      <p className="muted">{isOpen ? t('settings.profileVisibilityOpenHint') : t('settings.profileVisibilityClosedHint')}</p>
      <div className="seg" style={{ marginTop: 10 }}>
        <button className={!isOpen ? 'on' : ''} onClick={() => updateOpenProfile(false)}>{t('settings.profileClosed')}</button>
        <button className={isOpen ? 'on' : ''} onClick={() => updateOpenProfile(true)}>{t('settings.profileOpen')}</button>
      </div>
    </div>
  );
}

function DeleteAccountBlock() {
  const { t, deleteAccount, showToast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

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
          <div className="acts">
            <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>{t('settings.deleteAccountCancel')}</button>
            <button className="btn danger" disabled={busy} onClick={async () => {
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
  const { t, me, updatePrivacy } = useApp();
  if (!me) return null;
  const rows: { key: keyof typeof me; label: string; set: (v: boolean) => void }[] = [
    { key: 'ratingsVisible', label: t('settings.ratingsVisible') || 'Ratings visible to friends', set: (v) => updatePrivacy({ ratingsVisible: v }) },
    { key: 'shareLive', label: t('settings.shareLive') || "Show what I'm playing live", set: (v) => updatePrivacy({ shareLive: v }) },
    { key: 'publicReviews', label: t('settings.publicReviews') || 'Public reviews', set: (v) => updatePrivacy({ publicReviews: v }) },
    { key: 'discoverable', label: t('settings.discoverable') || 'Appear in Discover', set: (v) => updatePrivacy({ discoverable: v }) },
  ];
  return (
    <>
      <h2>{t('settings.privacy') || 'Privacy'}</h2>
      {rows.map((r) => (
        <div className="setrow" key={r.key}>
          <div><b>{r.label}</b></div>
          <button className="sw" role="switch" aria-checked={!!me[r.key]} onClick={() => r.set(!me[r.key])}><i /></button>
        </div>
      ))}
    </>
  );
}

export function SettingsScreen({ device }: { device: Device }) {
  const { t, me, syncSpotify, goBack } = useApp();
  const [section, setSection] = useState<Section>('appearance');
  if (!me) return null;

  const NAV: { key: Section; label: string }[] = [
    { key: 'appearance', label: t('settings.appearance') },
    { key: 'language', label: t('settings.languageRegion') },
    { key: 'account', label: t('profile.accountSection') },
    { key: 'connections', label: t('profile.connection') },
    { key: 'privacy', label: t('settings.privacy') || 'Privacy' },
  ];

  const body = (
    <>
      {section === 'appearance' && <AppearanceSection device={device} />}
      {section === 'language' && <LanguageRegionSection />}
      {section === 'account' && (
        <>
          <h2>{t('profile.accountSection')}</h2>
          <AccountBlock />
          <ProfileVisibilitySection />
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
      {section === 'privacy' && <PrivacySection />}
    </>
  );

  return (
    <>
      <button className="crumb" onClick={() => goBack('profile')}>‹ {t('friend.back')}</button>
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
