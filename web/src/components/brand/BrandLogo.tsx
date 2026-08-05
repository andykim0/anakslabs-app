import Image from 'next/image';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

/**
 * Anaks Labs product lockup.
 *
 * The artwork is the marketing site's own raster identity, copied verbatim from
 * `../website/assets` — there is no vector master, and anakslabs.com itself ships
 * PNGs. `public/anakslabs-mark.png` is `icon-512.png`; `public/anakslabs-logo.png`
 * is `logo-inline.png`.
 */

/** The AL monogram, on its own. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <Image
      src="/anakslabs-mark.png"
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      priority
      className={`${className} object-contain`}
    />
  );
}

/**
 * The marketing site's stacked lockup (mark over wordmark), rendered as-is.
 * Kept for surfaces with vertical room; application chrome uses `BrandLogo`,
 * whose horizontal arrangement stays legible at header heights.
 */
export function BrandLockup({
  className = 'h-14',
  inverse = false,
}: {
  className?: string;
  inverse?: boolean;
}) {
  return (
    <Image
      src="/anakslabs-logo.png"
      alt={PUBLIC_BRAND_NAMES.brandBilingual}
      width={680}
      height={431}
      className={`${className} w-auto object-contain ${inverse ? 'brightness-0 invert' : ''}`}
      data-brand-bilingual="lockup"
    />
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
    <span
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap ${className}`}
      aria-label={PUBLIC_BRAND_NAMES.brandBilingual}
      data-brand-bilingual="logo"
    >
      <BrandMark className={`h-8 w-8 shrink-0 ${inverse ? 'brightness-0 invert' : ''}`} />
      {compact ? null : (
        <span
          className={`flex shrink-0 items-baseline whitespace-nowrap font-semibold leading-none ${inverse ? 'text-white' : 'text-[#141A3A]'}`}
        >
          <span
            data-brand-name="anaks-labs"
            className="shrink-0 whitespace-nowrap text-[17px] tracking-[-0.03em]"
          >
            {PUBLIC_BRAND_NAMES.brand}
          </span>
        </span>
      )}
    </span>
  );
}
