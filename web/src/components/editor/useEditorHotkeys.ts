'use client';

/**
 * 에디터 전역 키보드 단축키.
 *  - 화살표: 선택 요소 1px 이동 (Shift=10px), 섹션 범위 클램프
 *  - Delete/Backspace: 선택 요소 삭제
 *  - ⌘/Ctrl+Z: 실행 취소, ⇧⌘Z·Ctrl+Y: 다시 실행
 *  - ⌘/Ctrl+D: 복제, ⌘/Ctrl+S: 즉시 저장, Esc: 선택 해제
 * 입력 필드/인라인 편집 중에는 편집 단축키를 무시한다.
 */
import { useEffect } from 'react';
import { findElementLocation, redoEditor, undoEditor, useEditorStore } from '@/stores/editor';
import { clampFrameToSection } from './snap';

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function isFormTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

export function useEditorHotkeys(onSave: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const inField = isFormTarget(e.target);
      const state = useEditorStore.getState();

      // 저장은 어디서든 브라우저 기본 동작 차단
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
        return;
      }

      if (inField || state.editingElementId) return;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoEditor();
        else undoEditor();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoEditor();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        if (state.selectedElementId) {
          e.preventDefault();
          state.duplicateElement(state.selectedElementId);
        }
        return;
      }

      if (state.preview !== 'off') return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementId) {
        e.preventDefault();
        state.deleteElement(state.selectedElementId);
        return;
      }

      if (e.key === 'Escape') {
        state.clearSelection();
        return;
      }

      const delta = ARROW_DELTAS[e.key];
      if (delta && state.selectedElementId) {
        const loc = findElementLocation(state.config, state.selectedElementId);
        if (!loc || loc.element.locked) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const next = {
          ...loc.element.frame,
          x: loc.element.frame.x + delta[0] * step,
          y: loc.element.frame.y + delta[1] * step,
        };
        state.updateElementFrame(loc.element.id, clampFrameToSection(next, loc.section.height));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSave]);
}
