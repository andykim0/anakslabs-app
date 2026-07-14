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
// lucide 최신은 브랜드 아이콘(Instagram 등)을 제공하지 않음 — 일반 아이콘으로 은유
import { AtSign, BookOpen, Camera, Link2, MapPin, MessageCircle, Play } from 'lucide-react';
import type {
  ButtonElement,
  CanvasElement,
  DividerElement,
  ImageElement,
  MapElement,
  ShapeElement,
  SiteTheme,
  SnsKind,
  SocialLinksElement,
  TextElement,
  VideoElement,
} from '@/lib/types/site';
import { isHttpsUrl, safeHref, safeMapEmbedUrl, safeMediaSrc } from '@/lib/safe-url';
import { resolveSolidButton } from '@/lib/design/button-contrast';
import { ContactForm } from './ContactForm';
import { cqw, mobileFontSize } from './scale';
import { storyWordWindow } from '@/lib/motion/progress';

export type RenderVariant = 'canvas' | 'stack';

interface ElementContentProps {
  element: CanvasElement;
  theme: SiteTheme;
  variant: RenderVariant;
  /** 첫 화면(히어로) 이미지 LCP 최적화 — lazy 로딩 해제 */
  eager?: boolean;
  /**
   * false면 버튼을 링크(<a>)가 아닌 비대화형(<span>)으로 렌더한다.
   * 미리보기 썸네일은 상위가 <a>(대시보드 카드 Link)라, 내부 버튼이 <a>이면
   * 앵커 중첩 → 하이드레이션 에러가 난다. 실서빙(/s/[domain])은 기본 true.
   */
  interactive?: boolean;
  /** [v3 Phase 3] 문의 폼 제출 대상 — 실서빙(/s/[domain])에서만 전달. 없으면 폼 비활성 */
  siteId?: string;
  /** [motion-system 2단계] 통계 텍스트 count-up 대상이면 목표/접두/접미 — 텍스트 노드에 data-m 부착 */
  countup?: { to: number; prefix: string; suffix: string };
  /** [motion 3단계] split-text 대상(히어로 헤드라인) — 텍스트를 단어 span으로 분할, aria-label로 원문 보존 */
  splitText?: boolean;
  /** cinematic이면 IO hide/show 대신 --scroll-progress 비례 storyword를 방출 */
  splitTextMode?: 'io' | 'progress';
  /** [motion 3단계] hover-video 대상(썸네일) — autoplay 끄고 hover 재생(preload none) */
  hoverVideo?: boolean;
}

/** variant에 맞는 길이 단위 문자열 */
function len(px: number, variant: RenderVariant): string {
  return variant === 'canvas' ? cqw(px) : `${px}px`;
}

export function ElementContent({ element, theme, variant, eager, interactive = true, siteId, countup, splitText, splitTextMode = 'io', hoverVideo }: ElementContentProps) {
  switch (element.kind) {
    case 'text':
      return <TextContent el={element} theme={theme} variant={variant} countup={countup} splitText={splitText} splitTextMode={splitTextMode} />;
    case 'image':
      return <ImageContent el={element} theme={theme} variant={variant} eager={eager} />;
    case 'button':
      return <ButtonContent el={element} theme={theme} variant={variant} interactive={interactive} />;
    case 'shape':
      return <ShapeContent el={element} theme={theme} variant={variant} />;
    case 'divider':
      return <DividerContent el={element} theme={theme} variant={variant} />;
    case 'video':
      return <VideoContent el={element} variant={variant} eager={eager} hoverVideo={hoverVideo} />;
    case 'form':
      return (
        <ContactForm el={element} theme={theme} siteId={siteId} interactive={interactive} compact={variant === 'stack'} />
      );
    case 'map':
      return <MapContent el={element} theme={theme} variant={variant} interactive={interactive} />;
    case 'socialLinks':
      return <SocialLinksContent el={element} theme={theme} variant={variant} interactive={interactive} />;
    default:
      return null;
  }
}

// ---------- text ----------

function TextContent({
  el,
  theme,
  variant,
  countup,
  splitText,
  splitTextMode,
}: {
  el: TextElement;
  theme: SiteTheme;
  variant: RenderVariant;
  countup?: { to: number; prefix: string; suffix: string };
  splitText?: boolean;
  splitTextMode: 'io' | 'progress';
}) {
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

  // [motion 3단계] split-text: 단어 단위 span 분할(렌더 시점 마크업 — 런타임 DOM 재작성 없음).
  // 원문은 aria-label로 보존, 각 단어는 aria-hidden. cinematic progress는 모바일도 동일 서사를 쓴다.
  if (splitText && (variant === 'canvas' || splitTextMode === 'progress') && el.text.trim()) {
    const tokens = el.text.match(/\S+\s*/g) ?? [el.text];
    return (
      <p style={style} aria-label={el.text}>
        {tokens.map((tok, i) => {
          const window = storyWordWindow(i, tokens.length);
          return (
            <span
              key={i}
              data-m={splitTextMode === 'progress' ? 'storyword' : 'splitword'}
              {...(splitTextMode === 'progress'
                ? { 'data-story-start': window.start.toFixed(4), 'data-story-end': window.end.toFixed(4) }
                : { 'data-m-delay': String(i * 60) })}
              aria-hidden
            >
              {tok}
            </span>
          );
        })}
      </p>
    );
  }

  // count-up 대상이면 텍스트 노드에 data-m 부착 (런타임이 textContent를 0→목표로 카운트, 스타일 보존)
  const m = countup
    ? { 'data-m': 'countup', 'data-m-to': String(countup.to), 'data-m-prefix': countup.prefix, 'data-m-suffix': countup.suffix }
    : {};
  return (
    <p style={style} {...m}>
      {el.text}
    </p>
  );
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

function ButtonContent({
  el,
  theme,
  variant,
  interactive,
}: {
  el: ButtonElement;
  theme: SiteTheme;
  variant: RenderVariant;
  interactive: boolean;
}) {
  const s = el.style;
  const color = s.color ?? theme.palette.primary;
  const radius = s.borderRadius ?? theme.radius ?? 8;
  const fontSize = s.fontSize ?? 16;
  // [G2] 솔리드 버튼 글자색 방어선 — 지정색(또는 기본 background)이 fill과 AA 미달이면 자동 교정
  //      (레거시/편집 config 보호. 신규 생성물은 이미 pickButtonTextColor로 안전).
  const solidTextColor = resolveSolidButton(color, s.textColor, theme.palette).textColor;

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
      color: solidTextColor,
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

  const style = { ...base, ...variants[s.variant], ...sizing };

  // 비대화형(미리보기): 상위 <a> 안에 앵커를 중첩시키지 않도록 <span>으로 렌더
  if (!interactive) {
    return (
      <span className="anaks-btn" data-variant={s.variant} style={style}>
        {el.label}
      </span>
    );
  }

  return (
    // safeHref: javascript: 등 위험 스킴은 링크 비활성 (저장형 XSS 렌더 방어선)
    <a href={safeHref(el.href)} className="anaks-btn" data-variant={s.variant} style={style}>
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

// ---------- map ----------

function MapContent({
  el,
  theme,
  variant,
  interactive,
}: {
  el: MapElement;
  theme: SiteTheme;
  variant: RenderVariant;
  interactive: boolean;
}) {
  const radius = el.style.borderRadius ?? theme.radius ?? 8;
  // 화이트리스트 재검증 — zod(저장)와 별개의 렌더 방어선
  const src = safeMapEmbedUrl(el.embedUrl);

  if (!src || !interactive) {
    // URL 미지정/화이트리스트 밖/미리보기: 지도 플레이스홀더
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: theme.palette.surface,
          color: theme.palette.muted,
          border: `1px dashed ${theme.palette.muted}66`,
          borderRadius: len(radius, variant),
          fontFamily: theme.fonts.body,
          fontSize: variant === 'canvas' ? cqw(13) : '13px',
        }}
      >
        <MapPin style={{ width: 20, height: 20 }} aria-hidden />
        <span>{src ? '지도' : '지도 (URL을 입력하면 표시됩니다)'}</span>
      </div>
    );
  }

  return (
    <iframe
      src={src}
      title="지도"
      loading="lazy"
      // 지도 임베드 구동에 필요한 최소 권한만 (top-navigation/forms/popups-escape 차단)
      sandbox="allow-scripts allow-same-origin allow-popups"
      referrerPolicy="no-referrer-when-downgrade"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: len(radius, variant),
        backgroundColor: theme.palette.surface,
      }}
    />
  );
}

// ---------- socialLinks ----------

const SNS_META: Record<SnsKind, { label: string; Icon: typeof Camera }> = {
  instagram: { label: '인스타그램', Icon: Camera },
  kakao_channel: { label: '카카오 채널', Icon: MessageCircle },
  naver_blog: { label: '네이버 블로그', Icon: BookOpen },
  youtube: { label: '유튜브', Icon: Play },
  x: { label: 'X', Icon: AtSign },
  custom: { label: '링크', Icon: Link2 },
};

function SocialLinksContent({
  el,
  theme,
  variant,
  interactive,
}: {
  el: SocialLinksElement;
  theme: SiteTheme;
  variant: RenderVariant;
  interactive: boolean;
}) {
  const size = el.style.size ?? 40;
  const color = el.style.color ?? theme.palette.text;
  const iconPx = variant === 'canvas' ? cqw(size * 0.55) : `${Math.round(size * 0.55)}px`;
  const boxPx = variant === 'canvas' ? cqw(size) : `${size}px`;

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: el.style.direction === 'column' ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: variant === 'canvas' ? cqw(14) : '14px',
  };

  const itemStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: boxPx,
    height: boxPx,
    color,
    border: `1px solid ${color}44`,
    borderRadius: '50%',
    textDecoration: 'none',
  };

  return (
    <div style={wrap}>
      {el.links.map((link, i) => {
        const meta = SNS_META[link.kind] ?? SNS_META.custom;
        const Icon = meta.Icon;
        const label = link.label || meta.label;
        // https 강제 재검증 (zod와 별개의 렌더 방어선)
        const href = interactive && link.url && isHttpsUrl(link.url) ? link.url : undefined;
        const inner = <Icon style={{ width: iconPx, height: iconPx }} aria-hidden />;
        return href ? (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} style={itemStyle}>
            {inner}
          </a>
        ) : (
          <span key={i} aria-label={label} title={label} style={{ ...itemStyle, opacity: link.url ? 1 : 0.4 }}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}

// ---------- video ----------

function VideoContent({ el, variant, eager, hoverVideo }: { el: VideoElement; variant: RenderVariant; eager?: boolean; hoverVideo?: boolean }) {
  const s = el.style;
  const radius = s.borderRadius ?? 0;
  // [motion 3단계] hover-video: autoplay 끄고 preload none — 런타임이 hover 시 재생(데스크톱만). poster가 정지 화면.
  const m = hoverVideo ? { 'data-m': 'hovervideo' } : {};
  return (
    <video
      // 스킴 화이트리스트 — zod 검증과 별개의 렌더 방어선
      src={safeMediaSrc(el.src)}
      poster={safeMediaSrc(el.poster)}
      // 모바일 자동재생 정책: muted + playsInline 필수
      muted={s.muted ?? true}
      autoPlay={hoverVideo ? false : (s.autoplay ?? true)}
      loop={s.loop ?? true}
      playsInline
      preload={hoverVideo ? 'none' : eager ? 'auto' : 'metadata'}
      {...m}
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
