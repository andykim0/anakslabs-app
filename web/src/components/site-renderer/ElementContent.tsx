/**
 * 캔버스 요소 1개의 실제 콘텐츠 렌더 (프레임/배치는 부모가 책임).
 *
 * variant:
 *  - 'canvas': 데스크톱 자유배치. 모든 px 값을 cqw로 환산해 비례 스케일.
 *  - 'stack' : 모바일 세로 스택 재배치. px 단위 유지(폰트는 압축 보정).
 *
 * 서버 컴포넌트 — 훅/이벤트 없음. hover 등 마이크로 인터랙션은
 * SiteRenderer가 주입하는 베이스 CSS(.anaks-btn 등)로 처리.
 */
import type { CSSProperties } from 'react';
import type {
  ButtonElement,
  CanvasElement,
  DividerElement,
  ImageElement,
  ShapeElement,
  SiteTheme,
  TextElement,
  VideoElement,
} from '@/lib/types/site';
import { safeHref, safeMediaSrc } from '@/lib/safe-url';
import { cqw, mobileFontSize } from './scale';

export type RenderVariant = 'canvas' | 'stack';

interface ElementContentProps {
  element: CanvasElement;
  theme: SiteTheme;
  variant: RenderVariant;
  /** 첫 화면(히어로) 이미지 LCP 최적화 — lazy 로딩 해제 */
  eager?: boolean;
}

/** variant에 맞는 길이 단위 문자열 */
function len(px: number, variant: RenderVariant): string {
  return variant === 'canvas' ? cqw(px) : `${px}px`;
}

export function ElementContent({ element, theme, variant, eager }: ElementContentProps) {
  switch (element.kind) {
    case 'text':
      return <TextContent el={element} theme={theme} variant={variant} />;
    case 'image':
      return <ImageContent el={element} theme={theme} variant={variant} eager={eager} />;
    case 'button':
      return <ButtonContent el={element} theme={theme} variant={variant} />;
    case 'shape':
      return <ShapeContent el={element} theme={theme} variant={variant} />;
    case 'divider':
      return <DividerContent el={element} theme={theme} variant={variant} />;
    case 'video':
      return <VideoContent el={element} variant={variant} eager={eager} />;
    default:
      return null;
  }
}

// ---------- text ----------

function TextContent({ el, theme, variant }: { el: TextElement; theme: SiteTheme; variant: RenderVariant }) {
  const s = el.style;
  const style: CSSProperties = {
    margin: 0,
    width: '100%',
    fontSize: variant === 'canvas' ? cqw(s.fontSize) : `${mobileFontSize(s.fontSize)}px`,
    fontWeight: s.fontWeight ?? 400,
    fontFamily: s.fontFamily === 'heading' ? theme.fonts.heading : theme.fonts.body,
    color: s.color ?? theme.palette.text,
    // 모바일 스택은 중앙 정렬 보정 (자유배치 좌표 의미가 사라지므로)
    textAlign: variant === 'stack' ? 'center' : (s.align ?? 'left'),
    lineHeight: s.lineHeight ?? 1.45,
    letterSpacing: s.letterSpacing != null ? len(s.letterSpacing, variant) : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    whiteSpace: 'pre-wrap', // \n 줄바꿈 반영
    wordBreak: 'keep-all', // 한국어 어절 단위 줄바꿈
    overflowWrap: 'break-word',
  };
  return <p style={style}>{el.text}</p>;
}

// ---------- image ----------

function ImageContent({
  el,
  theme,
  variant,
  eager,
}: {
  el: ImageElement;
  theme: SiteTheme;
  variant: RenderVariant;
  eager?: boolean;
}) {
  const s = el.style;
  const radius = s.borderRadius ?? 0;
  return (
    // 고객 콘텐츠 이미지는 next/image 대신 plain <img> (규약)
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // 스킴 화이트리스트 (javascript:/data:text 등 차단) — zod 검증과 별개의 렌더 방어선
      src={safeMediaSrc(el.src)}
      alt={el.alt ?? ''}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: s.objectFit ?? 'cover',
        borderRadius: radius ? len(radius, variant) : undefined,
        boxShadow: s.shadow ? '0 24px 48px -16px rgba(0, 0, 0, 0.4)' : undefined,
        backgroundColor: theme.palette.surface,
      }}
    />
  );
}

// ---------- button ----------

function ButtonContent({ el, theme, variant }: { el: ButtonElement; theme: SiteTheme; variant: RenderVariant }) {
  const s = el.style;
  const color = s.color ?? theme.palette.primary;
  const radius = s.borderRadius ?? theme.radius ?? 8;
  const fontSize = s.fontSize ?? 16;

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: theme.fonts.body,
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };

  const variants: Record<ButtonElement['style']['variant'], CSSProperties> = {
    solid: {
      backgroundColor: color,
      color: s.textColor ?? theme.palette.background,
      border: 'none',
    },
    outline: {
      backgroundColor: 'transparent',
      color: s.textColor ?? color,
      border: `1.5px solid ${color}`,
    },
    ghost: {
      backgroundColor: 'transparent',
      color: s.textColor ?? color,
      border: 'none',
      textUnderlineOffset: '6px',
    },
  };

  const sizing: CSSProperties =
    variant === 'canvas'
      ? {
          width: '100%',
          height: '100%',
          fontSize: cqw(fontSize),
          borderRadius: cqw(radius),
        }
      : {
          padding: '14px 30px',
          minHeight: '48px', // 모바일 탭 타깃
          fontSize: `${Math.min(Math.max(fontSize, 15), 18)}px`,
          borderRadius: `${radius}px`,
        };

  return (
    // safeHref: javascript: 등 위험 스킴은 링크 비활성 (저장형 XSS 렌더 방어선)
    <a href={safeHref(el.href)} className="anaks-btn" data-variant={s.variant} style={{ ...base, ...variants[s.variant], ...sizing }}>
      {el.label}
    </a>
  );
}

// ---------- shape ----------

function ShapeContent({ el, theme, variant }: { el: ShapeElement; theme: SiteTheme; variant: RenderVariant }) {
  const s = el.style;

  if (el.shape === 'line') {
    const thickness = Math.max(1, s.borderWidth ?? 2);
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: '100%',
            height: `${thickness}px`,
            backgroundColor: s.borderColor ?? s.fill ?? theme.palette.muted,
          }}
        />
      </div>
    );
  }

  const radius = el.shape === 'ellipse' ? '50%' : s.borderRadius != null ? len(s.borderRadius, variant) : len(theme.radius ?? 0, variant);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: s.fill ?? theme.palette.surface,
        border: s.borderWidth ? `${s.borderWidth}px solid ${s.borderColor ?? theme.palette.muted}` : undefined,
        borderRadius: radius,
      }}
    />
  );
}

// ---------- divider ----------

function DividerContent({ el, theme, variant }: { el: DividerElement; theme: SiteTheme; variant: RenderVariant }) {
  void variant;
  const thickness = Math.max(1, el.style.thickness ?? 1);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
      <div
        role="separator"
        style={{
          width: '100%',
          height: `${thickness}px`,
          backgroundColor: el.style.color ?? theme.palette.muted,
        }}
      />
    </div>
  );
}

// ---------- video ----------

function VideoContent({ el, variant, eager }: { el: VideoElement; variant: RenderVariant; eager?: boolean }) {
  const s = el.style;
  const radius = s.borderRadius ?? 0;
  return (
    <video
      // 스킴 화이트리스트 — zod 검증과 별개의 렌더 방어선
      src={safeMediaSrc(el.src)}
      poster={safeMediaSrc(el.poster)}
      // 모바일 자동재생 정책: muted + playsInline 필수
      muted={s.muted ?? true}
      autoPlay={s.autoplay ?? true}
      loop={s.loop ?? true}
      playsInline
      preload={eager ? 'auto' : 'metadata'}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: s.objectFit ?? 'cover',
        borderRadius: radius ? len(radius, variant) : undefined,
        backgroundColor: '#000',
      }}
    />
  );
}
