'use client';

/**
 * 렌더러 팀의 SiteRenderer를 대시보드에서 축소 미리보기로 감싸는 래퍼.
 * - 내부 캔버스를 DESIGN_WIDTH(데스크톱) / 390px(모바일) 폭으로 렌더한 뒤
 *   컨테이너 폭에 맞춰 transform: scale 로 축소한다.
 *   (SiteRenderer는 container-type:inline-size + cqw 스케일이므로
 *    내부 폭만 고정해주면 그 폭 기준으로 정확히 비례 렌더된다)
 * - 확정 계약: SiteRenderer({ config, mode?: 'desktop'|'mobile'|'auto' })
 */
import { Component, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { DESIGN_WIDTH, type MotionTier, type SiteConfig } from '@/lib/types/site';
import { SiteRenderer, TenantHeader } from '@/components/site-renderer';
import { usePreviewMotion } from '@/components/site-renderer/use-preview-motion';
import { configForAddonPreview } from '@/lib/motion/preview-addon';
import { PRICING } from '@/lib/pricing';
import { cn } from './ui';

const MOBILE_PREVIEW_WIDTH = 390;
/** [F2b] 대화형 프리뷰에서 폼 입력을 활성화하기 위한 sentinel siteId — 실제 제출은 캡처에서 가로채므로 fetch 안 됨 */
const PREVIEW_SITE_ID = '__preview__';

class PreviewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-neutral-600">
          <ImageOff className="h-6 w-6" />
          <p className="text-xs">미리보기를 표시할 수 없습니다</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SitePreview({
  config,
  mode = 'desktop',
  maxHeight,
  scroll = false,
  className,
  interactive = false,
  onFormSubmit,
  motion = false,
  previewAsAddon = false,
  tier,
}: {
  config: SiteConfig;
  mode?: 'desktop' | 'mobile';
  /** 표시 최대 높이(px). 초과분은 잘리거나(scroll=false) 스크롤(scroll=true) */
  maxHeight?: number;
  scroll?: boolean;
  className?: string;
  /**
   * [F2b] 대화형 프리뷰 — 내부 링크(페이지 전환·앵커)·CTA·외부 링크(새 탭)·tel/mailto 동작 +
   * 멀티페이지 헤더 내비. 기본 false(썸네일). site-card 썸네일은 카드 <a> 안이라 반드시 false
   * (버튼이 <a>면 앵커 중첩 하이드레이션 에러) — site-detail 큰 프리뷰에서만 opt-in.
   */
  interactive?: boolean;
  /** [F2b] 대화형 프리뷰에서 폼 제출 시 호출(실제 전송 대신 안내 토스트 등) */
  onFormSubmit?: () => void;
  /**
   * [Q6] 모션 미리보기 — true면 발행본과 동일하게 data-m+모션 CSS+런타임을 방출해
   * reveal/ken-burns 등이 실제로 재생된다(기본 false=정적 썸네일).
   */
  motion?: boolean;
  /**
   * 결제 전 화면에서만 고정 데모 자산으로 시네마틱 연출을 합성한다.
   * 저장·발행·export·tier에는 전달하지 않는 화면 projection이다.
   */
  previewAsAddon?: boolean;
  /** 실제 소유 tier. 애드온 예시를 끈 기본 화면에서는 renderer 방벽에 그대로 전달한다. */
  tier?: MotionTier;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [displayHeight, setDisplayHeight] = useState(0);
  // [F2b] 대화형 프리뷰의 현재 페이지 slug (내부 링크·헤더 내비로 전환)
  const [previewSlug, setPreviewSlug] = useState('');
  const previewConfig = useMemo(
    () => configForAddonPreview(config, previewAsAddon),
    [config, previewAsAddon],
  );
  const resolvedPreviewSlug = config.pages.some((page) => page.slug === previewSlug) ? previewSlug : '';

  const innerWidth = mode === 'mobile' ? MOBILE_PREVIEW_WIDTH : DESIGN_WIDTH;

  // [G1] motion=true 프리뷰에서 런타임 실제 실행(SiteRenderer <script> CSR 미실행 보완)
  usePreviewMotion(motion || previewAsAddon, `${previewConfig.pages.length}:${resolvedPreviewSlug}:${motion}:${previewAsAddon}`);

  // [F2b] 링크 클릭 가로채기 — 참조 구현(CanvasStage.handlePreviewClickCapture)과 동일 규칙
  const handleClickCapture = (e: MouseEvent) => {
    if (!interactive) return;
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      e.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
    } else if (href.startsWith('/') && !href.startsWith('//')) {
      // 발행 도메인 기준 내부 경로 — 해당 slug 페이지로 전환(있을 때만)
      e.preventDefault();
      const slug = href === '/' ? '' : href.slice(1).split(/[?#]/)[0];
      if (config.pages.some((p) => p.slug === slug)) setPreviewSlug(slug);
    }
    // '#앵커'는 기본 동작(섹션 스크롤), mailto:/tel:도 통과
  };

  // [F2b] 폼 제출 가로채기 — 실제 전송 대신 안내(발행 후 동작). 캡처+stopPropagation으로 ContactForm fetch 차단
  const handleSubmitCapture = (e: FormEvent) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    onFormSubmit?.();
  };

  useEffect(() => {
    const measure = () => {
      const outerW = outerRef.current?.clientWidth ?? 0;
      const s = outerW > 0 ? outerW / innerWidth : 0;
      setScale(s);
      const innerH = innerRef.current?.offsetHeight ?? 0;
      setDisplayHeight(innerH * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [innerWidth, config]);

  const clampedHeight =
    maxHeight !== undefined && displayHeight > 0 ? Math.min(displayHeight, maxHeight) : displayHeight || maxHeight;

  return (
    <div
      ref={outerRef}
      data-site-preview-scroll={scroll ? 'true' : undefined}
      className={cn('relative w-full', scroll ? 'overflow-y-auto' : 'overflow-hidden', className)}
      style={scroll ? { maxHeight } : { height: clampedHeight || undefined }}
    >
      {/* 사이저: transform은 레이아웃 높이를 바꾸지 않으므로 표시 높이를 명시해 스크롤/클리핑을 맞춘다 */}
      <div style={{ height: displayHeight || 0, overflow: 'hidden' }}>
        <div
          ref={innerRef}
          style={{
            width: innerWidth,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            opacity: scale > 0 ? 1 : 0,
          }}
          onClickCapture={interactive ? handleClickCapture : undefined}
          onSubmitCapture={interactive ? handleSubmitCapture : undefined}
        >
          <PreviewErrorBoundary>
            {/* mode 고정: 'auto'는 뷰포트 브레이크포인트 기준 전환이라 미리보기 프레임과 어긋난다 */}
            {/* [F2b] interactive=false(기본): 썸네일 — 버튼이 <a>면 상위 카드 Link(<a>)와 앵커 중첩.
                 interactive=true: 헤더 내비 + 페이지 전환. 기본 animate=false(정적)이고,
                 [Q6] motion=true일 때만 발행본과 동일한 모션(data-m+CSS+런타임)을 방출·재생.
                 siteId sentinel로 폼 입력 활성화(제출은 캡처에서 가로챔). */}
            {interactive && <TenantHeader config={previewConfig} currentSlug={resolvedPreviewSlug} />}
            <SiteRenderer
              key={`${motion ? 'motion-on' : 'motion-off'}:${previewAsAddon ? 'addon-demo' : 'owned'}`} // 토글 시 리마운트 → 런타임 재실행
              config={previewConfig}
              mode={mode}
              pageSlug={interactive ? resolvedPreviewSlug : undefined}
              interactive={interactive}
              animate={motion || previewAsAddon ? true : interactive ? false : undefined}
              tier={previewAsAddon ? 'premium' : tier}
              siteId={interactive ? PREVIEW_SITE_ID : undefined}
              runtimeDelivery="client"
            />
          </PreviewErrorBoundary>
        </div>
      </div>
      {previewAsAddon ? (
        <span className="pointer-events-none absolute top-2 left-2 z-50 rounded-full border border-white/25 bg-[#07162f]/90 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm">
          예시 · AI 영상 홈페이지(+₩{PRICING.videoHeroAddon.toLocaleString('ko-KR')}) 적용 시
        </span>
      ) : null}
    </div>
  );
}
