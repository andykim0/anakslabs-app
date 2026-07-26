import type { CSSProperties } from 'react';
import { workshopStockManifest } from '@/lib/stock/manifest';

const creditStyle: CSSProperties = {
  position: 'absolute',
  right: 'max(12px, 2.2vw)',
  bottom: 'max(10px, 1.8vw)',
  zIndex: 12,
  maxWidth: 'calc(100% - 24px)',
  color: '#fff',
  fontSize: '10px',
  lineHeight: 1.4,
  textAlign: 'right',
  textShadow: '0 1px 5px rgba(0,0,0,.9)',
};

const linkStyle: CSSProperties = {
  color: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};

export function StockAttributionCredit({ source }: { source?: string }) {
  if (!source) return null;
  const asset = workshopStockManifest().assets.find((item) => item.renditionUrl === source);
  if (!asset?.review.passed) return null;
  return (
    <small data-stock-attribution={asset.stockKey} style={creditStyle}>
      Photo by{' '}
      <a
        href={asset.attribution.photographerUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        {asset.attribution.photographer}
      </a>
      {' '}on{' '}
      <a
        href={asset.attribution.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        Pexels
      </a>
    </small>
  );
}
