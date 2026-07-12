/**
 * 데스크톱(캔버스) 섹션 렌더 — DESIGN_WIDTH(1440) 기준 자유배치를
 * cqw 단위로 환산해 컨테이너 폭에 비례 스케일.
 *
 * [motion-system 2단계] 등장 모션은 React(Reveal) 대신 data-m 속성 + CSS + 바닐라 런타임으로.
 * plan(resolveMotionPlan 결과)이 있으면 요소/배경에 data-m을 부착하고, 실제 동작은
 * SiteRenderer가 방출한 MOTION_CSS/MOTION_RUNTIME이 담당(호스팅·정적 내보내기 공용, framer-motion 없음).
 */
import type { CSSProperties } from 'react';
import type { Section, SiteTheme } from '@/lib/types/site';
import { cqw } from './scale';
import { ElementContent } from './ElementContent';
import { motionFor, revealDelayFor, parseStatParts, type MotionPlan } from '@/lib/motion/apply';

interface SectionCanvasProps {
  section: Section;
  theme: SiteTheme;
  /** 첫 섹션(히어로)이면 이미지 eager 로딩 */
  isFirst?: boolean;
  /** false면 버튼을 비대화형으로 (미리보기 앵커 중첩 방지) */
  interactive?: boolean;
  /** [motion-system 2단계] 모션 계획 — 없으면 모션 미방출(프리뷰/썸네일) */
  plan?: MotionPlan;
  /** [v3 Phase 3] 문의 폼 제출 대상 — 실서빙에서만 전달 */
  siteId?: string;
}

export function SectionCanvas({ section, theme, isFirst, interactive = true, plan, siteId }: SectionCanvasProps) {
  const bg = section.background;
  // z 오름차순 정렬 — zIndex와 DOM 순서를 일치시켜 페인트 순서 결정적으로
  const elements = [...section.elements].sort((a, b) => a.z - b.z);
  const kenBurns = plan?.kenBurnsSections.has(section.id) ?? false;

  const sectionStyle: CSSProperties = {
    position: 'relative',
    height: cqw(section.height),
    overflow: 'hidden',
    backgroundColor: bg.color ?? theme.palette.background,
    backgroundImage: bg.gradient,
  };

  return (
    <section id={section.id} data-section-type={section.type} aria-label={section.name} style={sectionStyle}>
      {bg.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg.image.src}
          alt=""
          aria-hidden
          loading={isFirst ? 'eager' : 'lazy'}
          decoding="async"
          {...(kenBurns ? { 'data-m': 'kenburns' } : {})}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {bg.image?.overlayColor && (
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, backgroundColor: bg.image.overlayColor, opacity: bg.image.overlayOpacity ?? 0.45 }}
        />
      )}
      {elements.map((el) => {
        const m = plan ? motionFor(plan, section.id, el.id) : undefined;
        const countup = m === 'countup' && el.kind === 'text' ? parseStatParts(el.text) ?? undefined : undefined;
        const dataM = m === 'reveal' || m === 'mask' ? m : undefined;
        const delay = m === 'reveal' && plan ? revealDelayFor(plan, section.id, el.id) : undefined;
        return (
          <div
            key={el.id}
            {...(dataM ? { 'data-m': dataM } : {})}
            {...(delay != null ? { 'data-m-delay': String(delay) } : {})}
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
            <ElementContent element={el} theme={theme} variant="canvas" eager={isFirst} interactive={interactive} siteId={siteId} countup={countup} />
          </div>
        );
      })}
    </section>
  );
}
