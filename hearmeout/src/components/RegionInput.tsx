'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { getRegionCodes, regionDisplayName } from '@/lib/i18n';

// The prototype's region field: a text input with a <datalist> of country
// names (type to search), not a <select>. The account stores the ISO code,
// so a typed name is matched back to its code when it equals one exactly;
// clearing the field resets the region.
export function RegionInput({ id, style }: { id: string; style?: React.CSSProperties }) {
  const { t, me, language, updateRegion } = useApp();
  const codes = useMemo(() => getRegionCodes(), []);
  const names = useMemo(() => codes.map((c) => [c, regionDisplayName(c, language)] as const), [codes, language]);
  const current = me?.region ? regionDisplayName(me.region, language) : '';
  // What the user is typing; null shows the saved region.
  const [draft, setDraft] = useState<string | null>(null);
  if (!me) return null;

  const commit = (value: string) => {
    const v = value.trim().toLowerCase();
    if (!v) { if (me.region) updateRegion(null); return; }
    const hit = names.find(([, n]) => n.toLowerCase() === v);
    if (hit && hit[0] !== me.region) updateRegion(hit[0]);
  };

  return (
    <>
      <input
        className="field"
        id={id}
        list={`${id}-list`}
        value={draft ?? current}
        placeholder={t('settings.regionSearch')}
        disabled={me.regionAuto && !!me.detectedRegion}
        style={style}
        onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
        onBlur={() => setDraft(null)}
      />
      <datalist id={`${id}-list`}>
        {names.map(([c, n]) => <option key={c} value={n} />)}
      </datalist>
    </>
  );
}
