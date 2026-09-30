'use client';

import { useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { getRegionCodes, regionDisplayName, type TranslationKey } from '@/lib/i18n';
import { THEME_ORDER, THEME_PAIRS, TOXICITY_ORDER, isThemeId, isToxicity, type ThemeId, type Toxicity } from '@/lib/themes';
import { AccountBlock, ConnectBlock, ImportHistoryBlock } from '../ProfileBlocks';
import { ThemeToggle } from '../ThemeToggle';
import { PremiumLock } from '../ui/PremiumLock';

type Section = 'appearance' | 'language' | 'account' | 'connections';

const TOXICITY_LABEL_KEY: Record<Toxicity, TranslationKey> = {
  calm: 'settings.paletteCalm',
  bright: 'settings.paletteBright',
  acid: 'settings.paletteAcid',
};

const THEME_NAME_KEY: Record<ThemeId, TranslationKey> = {
  'orange-coral': 'theme.orangeCoral',
  'lime-magenta': 'theme.limeMagenta',
  'cyan-yellow': 'theme.cyanYellow',
  'cobalt-pink': 'theme.cobaltPink',
  'mint-rose': 'theme.mintRose',
  'teal-amber': 'theme.tealAmber',
  'purple-lime': 'theme.purpleLime',
  'scarlet-cyan': 'theme.scarletCyan',
  'yellow-purple': 'theme.yellowPurple',
  'green-orange': 'theme.greenOrange',
  'indigo-peach': 'theme.indigoPeach',
  'turquoise-coral': 'theme.turquoiseCoral',
  'chartreuse-cobalt': 'theme.chartreuseCobalt',
  'pink-mint': 'theme.pinkMint',
  'sky-tangerine': 'theme.skyTangerine',
  'emerald-fuchsia': 'theme.emeraldFuchsia',
  'lavender-chartreuse': 'theme.lavenderChartreuse',
  'rust-sage': 'theme.rustSage',
  'ice-crimson': 'theme.iceCrimson',
  'gold-aqua': 'theme.goldAqua',
  'sage-terracotta': 'theme.sageTerracotta',
  'periwinkle-mauve': 'theme.periwinkleMauve',
  'blue-pink': 'theme.bluePink',
  'orange-violet': 'theme.orangeViolet',
  'electro-lime-fuchsia': 'theme.electroLimeFuchsia',
  'neon-yellow-cyan': 'theme.neonYellowCyan',
};

function ThemeSection({ device }: { device: Device }) {
  const { t, me, updateAccentTheme, updateAccentToxicity } = useApp();
  const activeTheme: ThemeId = isThemeId(me?.accentTheme) ? me.accentTheme : 'orange-coral';
  const activeToxicity: Toxicity = isToxicity(me?.accentToxicity) ? me.accentToxicity : 'bright';

  return (
    <>
      <div className="section-head" style={{ marginTop: 24 }}><h2>{t('settings.toxicity')}</h2></div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>{t('settings.toxicityHint')}</p>
      <PremiumLock>
        <div className="segmented" style={{ marginBottom: 24, maxWidth: 420 }}>
          {TOXICITY_ORDER.map((level) => (
            <button key={level} className={activeToxicity === level ? 'on' : ''} onClick={() => updateAccentToxicity(level)}>
              {t(TOXICITY_LABEL_KEY[level])}
            </button>
          ))}
        </div>
      </PremiumLock>

      <div className="section-head">
        <h2>{t('settings.accentPalette')}</h2>
        <span>{t('settings.colorThemeCount', { count: THEME_ORDER.length, name: t(THEME_NAME_KEY[activeTheme]) })}</span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>{t('settings.accentPaletteHint')}</p>
      <PremiumLock>
        <div style={{ display: 'grid', gridTemplateColumns: device === 'desktop' ? 'repeat(5,1fr)' : 'repeat(2,1fr)', gap: 12 }}>
          {THEME_ORDER.map((id) => {
            const pair = THEME_PAIRS[id][activeToxicity];
            const selected = activeTheme === id;
            return (
              <button
                key={id}
                onClick={() => updateAccentTheme(id)}
                style={{
                  border: selected ? '1px solid var(--accent-border)' : '1px solid var(--line)',
                  background: selected ? 'var(--accent-bg)' : 'var(--bg-legacy)',
                  borderRadius: 12, padding: 11, display: 'flex', flexDirection: 'column', gap: 9,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ height: 42, borderRadius: 8, display: 'flex', overflow: 'hidden' }}>
                  <span style={{ flex: 1, background: pair.lime }} />
                  <span style={{ flex: 1, background: pair.coral }} />
                </div>
                <div style={{ fontFamily: 'var(--font-space-grotesk),sans-serif', fontWeight: 500, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {selected && <span style={{ color: 'var(--lime)' }}>✓</span>}
                  {t(THEME_NAME_KEY[id])}
                </div>
                <div style={{ fontFamily: 'var(--font-ibm-plex-mono),monospace', fontSize: 9.5, color: 'var(--muted-2)' }}>
                  {pair.lime} · {pair.coral}
                </div>
              </button>
            );
          })}
        </div>
      </PremiumLock>
    </>
  );
}

function BannerUploadSection() {
  const { t, updateBanner } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="section-head" style={{ marginTop: 24 }}><h2>{t('settings.profileBanner')}</h2></div>
      <PremiumLock>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={() => inputRef.current?.click()}>{t('settings.uploadBanner')}</button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => updateBanner(reader.result as string);
            reader.readAsDataURL(file);
          }}
        />
      </PremiumLock>
    </>
  );
}

function AppearanceSection({ device }: { device: Device }) {
  const { t } = useApp();
  return (
    <>
      <div className="section-head"><h2>{t('settings.appearance')}</h2></div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>{t('settings.appearanceHint')}</p>
      <div style={{ marginBottom: 24 }}><ThemeToggle /></div>
      <ThemeSection device={device} />
      <BannerUploadSection />
    </>
  );
}

function LanguageRegionSection() {
  const { t, me, language, updateRegion } = useApp();
  const regionCodes = useMemo(() => getRegionCodes(), []);
  if (!me) return null;

  return (
    <>
      <div className="section-head"><h2>{t('profile.region')}</h2><span>{t('profile.regionHint')}</span></div>
      <select className="select-field" style={{ marginBottom: 22 }} value={me.region ?? ''} onChange={(e) => updateRegion(e.target.value || null)}>
        <option value="">{t('profile.regionNone')}</option>
        {regionCodes.map((code) => <option key={code} value={code}>{regionDisplayName(code, language)}</option>)}
      </select>
    </>
  );
}

function ProfileVisibilitySection() {
  const { t, me, updateOpenProfile } = useApp();
  if (!me) return null;
  const isOpen = me.isOpenProfile;

  return (
    <>
      <div className="section-head"><h2>{t('settings.profileVisibility')}</h2></div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {isOpen ? t('settings.profileVisibilityOpenHint') : t('settings.profileVisibilityClosedHint')}
      </p>
      <div className="segmented" style={{ marginBottom: 24, maxWidth: 320 }}>
        <button className={!isOpen ? 'on' : ''} onClick={() => updateOpenProfile(false)}>{t('settings.profileClosed')}</button>
        <button className={isOpen ? 'on' : ''} onClick={() => updateOpenProfile(true)}>{t('settings.profileOpen')}</button>
      </div>
    </>
  );
}

function DeleteAccountBlock() {
  const { t, deleteAccount, showToast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div className="section-head" style={{ marginTop: 28 }}><h2>{t('settings.dangerZone')}</h2></div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>{t('settings.deleteAccountHint')}</p>
      <a href="/privacy" target="_blank" rel="noreferrer" className="settings-summary-link" style={{ display: 'inline-block', marginBottom: 14 }}>
        {t('settings.whatWeStoreLink')}
      </a>
      {!confirming ? (
        <button className="btn-ghost" style={{ width: '100%', color: 'var(--danger, #d05a4a)' }} onClick={() => setConfirming(true)}>
          {t('settings.deleteAccountBtn')}
        </button>
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
          <p style={{ fontSize: 13, marginBottom: 12 }}>{t('settings.deleteAccountConfirm')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setConfirming(false)} disabled={busy}>{t('settings.deleteAccountCancel')}</button>
            <button
              className="btn-primary"
              style={{ flex: 1, margin: 0 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await deleteAccount();
                if (!ok) { setBusy(false); showToast(t('settings.deleteAccountFailed')); }
              }}
            >
              {t('settings.deleteAccountReallyBtn')}
            </button>
          </div>
        </div>
      )}
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
  ];

  const body = (
    <>
      {section === 'appearance' && <AppearanceSection device={device} />}
      {section === 'language' && <LanguageRegionSection />}
      {section === 'account' && (
        <>
          <div className="section-head"><h2>{t('profile.accountSection')}</h2></div>
          <div style={{ marginBottom: 22 }}><AccountBlock /></div>
          <ProfileVisibilitySection />
          <DeleteAccountBlock />
        </>
      )}
      {section === 'connections' && (
        <>
          <div className="section-head"><h2>{t('profile.connection')}</h2><span>Spotify / Apple Music</span></div>
          <div style={{ marginBottom: 12 }}><ConnectBlock /></div>
          {me.connections.spotify && (
            <button className="btn-ghost" style={{ width: '100%', marginBottom: 12 }} onClick={() => syncSpotify()}>{t('profile.syncNow')}</button>
          )}
          <div style={{ marginBottom: 22 }}><ImportHistoryBlock /></div>
        </>
      )}
    </>
  );

  return (
    <>
      <button className="back-btn" onClick={() => goBack('profile')}>{t('friend.back')}</button>
      <div className="eyebrow">{t('settings.eyebrow')}</div>
      <h1 className="page-title">{t('settings.title')}</h1>
      {device === 'desktop' ? (
        <div className="d-profile-layout">
          <div className="side" style={{ width: 220 }}>
            {NAV.map((n) => (
              <button
                key={n.key}
                className={`settings-nav-item ${section === n.key ? 'active' : ''}`}
                onClick={() => setSection(n.key)}
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="main" style={{ maxWidth: 460 }}>{body}</div>
        </div>
      ) : (
        <>
          <div className="chips">
            {NAV.map((n) => (
              <button key={n.key} className={`chip ${section === n.key ? 'on' : ''}`} onClick={() => setSection(n.key)}>{n.label}</button>
            ))}
          </div>
          {body}
        </>
      )}
    </>
  );
}
