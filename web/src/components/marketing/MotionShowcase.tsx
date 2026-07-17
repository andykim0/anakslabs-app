/**
 * [마케팅] AI 영상 홈페이지 데모 섹션 — 기본 모션과 Daboim AI 영상 히어로를 구분한다.
 * 영상은 뷰포트 진입 시에만 로드·재생(PreviewVideo mode="inview"). 섹션은 FadeIn 등장(once).
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Eyebrow } from '@/components/marketing/Eyebrow';
import { FadeIn } from '@/components/motion/FadeIn';
import { BrowserFrame } from '@/components/marketing/mockups/BrowserFrame';
import { PreviewVideo } from '@/components/marketing/PreviewVideo';

export function MotionShowcase() {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <FadeIn>
        <Eyebrow>AI 영상 홈페이지</Eyebrow>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
          움직임도 브랜드의 언어가 됩니다
        </h2>
        <p className="mt-4 text-sm leading-7 text-[#5C6068]">
          기본 모션은 포함·무료입니다. AI 영상 홈페이지를 선택하면 Daboim AI 시네마틱 영상 히어로로 첫 장면을 연출합니다.
        </p>
        <Link
          href="/pricing"
          className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#174DDA] transition-colors hover:text-[#0B1736]"
        >
          AI 영상 홈페이지 자세히 보기
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </FadeIn>
      <FadeIn delay={0.08}>
        <div className="relative">
          <BrowserFrame url="cinematic.anakslabs.com">
            <PreviewVideo mode="inview" className="rounded-lg" />
          </BrowserFrame>
          <span className="absolute -top-2 right-4 z-10 rounded-full bg-gradient-to-r from-[#174DDA] to-[#03BFA9] px-2.5 py-1 font-mono text-[10px] font-semibold text-white ring-1 ring-white/70">
            AI 영상 홈페이지
          </span>
        </div>
      </FadeIn>
    </div>
  );
}
