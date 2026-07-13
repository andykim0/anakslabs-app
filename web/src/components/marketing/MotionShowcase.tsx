/**
 * [마케팅] 영상 애드온 데모 섹션 — 2컬럼(텍스트 / 시네마틱 영상 목업).
 * 왼쪽: 애드온 아이브로우 + 카피 + /pricing 링크. 오른쪽: BrowserFrame 안 지연로드 영상 + '영상 애드온' 뱃지.
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
        <Eyebrow>영상 애드온</Eyebrow>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
          스크롤이 곧 연출이 되는 사이트
        </h2>
        <p className="mt-4 text-sm leading-7 text-[#5C6068]">
          영상 애드온을 더하면 AI가 생성한 시네마틱 영상으로 첫 화면을 살아있게 만듭니다. 스크롤 등장 모션은 기본 포함입니다.
        </p>
        <Link
          href="/pricing"
          className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#856A26] transition-colors hover:text-[#17181C]"
        >
          영상 애드온 자세히 보기
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </FadeIn>
      <FadeIn delay={0.08}>
        <div className="relative">
          <BrowserFrame url="premium.anakslabs.com">
            <PreviewVideo mode="inview" className="rounded-lg" />
          </BrowserFrame>
          <span className="absolute -top-2 right-4 z-10 rounded-full bg-[#9A7B33]/10 px-2.5 py-1 text-[11px] font-semibold text-[#9A7B33] ring-1 ring-[#9A7B33]/20">
            영상 애드온
          </span>
        </div>
      </FadeIn>
    </div>
  );
}
