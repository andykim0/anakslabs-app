'use client';

import { useEffect } from 'react';
import {
  DEMO_VIEW_HEARTBEAT_MS,
  type DemoReferrerClass,
  type DemoViewClientPayload,
} from '@/lib/us-demo/view-tracking-contract';

const VISITOR_KEY = 'daboim_demo_visitor_v1';
const SESSION_PREFIX = 'daboim_demo_session_v1:';
const SECTION_SELECTOR = '[data-us-demo-structure-diff],[data-section-type]';

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? '';
}

function storedId(storage: Storage, key: string): string | undefined {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = randomId();
    if (!created) return undefined;
    storage.setItem(key, created);
    return storage.getItem(key) === created ? created : undefined;
  } catch {
    return undefined;
  }
}

function referrerProjection(raw: string, currentOrigin: string): {
  class: DemoReferrerClass;
  origin: string | null;
} {
  if (!raw) return { class: 'direct', origin: null };
  try {
    const url = new URL(raw);
    if (url.origin === currentOrigin) return { class: 'direct', origin: url.origin };
    const hostname = url.hostname.toLowerCase();
    if (/(^|\.)google\.[a-z.]+$|(^|\.)bing\.com$|(^|\.)search\.yahoo\.com$/u.test(hostname)) {
      return { class: 'search', origin: url.origin };
    }
    if (/(^|\.)(instagram|facebook|linkedin)\.com$/u.test(hostname)) {
      return { class: 'social', origin: url.origin };
    }
    if (/(^|\.)mail\.|(^|\.)outlook\.|(^|\.)gmail\./u.test(hostname)) {
      return { class: 'email', origin: url.origin };
    }
    return { class: 'other', origin: url.origin };
  } catch {
    return { class: 'other', origin: null };
  }
}

function sectionId(element: Element, index: number): string {
  const sectionType = element.getAttribute('data-section-type');
  if (sectionType) return `section:${sectionType}:${index}`;
  return 'structure-diff';
}

export function DemoViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const visitorId = storedId(localStorage, VISITOR_KEY);
    const sessionId = storedId(sessionStorage, `${SESSION_PREFIX}${slug}`);
    const openedAt = new Date();
    const referrer = referrerProjection(document.referrer, location.origin);
    const sectionSeconds = new Map<string, number>();
    const visibleSections = new Set<string>();
    const clicks: Record<string, number> = {};
    let activeSeconds = 0;
    let maxScrollPct = 0;
    let lastTick = performance.now();
    let stopped = false;

    const sectionElements = [...document.querySelectorAll(SECTION_SELECTOR)];
    const sectionIds = new Map(
      sectionElements.map((element, index) => [element, sectionId(element, index)]),
    );
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const id = sectionIds.get(entry.target);
            if (!id) continue;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.35) visibleSections.add(id);
            else visibleSections.delete(id);
          }
        }, { threshold: [0.35] })
      : null;
    sectionElements.forEach((element) => observer?.observe(element));

    const tick = () => {
      const now = performance.now();
      const elapsed = Math.max(0, Math.min(2, (now - lastTick) / 1_000));
      lastTick = now;
      if (document.visibilityState !== 'visible') return;
      activeSeconds += elapsed;
      for (const id of visibleSections) {
        sectionSeconds.set(id, (sectionSeconds.get(id) ?? 0) + elapsed);
      }
    };
    const tickTimer = window.setInterval(tick, 1_000);

    const onScroll = () => {
      const available = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      maxScrollPct = Math.max(maxScrollPct, Math.min(100, (scrollY / available) * 100));
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-demo-track-click]')
        : null;
      const key = target?.dataset.demoTrackClick;
      if (!key || !/^[A-Za-z0-9:_-]{1,80}$/u.test(key)) return;
      clicks[key] = Math.min(100, (clicks[key] ?? 0) + 1);
    };
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, true);
    onScroll();

    const payload = (final: boolean): DemoViewClientPayload => ({
      slug,
      eventId: randomId(),
      ...(visitorId ? { visitorId } : {}),
      ...(sessionId ? { sessionId } : {}),
      openedAt: openedAt.toISOString(),
      localHour: openedAt.getHours(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      activeSeconds: Math.round(activeSeconds),
      maxScrollPct: Math.round(maxScrollPct),
      sections: [...sectionSeconds.entries()].map(([id, seconds]) => ({
        id,
        activeSeconds: Math.round(seconds),
      })),
      clicks,
      referrer,
      isMobile: matchMedia('(max-width: 767px)').matches,
      final,
    });
    const transmit = (final: boolean) => {
      tick();
      const body = JSON.stringify(payload(final));
      if (final && navigator.sendBeacon) {
        if (navigator.sendBeacon('/api/demo-track', new Blob([body], { type: 'text/plain' }))) return;
      }
      void fetch('/api/demo-track', {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body,
        keepalive: final,
        credentials: 'same-origin',
      }).catch(() => undefined);
    };
    const heartbeat = window.setInterval(() => transmit(false), DEMO_VIEW_HEARTBEAT_MS);
    const initial = window.setTimeout(() => transmit(false), 1_000);
    const finalize = () => {
      if (stopped) return;
      stopped = true;
      transmit(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') finalize();
      else lastTick = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('pagehide', finalize, { once: true });

    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(heartbeat);
      window.clearTimeout(initial);
      observer?.disconnect();
      removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('pagehide', finalize);
    };
  }, [slug]);

  return null;
}
