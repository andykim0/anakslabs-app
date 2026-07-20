'use client';

import { useEffect } from 'react';
import { ANCHOR_RUNTIME } from '@/lib/motion/anchor-runtime';
import { MOTION_RUNTIME } from '@/lib/motion/runtime';

type RuntimeWindow = Window & {
  __anaksAnchorDispose?: (() => void) | null;
  __anaksMotionDispose?: (() => void) | null;
  __anaksMotionRuntimeReady?: boolean;
  __anaksMotionRuntimeRoots?: Element[] | null;
};

function currentRootsAreBootstrapped(runtimeWindow: RuntimeWindow): boolean {
  if (!runtimeWindow.__anaksMotionRuntimeReady || !runtimeWindow.__anaksMotionDispose) return false;
  const tracked = runtimeWindow.__anaksMotionRuntimeRoots ?? [];
  const current = Array.from(document.querySelectorAll('.anaks-site'));
  return current.length > 0 && current.every((root) => tracked.includes(root));
}

function executeRuntime(source: string, marker: string) {
  const script = document.createElement('script');
  script.dataset.anaksBootstrap = marker;
  script.text = source;
  document.head.appendChild(script);
  script.remove();
}

/**
 * React의 클라이언트 렌더 트리에 script 태그를 두지 않고, 커밋 뒤 바닐라 런타임을 시작한다.
 * 하드 로드에서 같은 루트가 이미 초기화됐다면 실행하지 않으며, SPA 내비게이션으로 루트가
 * 교체된 경우에만 MOTION_RUNTIME의 기존 disposer를 거쳐 새 루트를 다시 연결한다.
 */
export function SiteRuntimeBootstrap({ motion, anchors }: { motion: boolean; anchors: boolean }) {
  useEffect(() => {
    const runtimeWindow = window as RuntimeWindow;
    if (motion && !currentRootsAreBootstrapped(runtimeWindow)) {
      executeRuntime(MOTION_RUNTIME, 'motion');
    }
    if (anchors && !runtimeWindow.__anaksAnchorDispose) {
      executeRuntime(ANCHOR_RUNTIME, 'anchors');
    }
  }, [anchors, motion]);

  return null;
}
