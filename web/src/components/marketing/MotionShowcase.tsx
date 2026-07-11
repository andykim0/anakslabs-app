'use client';

/**
 * [마케팅] 스크롤 등장 모션 쇼케이스 — 테넌트 사이트가 쓰는 실제 Reveal 시스템을
 * 그대로 재사용한다("우리 사이트가 곧 데모"). Reveal 자체는 게이팅되지 않으므로
 * (게이팅은 테넌트 서빙의 SiteRenderer 호출부) 마케팅 데모로 직접 쓸 수 있다.
 */
import type { Entrance } from '@/lib/types/site';
import { Reveal } from '@/components/site-renderer/Reveal';

const BLOCKS: { effect: Entrance['effect']; title: string; body: string }[] = [
  { effect: 'fade-up', title: '아래에서 부드럽게', body: '스크롤이 닿으면 요소가 살며시 떠오릅니다.' },
  { effect: 'slide-left', title: '옆에서 미끄러지듯', body: '방향을 준 등장으로 시선을 자연스럽게 이끕니다.' },
  { effect: 'zoom-in', title: '살짝 확대되며', body: '핵심 요소를 강조하는 확대 등장.' },
];

export function MotionShowcase() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {BLOCKS.map((b, i) => (
        <Reveal key={i} entrance={{ effect: b.effect, duration: 700, delay: i * 120 }}>
          <div className="h-full rounded-2xl border border-[#E8E6E0] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <span className="text-xs font-semibold tracking-widest text-[#856A26]">MOTION</span>
            <h3 className="mt-3 text-base font-semibold text-[#17181C]">{b.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">{b.body}</p>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
