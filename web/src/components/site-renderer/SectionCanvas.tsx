/**
 * 데스크톱(캔버스) 섹션 렌더 — DESIGN_WIDTH(1440) 기준 자유배치를
 * cqw 단위로 환산해 컨테이너 폭에 비례 스케일.
 */
import type { CSSProperties } from 'react';
import type { Section, SiteTheme } from '@/lib/types/site';
import { cqw } from './scale';
import { ElementContent } from './ElementContent';

interface SectionCanvasProps {
  section: Section;
  theme: SiteTheme;
  /** 첫 섹션(히어로)이면 이미지 eager 로딩 */
  isFirst?: boolean;
  /** false면 버튼을 비대화형으로 (미리보기 앵커 중첩 방지) */
  interactive?: boolean;
  /** [v3 Phase 3] 문의 폼 제출 대상 — 실서빙에서만 전달 */
  siteId?: string;
}

export function SectionCanvas({ section, theme, isFirst, interactive = true, siteId }: SectionCanvasProps) {
  const bg = section.background;
  // z 오름차순 정렬 — zIndex와 DOM 순서를 일치시켜 페인트 순서 결정적으로
  const elements = [...section.elements].sort((a, b) => a.z - b.z);

  const sectionStyle: CSSProperties = {
    position: 'relative',
    height: cqw(section.height),
    overflow: 'hidden',
    // 배경 미지정 섹션은 테마 배경 상속 → 섹션 간 이음새 없이 연속
    backgroundColor: bg.color ?? theme.palette.background,
    backgroundImage: bg.gradient,
  };

  return (
    // id: 버튼 앵커(#sec-…) 타깃. auto 모드에서 stack과 중복되지 않도록 canvas에만 부여
    <section id={section.id} data-section-type={section.type} style={sectionStyle}>
      {bg.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg.image.src}
          alt=""
          aria-hidden
          loading={isFirst ? 'eager' : 'lazy'}
          decoding="async"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
      {bg.image?.overlayColor && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: bg.image.overlayColor,
            opacity: bg.image.overlayOpacity ?? 0.45,
          }}
        />
      )}
      {elements.map((el) => (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: cqw(el.frame.x),
            top: cqw(el.frame.y),
            width: cqw(el.frame.w),
            height: cqw(el.frame.h),
            zIndex: el.z,
            opacity: el.opacity,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          }}
        >
          <ElementContent element={el} theme={theme} variant="canvas" eager={isFirst} interactive={interactive} siteId={siteId} />
        </div>
      ))}
    </section>
  );
}
