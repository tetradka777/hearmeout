'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { whenNear } from './nearViewport';
import { RowImagesContext } from './RowImagesContext';

// Retain readiness across navigation; revisiting a card never clears its image.
export function useNearViewport<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  const ready = useContext(RowImagesContext);
  useEffect(() => {
    if (!near && !ready && ref.current) return whenNear(ref.current, () => setNear(true));
  }, [near, ready]);
  return [ref, near || ready] as const;
}
