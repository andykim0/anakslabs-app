'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Play, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { MotionSignatureId } from '@/lib/types/site';
import { trackMotionUpsellFunnelEvent } from '@/lib/analytics/motion-upsell-funnel';
import { cn } from '../ui';

export type UpsellPreviewMode = 'still' | 'motion';

const STILL_HOLD_MS = 2_000;

/**
 * W2/SEL1 화면 전용 비교기.
 * 같은 선택 이미지를 CSS transform으로만 움직이며 고객 자산을 생성형으로 수정하지 않는다.
 */
export function HeroMotionUpsellPreview({
  heroImageUrl,
  businessName,
  signatureId,
  addonOwned,
  videoRequired,
  onModeChange,
}: {
  heroImageUrl: string;
  businessName: string;
  signatureId: MotionSignatureId;
  addonOwned: boolean;
  videoRequired: boolean;
  onModeChange?: (mode: UpsellPreviewMode, source: 'auto' | 'user') => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const [mode, setMode] = useState<UpsellPreviewMode>('still');
  const userSelected = useRef(false);
  const impressionSignature = useRef<MotionSignatureId | undefined>(undefined);

  useEffect(() => {
    if (impressionSignature.current === signatureId) return;
    impressionSignature.current = signatureId;
    trackMotionUpsellFunnelEvent({
      action: 'upsell_impression',
      signatureId,
      addonOwned,
      videoRequired,
    });
  }, [addonOwned, signatureId, videoRequired]);

  // 첫 노출에서 같은 프레임을 2초간 보여준 뒤 움직여 정지/모션의 차이를 한 화면에서 만든다.
  // reduced-motion 또는 사용자의 명시 선택은 자동 전환보다 항상 우선한다.
  useEffect(() => {
    if (reducedMotion || userSelected.current) return;
    const timer = window.setTimeout(() => {
      setMode('motion');
      trackMotionUpsellFunnelEvent({
        action: 'preview_mode_toggle',
        signatureId,
        mode: 'motion',
        trigger: 'auto',
      });
      onModeChange?.('motion', 'auto');
    }, STILL_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [onModeChange, reducedMotion, signatureId]);

  const choose = (next: UpsellPreviewMode) => {
    if (next === mode) return;
    userSelected.current = true;
    setMode(next);
    trackMotionUpsellFunnelEvent({
      action: 'preview_mode_toggle',
      signatureId,
      mode: next,
      trigger: 'user',
    });
    onModeChange?.(next, 'user');
  };

  const effectiveMode: UpsellPreviewMode = reducedMotion ? 'still' : mode;
  const moving = effectiveMode === 'motion';

  return (
    <div className="overflow-hidden rounded-ob border border-ob-border bg-ob-surface shadow-[0_24px_70px_-42px_rgba(23,77,218,.45)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-[#07162f]">
        <motion.img
          src={heroImageUrl}
          alt={`${businessName}Hero image selected from`}
          className="absolute inset-0 h-full w-full object-cover"
          initial={false}
          animate={moving
            ? { scale: [1, 1.045, 1.018], x: ['0%', '-1.2%', '0.45%'], y: ['0%', '-0.8%', '0.25%'] }
            : { scale: 1, x: '0%', y: '0%' }}
          transition={moving
            ? { duration: 9, repeat: Infinity, repeatType: 'mirror', ease: [0.22, 0.61, 0.36, 1] }
            : { duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
        />
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 bg-[linear-gradient(110deg,rgba(7,22,47,.08),rgba(7,22,47,.02)_46%,rgba(7,22,47,.42))] transition-opacity duration-700',
            moving ? 'opacity-100' : 'opacity-55',
          )}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -top-1/2 h-[200%] w-1/3 rotate-[14deg] bg-gradient-to-r from-transparent via-white/16 to-transparent blur-xl"
          initial={false}
          animate={moving ? { x: ['-160%', '460%'] } : { x: '-160%' }}
          transition={moving ? { duration: 5.8, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' } : { duration: 0 }}
        />
        <span className="absolute top-3 left-3 rounded-full border border-white/25 bg-[#07162f]/82 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
          Example · Comparing the same photo
        </span>
        <div className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-white/75">{businessName}</p>
            <p className="mt-0.5 text-sm font-semibold">{moving ? 'Subtle light and camera movement' : 'Selected still image'}</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-semibold backdrop-blur-sm">
            {moving ? 'MOTION' : 'STILL'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-ob-border p-3">
        <p className="text-[11px] leading-5 text-ob-muted">
          {reducedMotion ? 'Motion is disabled by your reduced-motion setting.' : 'Compare still and motion using the same image.'}
        </p>
        <div className="flex shrink-0 rounded-full border border-ob-border bg-ob-bg p-1" aria-label="Example movement comparison">
          <button
            type="button"
            aria-pressed={effectiveMode === 'still'}
            onClick={() => choose('still')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
              effectiveMode === 'still' ? 'bg-ob-surface text-ob-ink shadow-sm' : 'text-ob-muted hover:text-ob-ink',
            )}
          >
            <ImageIcon className="h-3 w-3" /> Still
          </button>
          <button
            type="button"
            aria-pressed={effectiveMode === 'motion'}
            disabled={reducedMotion}
            onClick={() => choose('motion')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
              effectiveMode === 'motion' ? 'bg-ob-accent-strong text-white shadow-sm' : 'text-ob-muted hover:text-ob-ink',
              reducedMotion && 'cursor-not-allowed opacity-50',
            )}
          >
            {effectiveMode === 'motion' ? <Sparkles className="h-3 w-3" /> : <Play className="h-3 w-3" />} Motion
          </button>
        </div>
      </div>
    </div>
  );
}
