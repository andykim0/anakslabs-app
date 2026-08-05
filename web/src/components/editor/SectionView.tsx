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
    // 연속 캔버스: 섹션은 실제 사이트처럼 간격 없이 이어 붙는다 — 슬라이드식 분할 UI 금지.
    // 구조(이름/순서/높이) 조작은 좌측 SectionListPanel·인스펙터가 담당하고,
    // 캔버스에는 호버/선택 시에만 경계·이름 오버레이를 띄운다.
    <div
      id={`sec-${section.id}`}
      className={cn('group/section relative', section.hidden && 'opacity-45')}
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
            <span className="rounded-md border border-dashed border-[#AEBACC]/70 bg-white/90 px-3 py-1.5 text-xs text-[#545C70]">
              Empty section — add elements from the top toolbar
            </span>
          </div>
        ) : null}

      {/* 스냅 가이드 */}
      <GuideOverlay sectionId={section.id} scale={scale} />

      {/* 경계 오버레이 — 호버/선택 시에만 (연속 페이지 위에 얇게) */}
      <div
        className={cn(
          'pointer-events-none absolute -inset-px z-[997] border transition-opacity',
          sectionSelected
            ? 'border-[#2D63F0] opacity-100'
            : 'border-sky-500/35 opacity-0 group-hover/section:opacity-100',
        )}
      />
      {/* 섹션 이름 칩 — 호버/선택 시에만 */}
      <div
        className={cn(
          'pointer-events-none absolute top-1.5 left-1.5 z-[998] flex items-center gap-1.5 rounded bg-white/95 px-1.5 py-0.5 text-[10px] transition-opacity',
          sectionSelected ? 'text-[#2D63F0] opacity-100' : 'text-[#344054] opacity-0 group-hover/section:opacity-100',
        )}
      >
        <span className="font-semibold">{section.name}</span>
        <span className="text-[#6a7286]">{SECTION_TYPE_LABELS[section.type]}</span>
        <span className="text-[#6a7286] tabular-nums">{Math.round(section.height)}px</span>
        {section.hidden ? <EyeOff className="h-3 w-3" /> : null}
      </div>
      {section.hidden ? (
        <div className="pointer-events-none absolute top-2 right-2 z-[998] flex items-center gap-1 rounded bg-white/95 px-2 py-1 text-[10px] text-[#344054]">
          <EyeOff className="h-3 w-3" /> Hidden when published
        </div>
      ) : null}
      {section.elements.some((e) => e.locked) ? (
        <div className="pointer-events-none absolute right-2 bottom-2 z-[998] flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-[#6a7286]">
          <Lock className="h-2.5 w-2.5" /> Contains locked elements
        </div>
      ) : null}
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
