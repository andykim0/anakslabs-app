'use client';

import { useEffect } from 'react';

type HashTargetLookup = (id: string) => HTMLElement | null;

interface FaqHashConnection {
  readHash(): string;
  lookup: HashTargetLookup;
  subscribe(listener: () => void): () => void;
}

export function openFaqDetailsForHash(
  hash: string,
  lookup: HashTargetLookup = (id) => document.getElementById(id),
): boolean {
  const rawId = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!rawId) return false;

  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return false;
  }

  const target = lookup(id);
  if (!target || target.tagName !== 'DETAILS') return false;
  (target as HTMLDetailsElement).open = true;
  return true;
}

export function connectFaqHashOpener(connection: FaqHashConnection): () => void {
  const openCurrentHash = () => openFaqDetailsForHash(connection.readHash(), connection.lookup);
  openCurrentHash();
  return connection.subscribe(openCurrentHash);
}

export function FaqHashOpener() {
  useEffect(() => connectFaqHashOpener({
    readHash: () => window.location.hash,
    lookup: (id) => document.getElementById(id),
    subscribe: (listener) => {
      window.addEventListener('hashchange', listener);
      return () => window.removeEventListener('hashchange', listener);
    },
  }), []);

  return null;
}
