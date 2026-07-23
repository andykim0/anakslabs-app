import type { CSSProperties } from 'react';
import type { HeroPhotoResponsivePromotion } from '@/lib/types/site';
import { safeMediaSrc } from '@/lib/safe-url';

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

function position(point?: { x: number; y: number }): string {
  const normalized = point ?? { x: 0.5, y: 0.5 };
  return `${Math.round(normalized.x * 10_000) / 100}% ${Math.round(normalized.y * 10_000) / 100}%`;
}

function stableDomId(input: string): string {
  let hash = 2_166_136_261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `hero-photo-${(hash >>> 0).toString(36)}`;
}

export function ResponsiveHeroPhoto({
  src,
  alt,
  promotion,
  focalPoint,
  compactFocalPoint,
  mobileFocalPoint,
  loading,
  decoding,
  fetchPriority,
  imageStyle,
  imageData,
  width,
  height,
}: {
  src: string;
  alt: string;
  promotion: HeroPhotoResponsivePromotion;
  focalPoint?: { x: number; y: number };
  compactFocalPoint?: { x: number; y: number };
  mobileFocalPoint?: { x: number; y: number };
  loading?: 'eager' | 'lazy';
  decoding?: 'sync' | 'async' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
  imageStyle?: CSSProperties;
  imageData?: Record<string, string>;
  width?: number;
  height?: number;
}) {
  const safeSrc = safeMediaSrc(src);
  const domId = stableDomId([
    src,
    position(focalPoint),
    position(compactFocalPoint),
    position(mobileFocalPoint),
  ].join('|'));
  const sourceFor = (promoted: boolean) => promoted ? safeSrc : TRANSPARENT_PIXEL;
  return (
    <picture
      data-responsive-hero-photo={domId}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <source media="(min-width: 1280px)" srcSet={sourceFor(promotion.wide.promoted)} />
      <source
        media="(min-width: 768px)"
        srcSet={sourceFor(promotion.compact.promoted)}
      />
      <source srcSet={sourceFor(promotion.mobile.promoted)} />
      <style
        dangerouslySetInnerHTML={{
          __html: `@media(min-width:768px) and (max-width:1279px){[data-responsive-hero-photo="${domId}"]>img{object-position:${position(compactFocalPoint)}!important}}@media(max-width:767px){[data-responsive-hero-photo="${domId}"]>img{object-position:${position(mobileFocalPoint)}!important}}`,
        }}
      />
      <img
        src={sourceFor(promotion.mobile.promoted)}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: position(focalPoint),
          ...imageStyle,
        }}
        {...imageData}
      />
    </picture>
  );
}
