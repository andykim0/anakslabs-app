'use client';

/**
 * 초안 자동저장 — 마지막 변경 후 2초 디바운스로 PATCH /api/sites/[siteId] { draftConfig }.
 *  - 저장 요청 중 새 변경이 생기면 최신 config까지 반복 저장 (유실 방지)
 *  - 실패 시 saveStatus='error' + 4초 후 자동 재시도
 *  - flush(): 발행/Cmd+S 등에서 즉시 저장. 성공(또는 저장할 것 없음)이면 true
 *  - dirty 상태에서 창을 닫으면 beforeunload 경고
 *
 * 저장 루프 자체는 React에 의존하지 않는 `createDraftSaver`에 있다 — 훅은 스토어 구독과
 * 마운트 수명만 담당한다(디바운스 타이머의 소유자도 saver). 덕분에 디바운스·재시도·
 * 중복 방지 계약을 실제 프로덕션 클로저 그대로 테스트할 수 있다.
 */
import { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '@/stores/editor';
import { saveDraftRequest } from './api';
import type { SiteConfig } from '@/lib/types/site';

export const AUTOSAVE_DEBOUNCE_MS = 2000;
export const AUTOSAVE_RETRY_MS = 4000;

export interface AutosaveHandle {
  /** 즉시 저장. 성공 or 저장할 변경 없음 → true */
  flush: () => Promise<boolean>;
}

export interface DraftSaverDeps {
  /** 기본값은 실제 PATCH. 테스트가 네트워크를 대체할 수 있게 주입 지점을 연다. */
  save?: (siteId: string, draftConfig: SiteConfig) => Promise<unknown>;
  onError?: (err: unknown) => void;
}

export interface DraftSaver {
  /** 즉시 저장 (진행 중이면 그 약속을 그대로 돌려준다 = 중복 요청 없음) */
  run: () => Promise<boolean>;
  /** 디바운스 타이머 재무장 */
  schedule: () => void;
  /** 대기 중인 디바운스만 취소 (재시도 타이머는 유지) */
  cancelScheduled: () => void;
  /** 언마운트 — 디바운스와 재시도 타이머를 모두 정리 */
  dispose: () => void;
}

export function createDraftSaver(siteId: string, deps: DraftSaverDeps = {}): DraftSaver {
  const save = deps.save ?? saveDraftRequest;
  const onError = deps.onError ?? ((err: unknown) => console.error("[editor] Autosave failed:", err));

  let inFlight: Promise<boolean> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const run = (): Promise<boolean> => {
    if (inFlight) return inFlight;

    const p = (async (): Promise<boolean> => {
      try {
        // 저장 중 변경이 생기면 최신본까지 반복 전송
        for (;;) {
          const state = useEditorStore.getState();
          if (!state.dirty) return true;
          const config = state.config;
          const businessInfo = state.businessInfo;
          state.setSaveStatus('saving');
          // [v3 Phase 4] businessInfo는 undo 비추적 필드 — 저장 시 draftConfig로 합성
          await save(siteId, businessInfo ? { ...config, businessInfo } : config);
          const after = useEditorStore.getState();
          if (after.config === config && after.businessInfo === businessInfo) {
            // saved 처리(dirty=false, lastSavedAt 갱신)
            after.setSaveStatus('saved');
            return true;
          }
          // config/businessInfo가 그 사이 바뀜 → 루프 계속
        }
      } catch (err) {
        onError(err);
        useEditorStore.getState().setSaveStatus('error');
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (useEditorStore.getState().dirty) void run();
        }, AUTOSAVE_RETRY_MS);
        return false;
      } finally {
        inFlight = null;
      }
    })();

    inFlight = p;
    return p;
  };

  const cancelScheduled = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  };

  return {
    run,
    schedule: () => {
      cancelScheduled();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void run();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    cancelScheduled,
    dispose: () => {
      cancelScheduled();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    },
  };
}

export function useAutosave(siteId: string): AutosaveHandle {
  /**
   * saver는 마운트당 한 번만 만든다 — in-flight 약속과 재시도 타이머가 그 안에 살기 때문에
   * 재생성하면 진행 중인 저장이 미아가 된다. useMemo가 아니라 useState 지연 초기화를 쓰는
   * 이유도 같다(useMemo는 캐시라 버려질 수 있고, state는 컴포넌트 수명 동안 보장된다).
   * 따라서 saver는 첫 렌더의 siteId를 그대로 붙든다 — 에디터 페이지가 `key={site.id}`로
   * EditorShell을 마운트하므로 사이트가 바뀌면 훅 자체가 새로 마운트된다(같은 인스턴스가
   * 다른 사이트를 저장하는 경로가 없다).
   */
  const [saver] = useState(() => createDraftSaver(siteId));

  const runSave = useCallback(() => saver.run(), [saver]);

  const config = useEditorStore((s) => s.config);
  const businessInfo = useEditorStore((s) => s.businessInfo);
  const dirty = useEditorStore((s) => s.dirty);

  // 디바운스 스케줄링 (businessInfo 변경도 저장 트리거)
  useEffect(() => {
    if (!dirty) return;
    saver.schedule();
    return () => saver.cancelScheduled();
  }, [config, businessInfo, dirty, saver]);

  // 저장 안 된 변경이 있으면 이탈 경고
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      saver.dispose();
    };
  }, [saver]);

  return { flush: runSave };
}
