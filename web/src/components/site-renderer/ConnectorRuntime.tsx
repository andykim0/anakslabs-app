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

    return () => controller.abort();
  }, []);

  return null;
}
