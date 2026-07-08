'use client';

/**
 * 초안 자동저장 — 마지막 변경 후 2초 디바운스로 PATCH /api/sites/[siteId] { draftConfig }.
 *  - 저장 요청 중 새 변경이 생기면 최신 config까지 반복 저장 (유실 방지)
 *  - 실패 시 saveStatus='error' + 4초 후 자동 재시도
 *  - flush(): 발행/Cmd+S 등에서 즉시 저장. 성공(또는 저장할 것 없음)이면 true
 *  - dirty 상태에서 창을 닫으면 beforeunload 경고
 */
import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editor';
import { saveDraftRequest } from './api';

const DEBOUNCE_MS = 2000;
const RETRY_MS = 4000;

export interface AutosaveHandle {
  /** 즉시 저장. 성공 or 저장할 변경 없음 → true */
  flush: () => Promise<boolean>;
}

export function useAutosave(siteId: string): AutosaveHandle {
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSave = useCallback((): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;

    const p = (async (): Promise<boolean> => {
      try {
        // 저장 중 변경이 생기면 최신본까지 반복 전송
        for (;;) {
          const state = useEditorStore.getState();
          if (!state.dirty) return true;
          const config = state.config;
          state.setSaveStatus('saving');
          await saveDraftRequest(siteId, config);
          if (useEditorStore.getState().config === config) {
            // saved 처리(dirty=false, lastSavedAt 갱신)
            useEditorStore.getState().setSaveStatus('saved');
            return true;
          }
          // config가 그 사이 바뀜 → 루프 계속
        }
      } catch (err) {
        console.error('[editor] 자동저장 실패:', err);
        useEditorStore.getState().setSaveStatus('error');
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (useEditorStore.getState().dirty) void runSave();
        }, RETRY_MS);
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = p;
    return p;
  }, [siteId]);

  const config = useEditorStore((s) => s.config);
  const dirty = useEditorStore((s) => s.dirty);

  // 디바운스 스케줄링
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void runSave();
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [config, dirty, runSave]);

  // 저장 안 된 변경이 있으면 이탈 경고
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return { flush: runSave };
}
