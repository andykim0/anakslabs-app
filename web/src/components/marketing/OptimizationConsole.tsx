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
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Check, Search } from 'lucide-react';
import { useFailClosedReducedMotion } from './use-fail-closed-reduced-motion';

const SIGNALS = [
  { label: '검색', sub: '가게 정보' },
  { label: '질문', sub: '자주 묻는 내용' },
  { label: 'AI', sub: '공식 정보' },
];

const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeToDesktopQuery(onStoreChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

const getDesktopSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;
const getDesktopServerSnapshot = () => false;

export function OptimizationConsole({ mediaMode = 'film' }: { mediaMode?: 'film' | 'poster' | 'interface' }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = useFailClosedReducedMotion();
  const [nearViewport, setNearViewport] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopQuery,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      const fallbackId = window.setTimeout(() => setNearViewport(true), 0);
      return () => window.clearTimeout(fallbackId);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '180px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showVideo = mediaMode === 'film' && nearViewport && isDesktop && !reduce && !failed;
  const showPoster = mediaMode !== 'interface';

  useEffect(() => {
    if (!showVideo) return;
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    if (typeof IntersectionObserver === 'undefined') {
      void video.play().catch(() => setPlaying(false));
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => setPlaying(false));
      else {
        video.pause();
        setPlaying(false);
      }
    }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showVideo]);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label="홈페이지의 검색, 질문, AI 정보 확인 화면"
      className="relative mx-auto w-full max-w-[640px]"
    >
      <div className="relative aspect-[16/11] overflow-hidden rounded-[28px] border border-[#DCE4F0] bg-white shadow-[0_24px_64px_rgba(11,23,54,.1)]">
        {showPoster ? (
          <Image
            data-optimization-poster
            src="/daboim-visibility-film-poster.webp"
            alt=""
            aria-hidden="true"
            fill
            preload
            unoptimized
            sizes="(max-width: 767px) 100vw, 640px"
            className="object-cover object-center"
          />
        ) : null}
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            poster="/daboim-visibility-film-poster.webp"
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => {
              setFailed(true);
              setPlaying(false);
            }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${playing ? 'opacity-100' : 'opacity-0'}`}
          >
            <source src="/daboim-visibility-film.webm" type="video/webm" />
            <source src="/daboim-visibility-film.mp4" type="video/mp4" />
          </video>
        ) : null}

        <div className="absolute right-4 bottom-4 left-4 rounded-2xl border border-[#E2E8F2] bg-white/96 p-4 shadow-[0_10px_28px_rgba(11,23,54,.09)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#174DDA] via-[#08B8E8] to-[#03D1B8] text-white">
                <Search className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-[11px] font-semibold text-[#0B1736]">홈페이지 정보 확인</span>
                <span className="mt-0.5 block text-[9px] text-[#667085]">손님이 찾는 내용까지 한 번에</span>
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
    </div>
  );
}
