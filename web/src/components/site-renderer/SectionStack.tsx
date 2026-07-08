/**
 * 모바일 섹션 렌더 — 축소가 아니라 "재배치".
 * hiddenOnMobile 제외, y좌표(동률이면 x) 순으로 세로 스택.
 * 텍스트 중앙 정렬 보정, 이미지/영상 풀폭(원본 비율 유지), 버튼 탭 타깃 확보.
 * 순수 장식용 shape(rect/ellipse)는 스택에서 의미가 없어 제외 — line은 구분선으로 유지.
 */
import type { CSSProperties } from 'react';
import type { CanvasElement, Section, SiteTheme } from '@/lib/types/site';
import { ElementContent } from './ElementContent';

interface SectionStackProps {
  section: Section;
  theme: SiteTheme;
  isFirst?: boolean;
}

function stackable(el: CanvasElement): boolean {
  if (el.hiddenOnMobile) return false;
  if (el.kind === 'shape' && el.shape !== 'line') return false;
  return true;
}

/** 요소 종류별 스택 아이템 래퍼 스타일 */
function itemStyle(el: CanvasElement): CSSProperties {
  const base: CSSProperties = { opacity: el.opacity };
  switch (el.kind) {
    case 'image':
    case 'video':
      return {
        ...base,
        width: '100%',
        // 프레임 비율 유지 (0 방어)
        aspectRatio: el.frame.h > 0 ? `${el.frame.w} / ${el.frame.h}` : undefined,
      };
    case 'button':
      return { ...base, display: 'flex', justifyContent: 'center' };
    case 'divider':
    case 'shape':
      return { ...base, width: '56%', height: '16px' };
    default:
      return { ...base, width: '100%' };
  }
}

export function SectionStack({ section, theme, isFirst }: SectionStackProps) {
  const bg = section.background;
  const elements = section.elements.filter(stackable).sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);

  if (elements.length === 0 && !bg.image) return null;

  return (
    <section
      data-section-type={section.type}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: bg.color ?? theme.palette.background,
        backgroundImage: bg.gradient,
        padding: '64px 24px',
        // 요소 없이 배경 이미지만 있는 섹션은 이미지 밴드로
        minHeight: elements.length === 0 ? '52vw' : undefined,
      }}
    >
      {bg.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg.image.src}
          alt=""
          aria-hidden
          loading={isFirst ? 'eager' : 'lazy'}
          decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
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
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '560px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {elements.map((el) => (
          <div key={el.id} style={itemStyle(el)}>
            <ElementContent element={el} theme={theme} variant="stack" eager={isFirst} />
          </div>
        ))}
      </div>
    </section>
  );
}
