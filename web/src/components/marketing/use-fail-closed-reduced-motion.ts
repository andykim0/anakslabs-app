'use client';

import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Media must fail closed during hydration. Server output and the first client render both stay
 * static; only a post-mount matchMedia read may opt the browser into motion. This prevents a
 * preload="none" video from being mounted for one frame on reduced-motion clients, without
 * producing different server/client markup during hydration.
 */
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
