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
  title: '기능 — 손님이 찾고 바로 이해하는 홈페이지',
  description:
    '사장님이 몇 가지 질문에 답하면 디자인 3안을 만들고, 직접 고친 뒤 바로 엽니다. 손님이 검색하거나 AI에 물을 때 필요한 정보, 기본 모션, 호스팅과 보안까지 함께 제공합니다.',
  alternates: { canonical: '/features' },
};

const STEPS = [
  { no: '01', title: '몇 가지 질문에 답합니다', body: '업종, 지역, 원하는 분위기와 참고할 홈페이지를 고르면 필요한 페이지를 먼저 정합니다.' },
  { no: '02', title: '서로 다른 디자인 3안을 봅니다', body: '사진 배치, 색, 글꼴과 첫 화면이 다른 세 가지 방향을 보고 마음에 드는 안을 고릅니다.' },
  { no: '03', title: '원하는 곳을 직접 다듬습니다', body: '하나로 이어지는 홈페이지 화면에서 PPT를 다루듯 글과 사진을 끌어 옮기고 크기를 바꿉니다.' },
  { no: '04', title: '장사 정보를 빠짐없이 채웁니다', body: '문구와 사진을 다듬고, 사업자 정보, 전화·카카오톡·예약 버튼과 지도를 넣습니다.' },
  { no: '05', title: '버튼 한 번으로 홈페이지를 엽니다', body: '안전한 주소와 보안 연결을 붙여 바로 공개합니다. 손님은 휴대폰과 컴퓨터에서 곧바로 볼 수 있습니다.' },
];

const ENGINE = [
  {
    icon: <Search className="h-5 w-5" />,
    name: 'SEO',
    body: '가게 이름, 지역, 서비스와 페이지 내용을 분명히 적어 네이버와 구글이 찾기 쉽게 합니다.',
  },
  {
    icon: <MessageSquareQuote className="h-5 w-5" />,
    name: 'AEO',
    body: '영업시간, 주차, 예약처럼 손님이 자주 묻는 내용을 질문과 답으로 또렷하게 정리합니다.',
  },
  {
    icon: <Bot className="h-5 w-5" />,
    name: 'GEO',
    body: '가게 이름, 연락처와 공식 채널을 같은 정보로 맞춰 AI가 어느 정보가 공식인지 확인하기 쉽게 합니다.',
  },
];

const INFRA = [
  { icon: <Gauge className="h-5 w-5" />, title: '처음부터 글이 보이는 페이지', body: '손님과 검색 서비스가 기다리지 않고 핵심 글을 바로 읽을 수 있게 제공합니다.' },
  { icon: <ShieldCheck className="h-5 w-5" />, title: '올린 파일 안전 확인', body: '사진과 그림 파일은 저장하기 전에 위험한 코드가 들어 있는지 확인합니다.' },
  { icon: <Lock className="h-5 w-5" />, title: '고객별 데이터 분리', body: '사장님의 사이트와 자료는 다른 고객이 열어볼 수 없도록 나눠 보관합니다.' },
];

export default function FeaturesPage() {
  return (
    <>
      {/* 헤더 */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">
          손님이 찾고,
          <br className="sm:hidden" /> 궁금한 점까지 확인하는 홈페이지
        </h1>
        <p className="mkt-type-body mx-auto mt-4 max-w-xl text-[#5C6068]">
          예쁘게만 만들지 않습니다. 손님이 네이버·구글에서 찾고 AI에 물어볼 때, 가게 정보를 확인하기 쉽게 만듭니다.
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
                <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">STEP {s.no}</p>
                <h3 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">{s.title}</h3>
                <p className="mkt-type-body mt-2 text-[#5C6068]">{s.body}</p>
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
          title="손님이 가게를 찾는 세 순간을 준비합니다"
          subtitle="검색하고, 자주 묻는 답을 보고, AI에 물어볼 때 같은 공식 정보를 확인할 수 있게 만듭니다."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {ENGINE.map((p) => (
            <div key={p.name} className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3ECD8] text-[#856A26]">
                {p.icon}
              </span>
              <h3 className="mkt-type-card-title mt-4 font-semibold text-[#17181C]">{p.name}</h3>
              <p className="mkt-type-body mt-2 text-[#5C6068]">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mkt-type-support mx-auto mt-8 max-w-2xl text-center text-[#696E76]">
          기술 항목: 페이지별 제목·설명 · JSON-LD · 시맨틱 HTML · crawler 정책 · 페이지별 sitemap · 네이버 IndexNow.
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
                <h3 className="mkt-type-card-title mt-4 font-semibold text-[#17181C]">{f.title}</h3>
                <p className="mkt-type-body mt-2 text-[#5C6068]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="mkt-type-section-title font-semibold tracking-tight text-[#17181C]">
          내 사이트는 지금 몇 점일까요?
        </h2>
        <div className="mt-8 flex justify-center">
          <ScannerCta href="/#hero-scanner">무료로 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
