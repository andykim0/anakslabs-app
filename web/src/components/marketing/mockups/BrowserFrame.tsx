/**
 * [마케팅] 코드로 그린 브라우저 창 목업 (스톡 사진 금지 — Tailwind + 인라인만).
 * 신호등 점 3 + 주소창 + children. 순수 컴포넌트(애니메이션 없음, 서버/클라 공용).
 */
export function BrowserFrame({
  url = 'anakslabs.com',
  children,
  className,
}: {
  url?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[#E8E6E0] bg-white shadow-[0_10px_34px_rgba(23,24,28,0.07)] ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 border-b border-[#E8E6E0] bg-[#F6F5F1] px-3 py-2">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#E5675B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#E7B94C]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#5FB865]" />
        </span>
        <span className="ml-2 flex-1 truncate rounded-md border border-[#E8E6E0] bg-white px-2.5 py-1 text-[11px] text-[#696E76]">
          {url}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
