import {
  formatKrw,
  getBasePricePresentation,
  type LaunchOfferEvaluationInput,
} from '@/lib/pricing';

export function LaunchPrice({
  tone = 'light',
  align = 'left',
  evaluation,
}: {
  tone?: 'light' | 'dark';
  align?: 'left' | 'right';
  /** Pure override for invariant tests; production callers use the pricing source defaults. */
  evaluation?: LaunchOfferEvaluationInput;
}) {
  const price = getBasePricePresentation(evaluation);
  const alignment = align === 'right' ? 'items-end text-right' : 'items-start text-left';
  const currentColor = tone === 'dark' ? 'text-white' : 'text-[#17181C]';
  const compareColor = tone === 'dark' ? 'text-white/45' : 'text-[#696E76]';
  const labelColor =
    tone === 'dark'
      ? 'border-white/15 bg-white/10 text-[#5DE0D0]'
      : 'border-[#D7E4F5] bg-[#EDF4FF] text-[#174DDA]';

  return (
    <div
      data-launch-price=""
      data-launch-offer-active={price.active ? 'true' : 'false'}
      className={`flex flex-col gap-1.5 ${alignment}`}
    >
      {price.compareAtPriceKrw !== null ? (
        <del data-launch-compare="" className={`text-sm decoration-2 ${compareColor}`}>
          {formatKrw(price.compareAtPriceKrw)}
        </del>
      ) : null}
      <span className={`text-3xl font-semibold tracking-[-0.04em] sm:text-4xl ${currentColor}`}>
        {formatKrw(price.currentPriceKrw)}
      </span>
      {price.conditionLabel ? (
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${labelColor}`}>
          {price.conditionLabel}
        </span>
      ) : null}
    </div>
  );
}
