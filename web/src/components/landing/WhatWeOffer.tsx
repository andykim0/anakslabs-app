/**
 * [v3 Phase 6] 우리가 만드는 것 — "예쁜 사이트가 아니라, 검색·AI가 읽을 수 있게 태어난 사이트."
 * 기존 "세 단계면 끝" 3카드를 이 섹션 하위로 흡수.
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const STEPS = [
  {
    no: '01',
    title: '설문',
    body: '목적과 업종을 고르면 사이트 구성이 자동으로 잡힙니다. 5분이면 충분합니다.',
  },
  {
    no: '02',
    title: 'AI 디자인 3안',
    body: '3D 렌더 스타일을 포함한 디자인 방향 세 가지 중 하나를 고릅니다.',
  },
  {
    no: '03',
    title: '캔버스 편집 · 발행',
    body: 'PPT처럼 끌어서 다듬고, 버튼 하나로 라이브. 도메인과 SSL까지 포함.',
  },
];

export function WhatWeOffer() {
  return (
    <section className="border-t border-neutral-900">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-neutral-50">
          예쁜 사이트가 아니라,
          <br className="sm:hidden" /> 검색·AI가 읽을 수 있게 태어난 사이트
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-neutral-400">
          아낙스랩스가 만드는 사이트는 제목·구조화 데이터·시맨틱 마크업·사업자 정보까지 처음부터
          갖춘 상태로 발행됩니다. 고객은 아무것도 만지지 않아도 됩니다.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.no} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
              <p className="text-xs font-semibold tracking-widest text-[#c8a96a]">{step.no}</p>
              <h3 className="mt-3 text-base font-semibold text-neutral-100">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/login"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#c8a96a] px-7 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
          >
            내 사이트 시작하기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
