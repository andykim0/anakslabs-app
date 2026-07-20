import {
  CalendarDays,
  MapPin,
  MousePointerClick,
  Phone,
} from 'lucide-react';

const METRICS = [
  {
    label: '페이지 조회',
    value: '1,284',
    detail: '지난달보다 18% 늘었어요',
    icon: MousePointerClick,
  },
  {
    label: '전화 클릭',
    value: '47',
    detail: '지난달보다 9건 늘었어요',
    icon: Phone,
  },
  {
    label: '예약 클릭',
    value: '31',
    detail: '지난달보다 6건 늘었어요',
    icon: CalendarDays,
  },
  {
    label: '길찾기 클릭',
    value: '22',
    detail: '지난달보다 4건 늘었어요',
    icon: MapPin,
  },
] as const;

const SOURCES = [
  { label: '네이버', value: '612건 · 48%', width: 'w-[48%]' },
  { label: '구글', value: '321건 · 25%', width: 'w-1/4' },
  { label: '인스타그램', value: '193건 · 15%', width: 'w-[15%]' },
] as const;

export function MonthlyReportPreview() {
  return (
    <figure
      data-report-preview
      className="overflow-hidden rounded-[28px] border border-[#C8D8EC] bg-white shadow-[0_28px_80px_rgba(34,70,120,0.12)]"
      aria-labelledby="report-preview-title"
    >
      <figcaption className="flex flex-wrap items-start justify-between gap-4 border-b border-[#DCE4F0] bg-[linear-gradient(110deg,#F4F8FF,#F0FCF9)] px-5 py-5 sm:px-7">
        <div>
          <span className="mkt-type-eyebrow inline-flex rounded-full bg-[#174DDA] px-3 py-1 font-semibold tracking-[0.08em] text-white">
            예시 · 실제 고객 데이터 아님
          </span>
          <h3 id="report-preview-title" className="mkt-type-card-title mt-3 font-semibold tracking-[-0.025em]">
            작은가게의 2026년 6월 성과
          </h3>
        </div>
        <span className="mkt-type-support text-[#667085]">매월 이메일 발송</span>
      </figcaption>

      <div className="p-5 sm:p-7">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[#DCE4F0] lg:grid-cols-4">
          {METRICS.map(({ label, value, detail, icon: Icon }) => (
            <div key={label} className="bg-[#F8FBFF] p-4">
              <p className="mkt-type-support flex items-center gap-2 font-semibold text-[#526174]">
                <Icon className="h-4 w-4 text-[#174DDA]" aria-hidden />
                {label}
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#0B1736]">
                {value}<span className="ml-1 text-xs font-normal text-[#667085]">건</span>
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[#087D70]">{detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 grid gap-7 sm:grid-cols-[1fr_.78fr]">
          <section aria-labelledby="report-sources-title">
            <h4 id="report-sources-title" className="mkt-type-body font-semibold text-[#26354D]">
              어디서 찾아왔나요?
            </h4>
            <dl className="mt-4 space-y-4">
              {SOURCES.map((source) => (
                <div key={source.label}>
                  <div className="mkt-type-support mb-1.5 flex justify-between gap-3 text-[#526174]">
                    <dt>{source.label}</dt>
                    <dd>{source.value}</dd>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#E8EEF6]">
                    <div className={`h-full rounded-full bg-[linear-gradient(90deg,#174DDA,#03A995)] ${source.width}`} />
                  </div>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-labelledby="report-summary-title"
            className="border-l-2 border-[#5DE0D0] bg-[#F1FCF9] px-5 py-4"
          >
            <p className="mkt-type-eyebrow font-semibold tracking-[0.08em] text-[#087D70]">이번 달 한 줄</p>
            <h4 id="report-summary-title" className="mkt-type-body mt-3 font-semibold leading-7 text-[#163D3A]">
              네이버에서 들어온 방문과 전화 클릭이 함께 늘었어요.
            </h4>
            <p className="mkt-type-support mt-3 text-[#47706C]">
              저장된 익명 집계 숫자만으로 만든 안내입니다.
            </p>
          </section>
        </div>

        <p className="mkt-type-support mt-6 border-t border-[#E8EEF6] pt-4 text-[#667085]">
          방문은 고유한 사람 수가 아니라 홈페이지 페이지가 열린 횟수입니다. 위 숫자는 화면 설명을 위한 가상 예시입니다.
        </p>
      </div>
    </figure>
  );
}
