'use client';

/**
 * 캔버스 안의 섹션 1개 — 헤더(이름/상태) + 배경 + 요소들 + 스냅 가이드 + 선택 링.
 * memo: config 변경 시 참조가 바뀐 섹션만 리렌더. 가이드는 별도 컴포넌트가
 * 스토어를 직접 구독해 드래그 중 SectionView 리렌더를 막는다.
 */
import { memo } from 'react';
import type { CSSProperties } from 'react';
import { EyeOff, Lock } from 'lucide-react';
import { DESIGN_WIDTH, type Section, type SiteTheme } from '@/lib/types/site';
import { useEditorStore } from '@/stores/editor';
import { cn } from '@/components/dashboard/ui';
import { SECTION_TYPE_LABELS } from './defaults';
import { ElementView } from './ElementView';

interface SectionViewProps {
  section: Section;
  theme: SiteTheme;
  scale: number;
}

export const SectionView = memo(function SectionView({ section, theme, scale }: SectionViewProps) {
  const sectionSelected = useEditorStore(
    (s) => s.selectedSectionId === section.id && s.selectedElementId === null,
  );
  const selectedElementId = useEditorStore((s) => s.selectedElementId);
  const editingElementId = useEditorStore((s) => s.editingElementId);

  const bg = section.background;
  const width = DESIGN_WIDTH * scale;
  const height = section.height * scale;
  const sorted = [...section.elements].sort((a, b) => a.z - b.z);

  const bgStyle: CSSProperties = {
    backgroundColor: bg.color ?? theme.palette.background,
    backgroundImage: bg.gradient,
  };

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    // 요소가 stopPropagation 하므로 여기 도달 = 빈 배경 클릭
    e.stopPropagation();
    useEditorStore.getState().selectSection(section.id);
  };

  return (
    <div style={{ width }} className={cn(section.hidden && 'opacity-45')}>
      {/* 헤더 (비스케일 UI) */}
      <button
        type="button"
        onClick={() => useEditorStore.getState().selectSection(section.id)}
        className={cn(
          'mb-1.5 flex items-center gap-2 rounded px-1.5 py-0.5 text-[11px] transition-colors',
          sectionSelected ? 'text-[#d9b878]' : 'text-neutral-500 hover:text-neutral-300',
        )}
      >
        <span className="font-semibold">{section.name}</span>
        <span className="text-neutral-600">{SECTION_TYPE_LABELS[section.type]}</span>
        <span className="text-neutral-600 tabular-nums">{Math.round(section.height)}px</span>
        {section.hidden ? <EyeOff className="h-3 w-3" /> : null}
      </button>

      {/* 섹션 바디 */}
      <div
        id={`sec-${section.id}`}
        className="relative"
        style={{ width, height }}
        onPointerDown={handleBodyPointerDown}
      >
        {/* 배경 레이어 (클립) */}
        <div className="absolute inset-0 overflow-hidden" style={bgStyle}>
          {bg.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bg.image.src}
              alt=""
              aria-hidden
              draggable={false}
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
          {bg.image?.overlayColor ? (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: bg.image.overlayColor,
                opacity: bg.image.overlayOpacity ?? 0.45,
              }}
            />
          ) : null}
        </div>

        {/* 요소 레이어 — PPT처럼 섹션 밖으로 나간 부분도 보이게 클립하지 않음 */}
        {sorted.map((el) => (
          <ElementView
            key={el.id}
            element={el}
            sectionId={section.id}
            sectionHeight={section.height}
            theme={theme}
            scale={scale}
            selected={selectedElementId === el.id}
            editing={editingElementId === el.id}
          />
        ))}

        {section.elements.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md border border-dashed border-neutral-600/70 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-400">
              빈 섹션 — 상단 툴바에서 요소를 추가해 보세요
            </span>
          </div>
        ) : null}

        {/* 스냅 가이드 */}
        <GuideOverlay sectionId={section.id} scale={scale} />

        {/* 섹션 선택/기본 테두리 */}
        <div
          className={cn(
            'pointer-events-none absolute -inset-px border',
            sectionSelected ? 'border-[#c8a96a]' : 'border-neutral-800',
          )}
        />
        {section.hidden ? (
          <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded bg-neutral-900/90 px-2 py-1 text-[10px] text-neutral-300">
            <EyeOff className="h-3 w-3" /> 발행 시 숨김
          </div>
        ) : null}
        {section.elements.some((e) => e.locked) ? (
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-neutral-900/70 px-1.5 py-0.5 text-[10px] text-neutral-500">
            <Lock className="h-2.5 w-2.5" /> 잠긴 요소 포함
          </div>
        ) : null}
      </div>
    </div>
  );
});

/** 스냅 가이드라인 — 스토어를 직접 구독해 이 컴포넌트만 리렌더 */
function GuideOverlay({ sectionId, scale }: { sectionId: string; scale: number }) {
  const guides = useEditorStore((s) => (s.guides?.sectionId === sectionId ? s.guides : null));
  if (!guides) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[999]">
      {guides.v.map((x) => (
        <div
          key={`v-${x}`}
          className="absolute top-0 bottom-0 w-px"
          style={{ left: x * scale - 0.5, backgroundColor: '#f472b6' }}
        />
      ))}
      {guides.h.map((y) => (
        <div
          key={`h-${y}`}
          className="absolute right-0 left-0 h-px"
          style={{ top: y * scale - 0.5, backgroundColor: '#f472b6' }}
        />
      ))}
    </div>
  );
}
