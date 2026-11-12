'use client';

import { useEffect, useRef, useState } from 'react';
import { whenNear } from './nearViewport';

// Retain readiness across navigation; revisiting a card never clears its image.
export function useNearViewport<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!near && ref.current) return whenNear(ref.current, () => setNear(true));
  }, [near]);
  return [ref, near] as const;
}
