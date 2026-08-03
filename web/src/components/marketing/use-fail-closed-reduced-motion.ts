'use client';

import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Server output remains static until the client explicitly opts into motion. */
export function useFailClosedReducedMotion(): boolean {
  const [reduce, setReduce] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduce;
}
