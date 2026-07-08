'use client';

/**
 * 렌더러 팀의 SiteRenderer를 대시보드에서 축소 미리보기로 감싸는 래퍼.
 * - 내부 캔버스를 DESIGN_WIDTH(데스크톱) / 390px(모바일) 폭으로 렌더한 뒤
 *   컨테이너 폭에 맞춰 transform: scale 로 축소한다.
 * - SiteRenderer props 가정: { config: SiteConfig } (컨테이너 폭 기준 렌더).
 *   시그니처가 다르면 이 파일 한 곳만 수정하면 된다.
 */
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { DESIGN_WIDTH, type SiteConfig } from '@/lib/types/site';
import { SiteRenderer } from '@/components/site-renderer';
import { cn } from './ui';

const MOBILE_PREVIEW_WIDTH = 390;

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
}: {
  config: SiteConfig;
  mode?: 'desktop' | 'mobile';
  /** 표시 최대 높이(px). 초과분은 잘리거나(scroll=false) 스크롤(scroll=true) */
  maxHeight?: number;
  scroll?: boolean;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [displayHeight, setDisplayHeight] = useState(0);

  const innerWidth = mode === 'mobile' ? MOBILE_PREVIEW_WIDTH : DESIGN_WIDTH;

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
        >
          <PreviewErrorBoundary>
            <SiteRenderer config={config} />
          </PreviewErrorBoundary>
        </div>
      </div>
    </div>
  );
}
