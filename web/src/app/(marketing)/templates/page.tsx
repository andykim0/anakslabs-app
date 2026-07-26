import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { NAMED_TEMPLATE_CATALOG } from '@/lib/design/templates';

export const metadata: Metadata = {
  title: '홈페이지 템플릿 — 인테리어 업종 디자인',
  description:
    '인테리어 회사의 회사소개·사업분야·실적을 서로 다른 구성과 분위기로 보여주는 다보임 홈페이지 디자인을 살펴보세요.',
  alternates: { canonical: '/templates' },
};

const IMAGE_DIRECTION_LABELS = {
  abstract_editorial: '추상 편집 무대',
  '3d_brand_world': '입체 브랜드 무대',
  real_photo: '실사진 중심',
  realistic: '실사 무드',
  illustration_collage: '일러스트 조합',
} as const;

export default function TemplatesPage() {
  const count = NAMED_TEMPLATE_CATALOG.length;
  const countLead = count >= 20
    ? `수십 가지 중 인테리어 업종에 맞춘 ${count}가지를 먼저 공개합니다.`
    : `인테리어 업종에 맞춘 ${count}가지를 공개합니다.`;

  return (
    <main className="bg-[#F8FBFF] text-[#0B1736]">
      <section className="border-b border-[#DCE4F0] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-24">
          <p className="mkt-type-eyebrow font-mono tracking-[0.14em] text-[#174DDA] uppercase">
            Curated website directions
          </p>
          <div className="mt-5 grid items-end gap-8 lg:grid-cols-[1.15fr_.85fr]">
            <h1 className="mkt-type-page-title max-w-4xl font-semibold tracking-[-0.055em] break-keep">
              같은 회사 소개도,
              <br />구성과 리듬에 따라 달라집니다.
            </h1>
            <div>
              <p className="mkt-type-body max-w-xl text-[#526174] break-keep">
                {countLead} 색만 바꾼 복제가 아니라 첫 화면, 정보 순서, 이야기 방식과 움직임을 함께 큐레이션했습니다.
              </p>
              <p className="mkt-type-support mt-3 text-[#66758A]">
                예시 구성입니다. 실제 홈페이지에는 사장님이 확인한 내용만 들어갑니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {NAMED_TEMPLATE_CATALOG.map((template) => (
            <article
              key={template.id}
              className="overflow-hidden rounded-2xl border border-[#DCE4F0] bg-white shadow-[0_16px_42px_rgba(11,23,54,.07)]"
            >
              <div className="relative aspect-[8/5] overflow-hidden border-b border-[#DCE4F0] bg-[#EEF3F8]">
                <Image
                  src={template.previewImage}
                  alt={`${template.name} 인테리어 홈페이지 구성 예시`}
                  fill
                  loading="lazy"
                  sizes="(min-width: 1024px) 31vw, (min-width: 640px) 48vw, 92vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="mkt-type-card-title font-semibold tracking-[-0.025em]">
                    {template.name}
                  </h2>
                  <span className="mkt-type-support rounded-full bg-[#EEF3FF] px-2.5 py-1 font-medium text-[#174DDA]">
                    {IMAGE_DIRECTION_LABELS[template.recipe.imageDirectionId]}
                  </span>
                </div>
                <p className="mkt-type-body mt-3 text-[#5F6B7C]">{template.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-7 rounded-3xl bg-[#0B1736] px-6 py-9 text-white sm:px-10 md:flex-row md:items-center md:py-11">
          <div>
            <h2 className="mkt-type-section-title font-semibold tracking-[-0.04em] break-keep">
              내 내용으로 보면 선택이 더 쉬워집니다.
            </h2>
            <p className="mkt-type-body mt-3 text-white/64">
              업종과 실제 내용을 넣으면 이 중 맞는 구성만 3~6개로 좁혀 보여드립니다.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="mkt-type-control inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-white px-6 font-semibold text-[#0B1736] transition-transform hover:-translate-y-0.5"
          >
            내 홈페이지 구성 보기
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
