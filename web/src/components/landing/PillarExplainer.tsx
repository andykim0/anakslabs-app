/**
 * [v3 Phase 6] SEO/AEO/GEO 3축 설명 — "검색을 넘어 AI에게 물어보는 시대".
 * 상태 서술 카피만 (순위·노출 보장 표현 금지).
 */
import { Bot, MessageSquareQuote, Search } from 'lucide-react';

const PILLARS = [
  {
    icon: <Search className="h-5 w-5" />,
    name: 'SEO',
    title: '네이버 · 구글 검색',
    body: '제목·설명·구조화된 마크업이 갖춰져야 검색엔진이 페이지를 읽고 색인할 수 있습니다. 기본이 비면 검색에 존재하지 않는 것과 같습니다.',
  },
  {
    icon: <MessageSquareQuote className="h-5 w-5" />,
    name: 'AEO',
    title: 'FAQ · 음성 · 요약 답변',
    body: '질문형 콘텐츠와 구조화 데이터(JSON-LD)가 있어야 검색 결과의 답변 상자·음성 비서가 내 사이트에서 발췌할 수 있습니다.',
  },
  {
    icon: <Bot className="h-5 w-5" />,
    name: 'GEO',
    title: 'ChatGPT · Perplexity 인용',
    body: '본문이 텍스트로 존재하고 연락처·주체가 명시돼야 생성형 AI가 "이 동네 ○○ 추천해줘"에 내 가게를 근거로 인용할 수 있습니다.',
  },
];

export function PillarExplainer() {
  return (
    <section className="border-t border-neutral-900 bg-[#0d0d0e]">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-neutral-50">
          검색을 넘어, AI에게 물어보는 시대
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-neutral-400">
          이제 손님은 검색창만 쓰지 않습니다. 답변 상자에서 바로 읽고, AI에게 추천을 묻습니다.
          사이트가 세 관점 모두에서 &ldquo;읽을 수 있는 상태&rdquo;여야 어디서든 발견됩니다.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.name} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2a2117] text-[#d9b878]">
                {p.icon}
              </span>
              <h3 className="mt-4 text-base font-semibold text-neutral-100">
                {p.name} <span className="ml-1 text-sm font-normal text-neutral-500">{p.title}</span>
              </h3>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
