'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { formatKrw, PRICING } from '@/lib/pricing';

const POSTER_SRC = '/daboim-visibility-film-poster.webp';

function Poster({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={POSTER_SRC}
      alt="Daboim AI 시네마틱 연출의 추상 브랜드 장면"
      width={1920}
      height={1080}
      loading="lazy"
      decoding="async"
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
    />
  );
}

export function PricingMotionComparison() {
  const basicRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [basicInView, setBasicInView] = useState(false);
  const [videoInView, setVideoInView] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (reduce || typeof IntersectionObserver === 'undefined') return;
    const basic = basicRef.current;
    const video = videoRef.current;
    if (!basic || !video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === basic) setBasicInView(entry.isIntersecting);
          if (entry.target === video) setVideoInView(entry.isIntersecting);
        }
      },
      { rootMargin: '80px 0px', threshold: 0.35 },
    );
    observer.observe(basic);
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduce]);

  const canLoadVideo = videoInView && !reduce && !failed;

  useEffect(() => {
    const video = playerRef.current;
    if (!video || !canLoadVideo) return;
    void video.play().catch(() => setVideoPlaying(false));
    return () => {
      video.pause();
      setVideoPlaying(false);
    };
  }, [canLoadVideo]);

  return (
    <div data-pricing-motion-comparison className="space-y-4">
      <style>{`
        [data-pricing-basic-media] { transform: scale(1.015); transition: transform 7.5s cubic-bezier(.2,.7,.2,1); }
        [data-pricing-basic-card][data-in-view="true"] [data-pricing-basic-media] { transform: scale(1.075) translate3d(-.7%,-.5%,0); }
        [data-pricing-video-card] video { transition: opacity .45s ease, transform 5.5s cubic-bezier(.2,.7,.2,1); }
        [data-pricing-video-card]:hover video { transform: scale(1.025); }
        @media (prefers-reduced-motion: reduce) {
          [data-pricing-basic-media], [data-pricing-video-card] video { transform: none !important; transition: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#17181C]">같은 장면, 움직임의 차이</p>
          <p className="mt-1 text-xs leading-5 text-[#5C6068]">기본 모션과 AI 영상 홈페이지를 직접 비교해 보세요.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#174DDA]/15 bg-[#EEF4FF] px-2.5 py-1 text-[10px] font-semibold text-[#174DDA]">
          예시 연출
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article
          ref={basicRef}
          data-pricing-basic-card
          data-in-view={basicInView && !reduce ? 'true' : 'false'}
          className="overflow-hidden rounded-2xl border border-[#DDE3EE] bg-[#F8FBFF]"
        >
          <div className="relative aspect-video overflow-hidden bg-[#EAF1FC]">
            <div data-pricing-basic-media aria-hidden="true" className="absolute inset-0">
              <Poster />
            </div>
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#07142F]/55 via-transparent to-transparent" />
            <span className="absolute right-3 bottom-3 rounded-full border border-white/25 bg-[#07142F]/68 px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-white">
              BASIC MOTION
            </span>
          </div>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-[#17181C]">기본 홈페이지 · 기본 모션 포함</h3>
            <p className="mt-1 text-xs leading-5 text-[#5C6068]">정지 사진에 느린 확대와 스크롤 등장 효과를 더합니다.</p>
          </div>
        </article>

        <article
          ref={videoRef}
          data-pricing-video-card
          className="overflow-hidden rounded-2xl border border-[#9CB8FF] bg-[#F4F8FF] shadow-[0_18px_44px_rgba(23,77,218,.12)]"
        >
          <div className="relative aspect-video overflow-hidden bg-[#EAF1FC]">
            <Poster className={`transition-opacity duration-500 ${videoPlaying ? 'opacity-0' : 'opacity-100'}`} />
            {canLoadVideo ? (
              <video
                ref={playerRef}
                muted
                loop
                playsInline
                preload="none"
                poster={POSTER_SRC}
                aria-hidden="true"
                onPlaying={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onError={() => {
                  setFailed(true);
                  setVideoPlaying(false);
                }}
                className={`absolute inset-0 h-full w-full object-cover ${videoPlaying ? 'opacity-100' : 'opacity-0'}`}
              >
                <source src="/daboim-visibility-film.webm" type="video/webm" />
                <source src="/daboim-visibility-film.mp4" type="video/mp4" />
              </video>
            ) : null}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07142F]/48 via-transparent to-transparent" />
            <span className="absolute right-3 bottom-3 rounded-full border border-[#68E8D8]/30 bg-[#07142F]/72 px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-[#8AF4E7]">
              DABOIM AI CINEMATIC
            </span>
          </div>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-[#0B1736]">
              AI 영상 홈페이지 · +{formatKrw(PRICING.videoHeroAddon)}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#5C6068]">같은 장면에 실제 공간감과 시네마틱 움직임을 더합니다.</p>
          </div>
        </article>
      </div>

      <p className="text-[11px] leading-5 text-[#696E76]">
        예시 연출입니다. 실제 결과는 선택한 사진과 디자인 방향에 맞춰 달라집니다. 모바일에서는 각 장면이 화면에 들어올 때 순서대로 재생됩니다.
      </p>
    </div>
  );
}
