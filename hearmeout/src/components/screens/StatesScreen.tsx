'use client';

import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { MascotIcon } from '../redesign/icons';

// States reference screen (spec 3.13/6.11): loading, empty and error
// patterns in one place, reached from Settings → Appearance → Extras ("View
// loading, empty and error states"). Not a real list — just the three
// patterns every list/tile elsewhere in the app reuses.
export function StatesScreen(_props: { device: Device }) {
  const { t, goBack, showScreen } = useApp();

  return (
    <>
      <button className="crumb" onClick={() => goBack('settings')}>‹ {t('settings.title')}</button>
      <div className="eyebrow">{t('states.eyebrow')}</div>
      <h1 className="big">{t('states.title')}</h1>

      <div className="bento b3">
        <div className="tile">
          <small className="muted" style={{ fontWeight: 800 }}>{t('states.loadingCaption')}</small>
          <div className="row" style={{ marginTop: 14 }}>
            <div className="sk" style={{ width: 88, height: 88, flex: 'none' }} />
            <div className="g" style={{ display: 'grid', gap: 8 }}>
              <div className="sk" style={{ height: 16, width: '70%' }} />
              <div className="sk" style={{ height: 14, width: '45%' }} />
              <div className="sk" style={{ height: 14, width: '55%' }} />
            </div>
          </div>
          <div className="sk" style={{ height: 36, width: 120, marginTop: 14, borderRadius: 99 }} />
        </div>

        <div className="tile t-soft2 empty">
          <small className="muted" style={{ fontWeight: 800 }}>{t('states.emptyCaption')}</small>
          <MascotIcon />
          <h3>{t('states.emptyTitle')}</h3>
          <p className="muted">{t('states.emptyHint')}</p>
          <button className="btn" onClick={() => showScreen('discover')}>{t('states.emptyCta')}</button>
        </div>

        <div className="tile t-pop empty">
          <small style={{ fontWeight: 800 }}>{t('states.errorCaption')}</small>
          <span className="num" style={{ fontSize: 54 }}>!</span>
          <h3>{t('states.errorTitle')}</h3>
          <p className="muted">{t('states.errorHint')}</p>
          <button className="btn">{t('states.errorCta')}</button>
        </div>
      </div>
    </>
  );
}
