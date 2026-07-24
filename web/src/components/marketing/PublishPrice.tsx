import { PUBLISH_PAYMENT_COPY } from '@/lib/pricing';

export function PublishPrice({
  tone = 'light',
  align = 'left',
}: {
  tone?: 'light' | 'dark';
  align?: 'left' | 'right';
}) {
  const alignment = align === 'right' ? 'items-end text-right' : 'items-start text-left';
  const currentColor = tone === 'dark' ? 'text-white' : 'text-[#17181C]';
  const detailColor = tone === 'dark' ? 'text-white/58' : 'text-[#5C6068]';

  return (
    <div data-publish-price className={`flex flex-col gap-1.5 ${alignment}`}>
      <span className={`text-3xl font-semibold tracking-[-0.04em] sm:text-4xl ${currentColor}`}>
        {PUBLISH_PAYMENT_COPY.monthlyRetainer}
      </span>
      <span className={`mkt-type-support ${detailColor}`}>{PUBLISH_PAYMENT_COPY.term}</span>
      <span className={`mkt-type-support ${detailColor}`}>{PUBLISH_PAYMENT_COPY.renewal}</span>
    </div>
  );
}
