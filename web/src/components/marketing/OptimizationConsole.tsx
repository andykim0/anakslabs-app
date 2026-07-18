'use client';

/**
 * Daboim 히어로 전용 3D 발견 신호 필름.
 *
 * 원본: Daboim 신규 Gemini 시작 프레임(daboim-hero-candidate-2)에서 생성한
 * Veo 3.1 Fast image-to-video(daboim-brand-video-1080-2, 8초·1080p).
 * 기존 Anaks Labs 브랜드 영상과 무관한 별도 생성물이다. public용도 원본 해상도를
 * 유지한 무음 1080p MP4/WebM이다. 뷰포트 근접 시에만 소스를 마운트하고,
 * 모바일·reduced-motion은 포스터만 쓴다.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Search, Sparkles } from 'lucide-react';

const SIGNALS = [
  { label: 'SEO', sub: '검색 구조' },
  { label: 'AEO', sub: '답변 구조' },
  { label: 'GEO', sub: 'AI 인용 구조' },
];

const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeToDesktopQuery(onStoreChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

const getDesktopSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;
const getDesktopServerSnapshot = () => false;

export function OptimizationConsole({ mediaMode = 'film' }: { mediaMode?: 'film' | 'poster' }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [nearViewport, setNearViewport] = useState(false);
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopQuery,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '180px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showVideo = mediaMode === 'film' && nearViewport && isDesktop && !reduce;

  useEffect(() => {
    if (!showVideo) return;
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showVideo]);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label="Daboim 전용 3D 신호 애니메이션과 SEO, AEO, GEO 최적화 상태"
      className="relative mx-auto w-full max-w-[640px]"
    >
      <div aria-hidden="true" className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(8,184,232,.15),transparent_68%)] blur-2xl" />
      <div className="relative aspect-[16/11] overflow-hidden rounded-[28px] border border-[#DCE4F0] bg-white shadow-[0_30px_90px_rgba(11,23,54,.13)]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/daboim-visibility-film-poster.webp')" }}
        />
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/daboim-visibility-film-poster.webp"
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src="/daboim-visibility-film.webm" type="video/webm" />
            <source src="/daboim-visibility-film.mp4" type="video/mp4" />
          </video>
        ) : null}

        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-[#174DDA]/5 via-transparent to-[#03D1B8]/16 mix-blend-multiply" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,.05),rgba(255,255,255,0)_50%,rgba(248,251,255,.82))]" />

        <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur">
          <Sparkles className="h-3 w-3 text-[#08AFC5]" />
          <span className="font-mono text-[9px] font-semibold tracking-[0.12em] text-[#0B1736]">DABOIM VISIBILITY FILM · 1080P</span>
        </div>

        <motion.div
          aria-hidden="true"
          animate={reduce ? undefined : { x: ['-120%', '220%'] }}
          transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
          className="absolute inset-y-0 w-24 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
        />

        <div className="absolute right-4 bottom-4 left-4 rounded-2xl border border-white/90 bg-white/88 p-4 shadow-[0_12px_40px_rgba(11,23,54,.12)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#174DDA] via-[#08B8E8] to-[#03D1B8] text-white">
                <Search className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-[11px] font-semibold text-[#0B1736]">발견 신호 구조화</span>
                <span className="mt-0.5 block text-[9px] text-[#667085]">검색부터 AI 답변까지 한 번에</span>
              </span>
            </div>
            <span className="hidden items-center gap-1 rounded-full bg-[#EAFBF7] px-2.5 py-1 font-mono text-[8px] font-semibold text-[#087D70] sm:inline-flex">
              <Check className="h-3 w-3" /> READY
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SIGNALS.map((signal, index) => (
              <motion.div
                key={signal.label}
                animate={reduce ? undefined : { borderColor: ['#E2E8F2', index === 2 ? '#75DECF' : '#8FB2FF', '#E2E8F2'] }}
                transition={{ duration: 3, delay: index * 0.55, repeat: Infinity }}
                className="rounded-xl border border-[#E2E8F2] bg-[#F8FBFF] px-3 py-2.5"
              >
                <p className="font-mono text-[10px] font-semibold text-[#174DDA]">{signal.label}</p>
                <p className="mt-0.5 text-[8px] text-[#667085]">{signal.sub}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center font-mono text-[8px] tracking-[0.08em] text-[#667085]">
        DABOIM 3D MOTION · 1920×1080 · MUTED · LAZY-LOADED
      </p>
    </div>
  );
}
