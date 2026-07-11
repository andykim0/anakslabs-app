'use client';

/**
 * 중앙 캔버스 스테이지.
 *  - 편집: 섹션들을 실제 사이트처럼 간격 없이 이어 붙인 "연속 페이지" 한 장으로 렌더
 *    (슬라이드식 분할 금지). zoom(fit / 50~150%) 배율 적용.
 *  - 컨테이너 폭을 ResizeObserver로 측정해 fit 배율 계산 → 스토어(fitScale) 공유.
 *  - 빈 곳 클릭 = 선택 해제.
 *  - 프리뷰(desktop/mobile): SiteRenderer로 발행본과 동일한 출력 — 등장 애니메이션
 *    재생 + 버튼(#앵커 스크롤·외부 링크는 새 탭) 동작.
 */
import { useEffect, useRef, useState } from 'react';
import { Eye, Plus, Smartphone } from 'lucide-react';
import { DESIGN_WIDTH } from '@/lib/types/site';
import { useEditorStore } from '@/stores/editor';
import { SiteRenderer } from '@/components/site-renderer';
import { SectionView } from './SectionView';
import { ThemeFonts } from './ThemeFonts';

const STAGE_PADDING = 48;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.5;

/** 프리뷰에서 링크 클릭 처리 — 에디터를 떠나지 않게 외부는 새 탭, 경로는 차단, #앵커는 통과 */
function handlePreviewClickCapture(e: React.MouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (/^https?:\/\//i.test(href)) {
    e.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
  } else if (href.startsWith('/')) {
    // 발행 도메인 기준 상대 경로 — 프리뷰(대시보드 오리진)에선 이동하지 않음
    e.preventDefault();
  }
  // '#앵커'는 기본 동작 = 프리뷰 안에서 해당 섹션으로 스크롤, mailto:/tel:도 통과
}

export function CanvasStage() {
  const config = useEditorStore((s) => s.config);
  const zoom = useEditorStore((s) => s.zoom);
  const preview = useEditorStore((s) => s.preview);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.6);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const available = el.clientWidth - STAGE_PADDING * 2;
      const next = Math.min(1, Math.max(0.15, available / DESIGN_WIDTH));
      const rounded = Math.round(next * 1000) / 1000;
      setFit(rounded);
      useEditorStore.getState().setFitScale(rounded);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = zoom === 'fit' ? fit : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

  const handleBgPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.dataset.canvasBg === '1') useEditorStore.getState().clearSelection();
  };

  if (preview === 'mobile') {
    return (
      <div className="flex min-w-0 flex-1 items-start justify-center overflow-auto bg-[#111] py-8">
        <div className="flex flex-col items-center gap-3">
          <p className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Smartphone className="h-3.5 w-3.5" />
            모바일 미리보기 — 요소가 y좌표 순으로 자동 스택됩니다
          </p>
          <div
            className="h-[720px] w-[390px] overflow-y-auto rounded-[28px] border-4 border-neutral-700 bg-black shadow-2xl"
            onClickCapture={handlePreviewClickCapture}
          >
            <SiteRenderer config={config} mode="mobile" />
          </div>
        </div>
      </div>
    );
  }

  if (preview === 'desktop') {
    return (
      <div className="min-w-0 flex-1 overflow-y-auto bg-[#111]" onClickCapture={handlePreviewClickCapture}>
        <p className="flex items-center justify-center gap-1.5 py-2.5 text-xs text-neutral-400">
          <Eye className="h-3.5 w-3.5" />
          미리보기 — 발행본과 동일하게 등장 애니메이션·버튼이 동작합니다 (외부 링크는 새 탭)
        </p>
        <div className="mx-auto max-w-[1440px] shadow-2xl">
          <SiteRenderer config={config} mode="desktop" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-canvas-bg="1"
      className="relative min-w-0 flex-1 overflow-auto bg-[#111]"
      onPointerDown={handleBgPointerDown}
    >
      <ThemeFonts theme={config.theme} />
      <div
        data-canvas-bg="1"
        className="mx-auto flex w-max min-w-full flex-col items-center"
        style={{ padding: STAGE_PADDING }}
      >
        {/* 연속 페이지 시트 — 섹션이 간격 없이 이어 붙는 실제 사이트 모습 그대로 */}
        {config.sections.length > 0 ? (
          <div className="shadow-2xl ring-1 ring-neutral-800" style={{ width: DESIGN_WIDTH * scale }}>
            {config.sections.map((section) => (
              <SectionView key={section.id} section={section} theme={config.theme} scale={scale} />
            ))}
          </div>
        ) : null}

        {config.sections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 px-14 py-16 text-center">
            <p className="text-sm font-medium text-neutral-300">아직 섹션이 없습니다</p>
            <p className="text-xs text-neutral-500">히어로 섹션부터 시작해 보세요.</p>
            <button
              type="button"
              onClick={() => useEditorStore.getState().addSection('hero')}
              className="mt-1 flex h-9 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-xs font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              <Plus className="h-3.5 w-3.5" /> 히어로 섹션 추가
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
