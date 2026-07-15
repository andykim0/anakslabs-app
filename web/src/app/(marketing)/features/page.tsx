import type { Metadata } from 'next';
import { Bot, Gauge, Lock, MessageSquareQuote, Search, ShieldCheck } from 'lucide-react';
import { ScannerCta, SectionHeading } from '@/components/marketing/ui';
import { MotionShowcase } from '@/components/marketing/MotionShowcase';
import { BrowserFrame } from '@/components/marketing/mockups/BrowserFrame';
import { EditorMockup } from '@/components/marketing/mockups/EditorMockup';
import { SiteExampleMockup } from '@/components/marketing/mockups/SiteExampleMockup';

/** 단계별 목업 (없는 단계는 스크린샷 placeholder 슬롯 유지) */
function StepVisual({ no }: { no: string }) {
  if (no === '02')
    return (
      <div className="flex min-h-[172px] items-center justify-center">
        <SiteExampleMockup />
      </div>
    );
  if (no === '03')
    return (
      <BrowserFrame url="editor.anakslabs.com">
        <EditorMockup />
      </BrowserFrame>
    );
  return (
    <div className="flex aspect-[16/10] items-center justify-center rounded-xl border border-dashed border-[#E8E6E0] bg-[#F6F5F1] text-xs text-[#696E76]">
      화면 스크린샷 예정
    </div>
  );
}

export const metadata: Metadata = {
  title: '기능 — 검색·AI가 읽는 사이트를 만드는 방법',
  description:
    '설문부터 호스팅까지 5단계 작동 방식, SEO·AEO·GEO 엔진(JSON-LD·llms.txt·시맨틱 아웃라인·페이지별 sitemap), 포함·무료인 기본 모션과 AI 영상 홈페이지, 호스팅·보안까지.',
  alternates: { canonical: '/features' },
};

const STEPS = [
  { no: '01', title: '설문', body: '목적·업종·톤·레퍼런스를 고릅니다. 사이트 페이지 구성이 자동으로 잡힙니다.' },
  { no: '02', title: '1차 생성 — 디자인 3안', body: '테마·팔레트·히어로 비주얼(3D 렌더 포함)까지 세 가지 방향을 AI가 제시합니다.' },
  { no: '03', title: '캔버스 편집', body: 'PPT처럼 끌어서 이동·리사이즈. 페이지별로 자유배치 캔버스에서 다듬습니다.' },
  { no: '04', title: '2차 처리', body: '카피·이미지 다듬기, 사업자 정보·법적 푸터, 문의 버튼(카톡·전화)·지도 등 부가기능을 얹습니다.' },
  { no: '05', title: '호스팅', body: '버튼 하나로 서브도메인·SSL과 함께 라이브. 발행 즉시 SSR로 서빙됩니다.' },
];

const ENGINE = [
  {
    icon: <Search className="h-5 w-5" />,
    name: 'SEO',
    body: '페이지별 제목·설명, 시맨틱 마크업, 페이지별 sitemap을 자동 생성해 검색엔진이 읽고 색인할 수 있게 합니다.',
  },
  {
    icon: <MessageSquareQuote className="h-5 w-5" />,
    name: 'AEO',
    body: 'FAQ 등 질문형 콘텐츠와 구조화 데이터(JSON-LD)를 심어, 검색 결과의 답변 상자가 내 사이트에서 발췌할 수 있게 합니다.',
  },
  {
    icon: <Bot className="h-5 w-5" />,
    name: 'GEO',
    body: '본문을 텍스트로 두고 주체·연락처를 명시하며, llms.txt와 화면 비표시 시맨틱 아웃라인을 제공해 생성형 AI가 인용하기 쉽게 합니다.',
  },
];

const INFRA = [
  { icon: <Gauge className="h-5 w-5" />, title: 'SSR 서빙', body: '발행본을 서버 렌더링으로 제공 — 크롤러·AI가 즉시 텍스트를 읽습니다.' },
  { icon: <ShieldCheck className="h-5 w-5" />, title: '업로드 보안', body: '업로드 이미지·SVG는 저장 전 sanitize로 스크립트·위험 요소를 제거합니다.' },
  { icon: <Lock className="h-5 w-5" />, title: '멀티테넌트 격리', body: '고객 데이터는 테넌트 단위로 격리(RLS)되어 서로 접근할 수 없습니다.' },
];

export default function FeaturesPage() {
  return (
    <>
      {/* 헤더 */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#17181C] sm:text-4xl">
          검색·AI가 읽는 사이트,
          <br className="sm:hidden" /> 이렇게 만듭니다
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#5C6068]">
          예쁜 화면을 넘어, 처음부터 검색엔진과 생성형 AI가 읽을 수 있는 구조로 짓습니다.
        </p>
      </section>

      {/* 5단계 작동 방식 (스크린샷 슬롯 = placeholder) */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <SectionHeading title="작동 방식 — 설문에서 호스팅까지 5단계" />
        <div className="mt-12 space-y-5">
          {STEPS.map((s, i) => (
            <div
              key={s.no}
              className="grid items-center gap-5 rounded-2xl border border-[#E8E6E0] bg-white p-6 md:grid-cols-2"
            >
              <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                <p className="text-xs font-semibold tracking-widest text-[#856A26]">STEP {s.no}</p>
                <h3 className="mt-2 text-lg font-semibold text-[#17181C]">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5C6068]">{s.body}</p>
              </div>
              {/* 단계별 목업(02·03) 또는 스크린샷 placeholder 슬롯 */}
              <div className={i % 2 === 1 ? 'md:order-1' : ''}>
                <StepVisual no={s.no} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI 영상 홈페이지 데모 — 실제 영상(선택) + 기본 모션(포함·무료) */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <MotionShowcase />
        </div>
      </section>

      {/* AEO/GEO 엔진 (실제 구현 사실만) */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading
          title="검색을 넘어, AI에게 물어보는 시대"
          subtitle="세 관점 모두에서 “읽을 수 있는 상태”로 발행합니다. 아래는 실제로 구현된 기능입니다."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {ENGINE.map((p) => (
            <div key={p.name} className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3ECD8] text-[#856A26]">
                {p.icon}
              </span>
              <h3 className="mt-4 text-base font-semibold text-[#17181C]">{p.name}</h3>
              <p className="mt-2 text-sm leading-6 text-[#5C6068]">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-[#696E76]">
          제공: 페이지별 제목·설명 · JSON-LD 구조화 데이터 · 시맨틱 아웃라인 · llms.txt · 페이지별 sitemap.
        </p>
      </section>

      {/* 호스팅·보안·속도 */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <SectionHeading title="호스팅 · 보안 · 속도" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {INFRA.map((f) => (
              <div key={f.title} className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3ECD8] text-[#856A26]">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-base font-semibold text-[#17181C]">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5C6068]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-[#17181C]">
          내 사이트는 지금 몇 점일까요?
        </h2>
        <div className="mt-8 flex justify-center">
          <ScannerCta href="/#hero-scanner">무료로 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
