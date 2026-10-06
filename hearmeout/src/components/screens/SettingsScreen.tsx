'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { regionDisplayName, toLocale, LANGUAGES, LANGUAGE_LABEL, type Language, type TranslationKey } from '@/lib/i18n';
import { PALETTES, type Design, type Mode } from '@/lib/palettes';
import { exportRatingsCsv } from '@/lib/csvExport';
import { ConnectionRows, ImportTile } from '../ConnectionBlocks';
import { RegionInput } from '../RegionInput';

type Section = 'appearance' | 'language' | 'account' | 'connections' | 'privacy';

// Settings (spec 7.1 / vSettings() in reference/app.js): tabs on the left,
// one section of tiles on the right. Every switch row is sw(), every
// segmented row is segc() — title + hint on the left, control on the right.

function Sw({ title, hint, on, onToggle, disabled }: { title: string; hint: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className="setrow">
      <div><b>{title}</b><small className="muted">{hint}</small></div>
      <button className="sw" role="switch" aria-checked={on} aria-label={title} disabled={disabled} onClick={onToggle}><i /></button>
    </div>
  );
}

export function Segc<T extends string>({ title, hint, value, options, onPick }: { title: string; hint: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="setrow">
      <div><b>{title}</b><small className="muted">{hint}</small></div>
      <div className="seg" role="group" aria-label={title}>
        {options.map(([v, label]) => (
          <button key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onPick(v)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// pvHtml(): a miniature of the site in that design and the current mode.
export function DesignPreview({ design, mode }: { design: Design; mode: 'light' | 'dark' }) {
  return (
    <div className="pv site" data-design={design} data-mode={mode} data-v={design === 'toxic' ? 'v3' : 'v1'}>
      <div className="col">
        <div className="nv" />
        <div className="tk" />
        <div className="rw"><i className="i1" /><i className="i2" /></div>
        <div className="rw"><i className="i3" /><i className="i3" /><i className="i3" /></div>
        <div className="pl" />
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { t, me, updateAppearance, showScreen } = useApp();
  if (!me) return null;
  const effectiveMode: 'light' | 'dark' = me.mode === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : me.mode;
  const DESIGNS: [Design, string, TranslationKey][] = [
    ['cream-pop', 'Cream Pop', 'settings.designCreamHint'],
    ['toxic', 'Toxic', 'settings.designToxicHint'],
  ];
  const palBtn = (p: (typeof PALETTES)[number]) => (
    <button key={p.id} className="palbtn" role="radio" aria-checked={me.palette === p.id} onClick={() => updateAppearance({ palette: p.id })}>
      <span className="sws" data-palette={p.id}>
        <i style={{ background: 'var(--ink)' }} /><i style={{ background: 'var(--ac)' }} /><i style={{ background: 'var(--pop)' }} /><i style={{ background: 'var(--hi)' }} />
      </span>
      <span>{p.name}</span>
    </button>
  );
  return (
    <>
      <div className="tile">
        <h2>{t('settings.design')}</h2>
        <p className="muted" style={{ margin: '-4px 0 16px', fontWeight: 600 }}>{t('settings.designHint')}</p>
        <div className="optgrid" role="radiogroup" aria-label={t('settings.design')}>
          {DESIGNS.map(([id, name, hint]) => (
            <button key={id} className="optcard" role="radio" aria-checked={me.design === id} onClick={() => updateAppearance({ design: id })}>
              <span className="chk">✓</span>
              <DesignPreview design={id} mode={effectiveMode} />
              <b>{name}</b>
              <small className="muted" style={{ fontWeight: 600 }}>{t(hint)}</small>
            </button>
          ))}
        </div>
        <Segc<Mode>
          title={t('settings.mode')}
          hint={t('settings.modeHint')}
          value={me.mode}
          options={[['light', t('settings.light')], ['dark', t('settings.dark')], ['system', t('settings.system')]]}
          onPick={(m) => updateAppearance({ mode: m })}
        />
      </div>

      <div className="tile" style={{ marginTop: 14 }}>
        <h2>{t('settings.colorPalette')}</h2>
        <p className="muted" style={{ margin: '-4px 0 16px', fontWeight: 600 }}>{t('settings.paletteHint')}</p>
        <p className="palgroup">{t('settings.paletteClassic')}</p>
        <div className="palgrid" role="radiogroup" aria-label={t('settings.colorPalette')}>{PALETTES.filter((p) => p.group === 'classic').map(palBtn)}</div>
        <p className="palgroup">{t('settings.paletteNeon')}</p>
        <div className="palgrid">{PALETTES.filter((p) => p.group === 'neon').map(palBtn)}</div>
      </div>

      <div className="tile" style={{ marginTop: 14 }}>
        <h2>{t('settings.extras')}</h2>
        <Sw title={t('settings.activityStrip')} hint={t('settings.activityStripHint')} on={me.tickerEnabled} onToggle={() => updateAppearance({ tickerEnabled: !me.tickerEnabled })} />
        <Sw title={t('settings.animations')} hint={t('settings.animationsHint')} on={me.motionEnabled} onToggle={() => updateAppearance({ motionEnabled: !me.motionEnabled })} />
        <div className="acts"><button className="btn ghost" onClick={() => showScreen('states')}>{t('settings.viewStates')}</button></div>
      </div>
    </>
  );
}

// Weekday name in the interface language (0 = Sunday), from Intl rather
// than a dictionary key per day. 4 Jan 2026 is a Sunday.
function weekdayName(day: number, language: Language): string {
  const name = new Date(Date.UTC(2026, 0, 4 + day)).toLocaleDateString(toLocale(language), { weekday: 'long', timeZone: 'UTC' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function LanguageTab() {
  const { t, me, language, updateLanguage, updateRegionAuto, updateAppearance } = useApp();
  if (!me) return null;
  const autoHint = !me.regionAuto ? t('settings.regionAutoHint')
    : me.detectedRegion ? t('settings.regionAutoDetected', { country: regionDisplayName(me.detectedRegion, language) })
    : me.connections.spotify ? t('settings.regionAutoReconnect') : t('settings.regionAutoConnect');
  return (
    <>
      <div className="tile">
        <h2>{t('settings.language')}</h2>
        <p className="muted" style={{ margin: '-4px 0 6px', fontWeight: 600 }}>{t('settings.languageHint')}</p>
        <div className="chips" style={{ marginTop: 12 }} role="radiogroup" aria-label={t('settings.language')}>
          {LANGUAGES.map((l) => (
            <button key={l} className={`chip${language === l ? ' on' : ''}`} role="radio" aria-checked={language === l} onClick={() => updateLanguage(l)}>{LANGUAGE_LABEL[l]}</button>
          ))}
        </div>
        <Segc<'24' | '12'>
          title={t('settings.timeFormat')}
          hint={t('settings.timeFormatHint')}
          value={me.timeFormat}
          options={[['24', t('settings.hour24')], ['12', t('settings.hour12')]]}
          onPick={(v) => updateAppearance({ timeFormat: v })}
        />
        <Segc<'mon' | 'sun'>
          title={t('settings.weekStart')}
          hint={t('settings.weekStartHint')}
          value={me.weekStart}
          options={[['mon', weekdayName(1, language)], ['sun', weekdayName(0, language)]]}
          onPick={(v) => updateAppearance({ weekStart: v })}
        />
      </div>

      <div className="tile" style={{ marginTop: 14 }}>
        <h2>{t('profile.region')}</h2>
        <p className="muted" style={{ margin: '-4px 0 6px', fontWeight: 600 }}>{t('settings.regionHint')}</p>
        <Sw title={t('settings.regionAuto')} hint={autoHint} on={me.regionAuto} onToggle={() => updateRegionAuto(!me.regionAuto)} />
        <div className="setrow">
          <div style={{ flex: 1 }}>
            <label htmlFor="region">{t('profile.region')}</label>
            <RegionInput id="region" style={{ maxWidth: 340 }} />
          </div>
        </div>
      </div>
    </>
  );
}

function AccountTab() {
  const { t, me, updateProfileName, claimAccount, logout, replayOnboarding, deleteAccount, showToast } = useApp();
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recErr, setRecErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState('');
  if (!me) return null;
  const handle = me.handle.replace(/^@/, '');

  const copyHandle = () => {
    try {
      navigator.clipboard.writeText(`@${handle}`).then(() => showToast(t('profile.handleCopied')), () => showToast(`@${handle}`));
    } catch {
      showToast(`@${handle}`);
    }
  };
  const saveRecovery = async () => {
    setRecErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setRecErr(t('register.invalidEmail')); return; }
    if (password.length < 8) { setRecErr(t('register.weakPassword')); return; }
    setBusy(true);
    try {
      await claimAccount(email.trim(), password);
      showToast(t('profile.passwordSetSuccess'));
      setEmail(''); setPassword('');
    } catch (err) {
      setRecErr(err instanceof Error && err.message === 'email_taken' ? t('profile.claimEmailTaken') : t('profile.claimFailed'));
    } finally {
      setBusy(false);
    }
  };
  const saveChanges = async () => {
    if (name.trim() === me.name) { showToast(t('settings.nothingChanged')); return; }
    if (!(await updateProfileName(name))) setName(me.name);
  };

  return (
    <>
      <div className="tile">
        <h2>{t('profile.accountSection')}</h2>
        <div className="setrow">
          <div><b>{t('profile.yourId')}</b><small className="muted">@{handle} · {t('settings.editOnProfile')}</small></div>
          <button className="btn ghost" onClick={copyHandle}>{t('profile.copyHandle')}</button>
        </div>
        <div className="setrow">
          <div style={{ flex: 1 }}>
            <label htmlFor="nm">{t('profile.displayName')}</label>
            <input className="field" id="nm" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 360 }} />
          </div>
        </div>
        {!me.hasPassword ? (
          <div className="setrow" style={{ display: 'block' }}>
            <b>{t('settings.setPasswordEmail')}</b>
            <small className="muted">{t('settings.setPasswordEmailHint')}</small>
            <div className="acts">
              <input className="field" type="email" placeholder="you@mail.com" style={{ maxWidth: 260 }} value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t('profile.emailLabel')} />
              <input className="field" type="password" placeholder={t('settings.passwordPlaceholder')} style={{ maxWidth: 260 }} value={password} onChange={(e) => setPassword(e.target.value)} aria-label={t('settings.passwordPlaceholder')} />
              <button className="btn" disabled={busy} onClick={saveRecovery}>{t('profile.passwordSetSubmit')}</button>
            </div>
            <p className="ferr" role="alert">{recErr}</p>
          </div>
        ) : (
          <div className="setrow">
            <div><b>{t('settings.recoveryEmail')}</b><small className="muted">{me.email || t('settings.noRecoveryEmail')}</small></div>
            <span className="tag">{t('settings.passwordSetTag')}</span>
          </div>
        )}
        <div className="setrow">
          <div><b>{t('settings.replayOnboarding')}</b><small className="muted">{t('settings.replayOnboardingHint')}</small></div>
          <button className="btn ghost" onClick={replayOnboarding}>{t('settings.replayOnboardingBtn')}</button>
        </div>
        <div className="acts">
          <button className="btn" onClick={saveChanges}>{t('settings.saveChanges')}</button>
          <button className="btn ghost" onClick={() => logout()}>{t('settings.menuSignOut')}</button>
        </div>
      </div>

      <div className="tile" style={{ marginTop: 14 }}>
        <h2>{t('settings.deleteAccountTitle')}</h2>
        <p className="muted" style={{ fontWeight: 600 }}>{t('settings.deleteAccountHint')}</p>
        {delOpen ? (
          <div className="acts">
            <input className="field" placeholder={t('settings.deleteAccountTypeDelete')} aria-label={t('settings.deleteAccountTypeDelete')} style={{ maxWidth: 280 }} value={delText} onChange={(e) => setDelText(e.target.value)} />
            <button className="btn danger" disabled={busy || delText !== 'DELETE'} onClick={async () => {
              setBusy(true);
              const ok = await deleteAccount();
              if (!ok) { setBusy(false); showToast(t('settings.deleteAccountFailed')); }
            }}>{t('settings.deleteForever')}</button>
            <button className="btn ghost" onClick={() => { setDelOpen(false); setDelText(''); }}>{t('settings.deleteAccountCancel')}</button>
          </div>
        ) : (
          <div className="acts"><button className="btn ghost" onClick={() => setDelOpen(true)}>{t('settings.deleteAccountOpen')}</button></div>
        )}
      </div>
    </>
  );
}

function ConnectionsTab() {
  const { t } = useApp();
  return (
    <>
      <div className="tile">
        <h2>{t('settings.streamingAccounts')}</h2>
        <p className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>{t('settings.streamingAccountsHint')}</p>
        <ConnectionRows />
        <p className="muted" style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{t('settings.betaNotice')}</p>
      </div>
      <div style={{ marginTop: 14 }}><ImportTile /></div>
    </>
  );
}

function PrivacyTab() {
  const { t, me, updatePrivacy, updateOpenProfile, myRatings, albums, liveAlbums } = useApp();
  if (!me) return null;
  const isPrivate = !me.isOpenProfile;
  return (
    <div className="tile">
      <h2>{t('settings.privacy')}</h2>
      <Sw title={t('settings.privateProfile')} hint={t('settings.privateProfileHint')} on={isPrivate} onToggle={() => updateOpenProfile(isPrivate)} />
      <Sw title={t('settings.ratingsVisible')} hint={t('settings.ratingsVisibleHint')} on={!!me.ratingsVisible} onToggle={() => updatePrivacy({ ratingsVisible: !me.ratingsVisible })} />
      <Sw title={t('settings.shareLive')} hint={t('settings.shareLiveHint')} on={!!me.shareLive} onToggle={() => updatePrivacy({ shareLive: !me.shareLive })} />
      <Sw title={t('settings.publicReviews')} hint={t('settings.publicReviewsHint')} on={!!me.publicReviews} onToggle={() => updatePrivacy({ publicReviews: !me.publicReviews })} />
      <Sw title={t('settings.discoverable')} hint={t('settings.discoverableHint')} on={!!me.discoverable} onToggle={() => updatePrivacy({ discoverable: !me.discoverable })} />
      <div className="acts">
        {/* Same ratings CSV as History's own export button (prototype doCsv()). */}
        <button className="btn ghost" disabled={!myRatings.length} onClick={() => exportRatingsCsv(myRatings, (id) => liveAlbums[id] || albums.find((x) => x.id === id))}>{t('settings.exportMyData')}</button>
        <a className="btn ghost" href="/privacy" target="_blank" rel="noreferrer">{t('landing.whatWeStore')}</a>
      </div>
    </div>
  );
}

export function SettingsScreen(_props: { device: Device }) {
  const { t, me } = useApp();
  const [section, setSection] = useState<Section>('appearance');
  if (!me) return null;

  const NAV: { key: Section; label: string }[] = [
    { key: 'appearance', label: t('settings.appearance') },
    { key: 'language', label: t('settings.languageRegion') },
    { key: 'account', label: t('profile.accountSection') },
    { key: 'connections', label: t('settings.connections') },
    { key: 'privacy', label: t('settings.privacy') },
  ];

  return (
    <>
      <p className="eyebrow muted">{t('settings.eyebrow')}</p>
      <h1 className="big">{t('settings.title')}</h1>
      <div className="setgrid">
        <div className="stabs" role="tablist" aria-label={t('settings.sectionsAria')}>
          {NAV.map((n) => (
            <button key={n.key} role="tab" aria-selected={section === n.key} className={section === n.key ? 'on' : ''} onClick={() => setSection(n.key)}>{n.label}</button>
          ))}
        </div>
        <div>
          {section === 'appearance' && <AppearanceTab />}
          {section === 'language' && <LanguageTab />}
          {section === 'account' && <AccountTab />}
          {section === 'connections' && <ConnectionsTab />}
          {section === 'privacy' && <PrivacyTab />}
        </div>
      </div>
    </>
  );
}
