'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Monitor, Smartphone, X } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import type { SiteConfig } from '@/lib/types/site';
import type { MotionSignatureSpec } from '@/lib/motion/signatures';
import { trackMotionUpsellFunnelEvent } from '@/lib/analytics/motion-upsell-funnel';
import { SitePreview } from '../site-preview';
import { Button, cn } from '../ui';

export interface MotionImmersivePreviewProps {
  config: SiteConfig;
  spec: MotionSignatureSpec;
  previewAsAddon: boolean;
  usesRepresentativeMedia: boolean;
  selected: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 고객의 production SiteConfig/scene/runtime을 그대로 쓰는 화면 전용 몰입 레이어.
 * mount/unmount가 SitePreview와 공용 런타임을 함께 정리하므로 닫힌 동안 비용이 없다.
 */
export function MotionImmersivePreview({
  config,
  spec,
  previewAsAddon,
  usesRepresentativeMedia,
  selected,
  onClose,
  onConfirm,
}: MotionImmersivePreviewProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openTracked = useRef(false);
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewHeight, setPreviewHeight] = useState(640);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      const compact = window.innerWidth < 768;
      if (compact) setMode('mobile');
      setPreviewHeight(Math.max(360, window.innerHeight - (compact ? 210 : 190)));
    };
    // Mount the portal with the measured viewport in the same browser frame,
    // without a synchronous state write in the effect body.
    const frame = window.requestAnimationFrame(() => {
      updateViewport();
      setMounted(true);
    });
    window.addEventListener('resize', updateViewport, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!openTracked.current) {
      openTracked.current = true;
      trackMotionUpsellFunnelEvent({
        action: 'immersive_preview_open',
        signatureId: spec.id,
        alreadySelected: selected,
        addonDemo: previewAsAddon,
        representativeMedia: usesRepresentativeMedia,
      });
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((node) => node.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [mounted, onClose, previewAsAddon, selected, spec.id, usesRepresentativeMedia]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-[#07162f]/96 text-white" data-motion-immersive-preview>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(35,118,255,.2),transparent_42%)]" aria-hidden="true" />
      <div
        className="relative flex h-[100dvh] flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="motion-immersive-title"
        ref={dialogRef}
      >
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/12 bg-[#07162f]/88 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-bold text-cyan-100">
                예시 · 실제 production renderer
              </span>
              {selected ? <span className="text-[10px] font-semibold text-white/65">현재 선택</span> : null}
            </div>
            <h2 id="motion-immersive-title" className="mt-1.5 truncate text-base font-semibold sm:text-lg">
              {spec.label}을 직접 스크롤해 보세요
            </h2>
            <p className="hidden text-xs text-white/60 sm:block">{spec.description}</p>
          </div>

          <div className="flex items-center rounded-full border border-white/15 bg-white/5 p-1" aria-label="미리보기 화면 크기">
            <button
              type="button"
              aria-pressed={mode === 'desktop'}
              onClick={() => setMode('desktop')}
              className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold', mode === 'desktop' ? 'bg-white text-[#07162f]' : 'text-white/65 hover:text-white')}
            >
              <Monitor className="h-3.5 w-3.5" /> 데스크톱
            </button>
            <button
              type="button"
              aria-pressed={mode === 'mobile'}
              onClick={() => setMode('mobile')}
              className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold', mode === 'mobile' ? 'bg-white text-[#07162f]' : 'text-white/65 hover:text-white')}
            >
              <Smartphone className="h-3.5 w-3.5" /> 모바일
            </button>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="몰입 미리보기 닫기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden p-3 sm:p-5">
          <div className={cn('mx-auto h-full overflow-hidden rounded-2xl border border-white/14 bg-white shadow-2xl', mode === 'mobile' ? 'max-w-[430px]' : 'max-w-[1440px]')}>
            <SitePreview
              key={`${spec.id}:${mode}`}
              config={config}
              mode={mode}
              maxHeight={previewHeight}
              scroll
              motion={!reducedMotion}
              previewAsAddon={previewAsAddon}
            />
          </div>
        </main>

        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/12 bg-[#07162f]/92 px-4 py-3 sm:px-6">
          <div className="mr-auto min-w-0 text-[11px] leading-5 text-white/65">
            <p>{mode === 'mobile' ? `모바일: ${spec.mobileFallback} · 화면을 세로로 스와이프하세요.` : '데스크톱: 안쪽을 스크롤하면 발행본과 같은 진행도 런타임이 작동합니다.'}</p>
            <p>{usesRepresentativeMedia ? '대표 데모 영상은 움직임 설명용이며 고객님의 최종 자산이 아닙니다.' : '선택한 팔레트·글꼴·콘텐츠·이미지를 그대로 반영한 예시입니다.'}</p>
          </div>
          <Button variant="secondary" onClick={onClose}>다른 연출 보기</Button>
          <Button onClick={onConfirm}><Check className="h-4 w-4" />이 연출 선택</Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
