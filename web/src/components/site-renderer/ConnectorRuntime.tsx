'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    Kakao?: {
      init(key: string): void;
      isInitialized(): boolean;
      Channel?: { chat(input: { channelPublicId: string }): void };
    };
    naver?: {
      maps: {
        Map: new (element: HTMLElement, options: Record<string, unknown>) => unknown;
        LatLng: new (latitude: number, longitude: number) => unknown;
      };
    };
  }
}

const KAKAO_SDK_URL = 'https://developers.kakao.com/sdk/js/kakao.min.js';
const NAVER_MAP_SDK_URL = 'https://oapi.map.naver.com/openapi/v3/maps.js';

function loadScript(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === '1') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', () => reject(new Error('CONNECTOR_SDK_LOAD_FAILED')), { once: true });
    if (!existing) {
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });
}

function renderInstagramItems(
  container: HTMLElement,
  payload: {
    items?: Array<{ renditionUrl?: string; permalink?: string; alt?: string }>;
  },
): void {
  const items = (payload.items ?? []).filter((item) => item.renditionUrl && item.permalink).slice(0, 6);
  if (!items.length) return;
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const link = document.createElement('a');
    link.href = item.permalink!;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'anaks-connector__instagram-item';
    const image = document.createElement('img');
    image.src = item.renditionUrl!;
    image.alt = item.alt || '인스타그램 게시물';
    image.loading = 'lazy';
    image.decoding = 'async';
    link.append(image);
    fragment.append(link);
  });
  container.replaceChildren(fragment);
  container.dataset.loaded = '1';
}

export function ConnectorRuntime() {
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const onClick = async (event: MouseEvent) => {
      const target = event.target as Element | null;
      const kakao = target?.closest<HTMLAnchorElement>('a[data-kakao-channel-id][data-kakao-js-key]');
      if (kakao) {
        const key = kakao.dataset.kakaoJsKey;
        const channelPublicId = kakao.dataset.kakaoChannelId;
        if (!key || !channelPublicId) return;
        event.preventDefault();
        try {
          await loadScript('daboim-kakao-sdk', KAKAO_SDK_URL);
          if (!window.Kakao) throw new Error('KAKAO_SDK_UNAVAILABLE');
          if (!window.Kakao.isInitialized()) window.Kakao.init(key);
          window.Kakao.Channel?.chat({ channelPublicId });
        } catch {
          window.location.assign(kakao.href);
        }
        return;
      }

      const mapButton = target?.closest<HTMLButtonElement>('button[data-naver-map-preview]');
      if (!mapButton) return;
      const clientId = mapButton.dataset.naverClientId;
      const latitude = Number(mapButton.dataset.latitude);
      const longitude = Number(mapButton.dataset.longitude);
      const mapId = mapButton.dataset.mapTarget;
      if (!clientId || !mapId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      mapButton.disabled = true;
      try {
        await loadScript(
          'daboim-naver-map-sdk',
          `${NAVER_MAP_SDK_URL}?ncpKeyId=${encodeURIComponent(clientId)}`,
        );
        const element = document.getElementById(mapId);
        if (!window.naver?.maps || !element) throw new Error('NAVER_MAP_SDK_UNAVAILABLE');
        const center = new window.naver.maps.LatLng(latitude, longitude);
        new window.naver.maps.Map(element, { center, zoom: 16 });
        element.hidden = false;
      } catch {
        mapButton.disabled = false;
      }
    };
    document.addEventListener('click', onClick, { signal });

    const feeds = Array.from(document.querySelectorAll<HTMLElement>('[data-instagram-feed-endpoint]'));
    const loadFeed = async (feed: HTMLElement) => {
      if (feed.dataset.loading === '1' || feed.dataset.loaded === '1') return;
      const endpoint = feed.dataset.instagramFeedEndpoint;
      if (!endpoint) return;
      feed.dataset.loading = '1';
      try {
        const response = await fetch(endpoint, { credentials: 'omit', cache: 'no-store' });
        if (!response.ok) return;
        renderInstagramItems(feed, await response.json() as Parameters<typeof renderInstagramItems>[1]);
      } catch {
        // 프로필 카드가 정적 폴백이므로 실패를 표면에 노출하지 않는다.
      } finally {
        delete feed.dataset.loading;
      }
    };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
          observer.unobserve(entry.target);
          void loadFeed(entry.target as HTMLElement);
        });
      }, { rootMargin: '160px' });
      feeds.forEach((feed) => observer.observe(feed));
      signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    }

    return () => controller.abort();
  }, []);

  return null;
}
