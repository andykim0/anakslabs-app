/** Daboim 제품 락업 — 웹 프레임과 SEO/AEO/GEO 발견 신호를 결합한다. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="daboim-mark-gradient" x1="4" y1="4" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#174DDA" />
          <stop offset="0.55" stopColor="#08B8E8" />
          <stop offset="1" stopColor="#03D1B8" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="12" fill="url(#daboim-mark-gradient)" />
      <rect x="7.5" y="8" width="29" height="27" rx="6" stroke="white" strokeWidth="2.8" />
      <path d="M8.5 15h27" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="13" cy="11.5" r="1.35" fill="white" />
      <circle cx="18" cy="11.5" r="1.35" fill="white" />
      <path d="m11.5 30 7-5.5 5.5 2.7 6.2-5.2 6-9" stroke="white" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m31.8 13.5 5.1-1.4-.8 5.1" stroke="white" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.5" cy="24.5" r="2" fill="#0B1736" stroke="white" strokeWidth="1.4" />
      <circle cx="24" cy="27.2" r="2" fill="#0B1736" stroke="white" strokeWidth="1.4" />
      <circle cx="30.2" cy="22" r="2" fill="#0B1736" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}

export function BrandLogo({
  className = '',
  inverse = false,
  compact = false,
}: {
  className?: string;
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Daboim 다보임">
      <BrandMark className="h-8 w-8 shrink-0" />
      {compact ? null : (
        <span className={`flex items-baseline font-semibold leading-none ${inverse ? 'text-white' : 'text-[#0B1736]'}`}>
          <span className="text-[17px] tracking-[-0.03em]">Daboim</span>
          <span className={`ml-1.5 text-[9px] tracking-[-0.02em] ${inverse ? 'text-white/55' : 'text-[#667085]'}`}>
            다보임
          </span>
        </span>
      )}
    </span>
  );
}
