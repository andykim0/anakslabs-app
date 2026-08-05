import type { CSSProperties, ReactNode } from 'react';
import type { SiteTheme } from '@/lib/types/site';
import type { SiteConnector, SiteConnectorManifest } from '@/lib/connectors/types';
import { connectorCatalogEntry } from '@/lib/connectors/catalog';
import { ConnectorBrandMark } from './ConnectorBrandMark';
import { ConnectorRuntime } from './ConnectorRuntime';

const CONNECTOR_CSS = `
.anaks-connectors{padding:clamp(3.5rem,8vw,7rem) var(--theme-section-inline,clamp(1.25rem,5vw,5rem));background:color-mix(in srgb,var(--connector-bg) 92%,var(--connector-primary) 8%);color:var(--connector-text)}
.anaks-connectors__inner{width:min(72rem,100%);margin:0 auto}
.anaks-connectors__eyebrow{margin:0 0 .75rem;color:var(--connector-primary);font-size:.76rem;font-weight:700;letter-spacing:.08em}
.anaks-connectors__title{margin:0;font-family:var(--connector-heading);font-size:clamp(1.75rem,4vw,3.25rem);line-height:1.16;word-break:keep-all}
.anaks-connectors__lead{max-width:38rem;margin:.9rem 0 0;color:var(--connector-muted);font-size:clamp(.95rem,1.5vw,1.08rem);line-height:1.75;word-break:keep-all}
.anaks-connectors__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--theme-element-gap,1rem);margin-top:clamp(1.75rem,4vw,3rem)}
.anaks-connector{display:flex;min-width:0;min-height:10.5rem;flex-direction:column;justify-content:space-between;padding:1.35rem;text-decoration:none;color:inherit;border:1px solid var(--connector-border);border-radius:var(--connector-radius);background:var(--connector-surface);box-shadow:var(--connector-shadow);transition:transform var(--theme-duration-fast,180ms) var(--theme-easing-standard,ease),border-color var(--theme-duration-fast,180ms) var(--theme-easing-standard,ease)}
a.anaks-connector:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--connector-primary) 52%,var(--connector-border))}
.anaks-connector__top{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.anaks-connector__icon{display:grid;width:2.4rem;height:2.4rem;place-items:center;border-radius:999px;color:var(--connector-primary);background:color-mix(in srgb,var(--connector-primary) 12%,transparent);font-weight:800}
.anaks-connector__brand{display:flex;min-width:2.75rem;min-height:3rem;align-items:center;justify-content:flex-start;flex:none}
.anaks-connector__brand-image{display:block;max-width:100%;object-fit:contain;filter:none}
.anaks-connector__brand--kakao-channel{width:6.5rem}
.anaks-connector__brand--naver-booking{width:6.25rem;padding-inline:.2rem}
.anaks-connector__brand--naver-map,.anaks-connector__brand--instagram{width:3rem;justify-content:center}
.anaks-connector__arrow{color:var(--connector-muted);font-size:1.15rem}
.anaks-connector__label{display:block;margin:1.15rem 0 0;font-weight:750;font-size:1.04rem;word-break:keep-all}
.anaks-connector__detail{display:block;margin:.35rem 0 0;color:var(--connector-muted);font-size:.86rem;line-height:1.55;word-break:keep-all}
.anaks-connector__map{grid-column:span 2}
.anaks-connector__map-preview{width:100%;height:15rem;margin-top:1rem;border:0;border-radius:calc(var(--connector-radius) * .72);overflow:hidden}
.anaks-connector__preview-button{align-self:flex-start;margin-top:.8rem;border:0;padding:.6rem .85rem;border-radius:999px;background:var(--connector-primary);color:var(--connector-bg);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
@media(max-width:64rem){.anaks-connectors__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:47.99rem){.anaks-connectors{padding-block:3.75rem}.anaks-connectors__grid{grid-template-columns:1fr}.anaks-connector,.anaks-connector__map{grid-column:auto;min-height:8.75rem}}
@media(prefers-reduced-motion:reduce){a.anaks-connector{transition:none}a.anaks-connector:hover{transform:none}}
`;

function connectorDetail(item: SiteConnector): string {
  if (item.id === 'tel') return item.displayPhone;
  if (item.id === 'kakao-channel') return connectorCatalogEntry(item.id).description;
  if (item.id === 'naver-booking' || item.id === 'booking') {
    return connectorCatalogEntry(item.id).description;
  }
  if (item.id === 'naver-map' || item.id === 'map') return item.address;
  return `@${item.username}`;
}

const GENERIC_CONNECTOR_ICONS = {
  booking: '▣',
  map: '⌖',
} as const;

type GenericConnectorId = keyof typeof GENERIC_CONNECTOR_ICONS;

function isGenericConnectorId(id: SiteConnector['id']): id is GenericConnectorId {
  return id in GENERIC_CONNECTOR_ICONS;
}

function ActionRoot({
  item,
  interactive,
  children,
  className,
  kakaoJsKey,
}: {
  item: SiteConnector;
  interactive: boolean;
  children: ReactNode;
  className: string;
  kakaoJsKey?: string;
}) {
  if (!interactive) return <div className={className}>{children}</div>;
  return (
    <a
      className={className}
      href={item.href}
      {...(item.id === 'kakao-channel' && kakaoJsKey
        ? {
            'data-kakao-channel-id': item.channelId,
            'data-kakao-js-key': kakaoJsKey,
          }
        : {})}
      {...(!item.href.startsWith('tel:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

export function ConnectorPanel({
  manifest,
  theme,
  siteId,
  interactive,
  runtimeDelivery = 'client',
}: {
  manifest: SiteConnectorManifest;
  theme: SiteTheme;
  siteId?: string;
  interactive: boolean;
  runtimeDelivery?: 'inline' | 'client';
}) {
  const style = {
    '--connector-bg': theme.palette.background,
    '--connector-surface': theme.palette.surface,
    '--connector-text': theme.palette.text,
    '--connector-muted': theme.palette.muted,
    '--connector-primary': theme.palette.primary,
    '--connector-border': theme.tokens?.color.border ?? theme.palette.muted,
    '--connector-radius': theme.tokens?.radius.soft ?? `${theme.radius ?? 12}px`,
    '--connector-shadow': theme.tokens?.shadow.low ?? '0 12px 36px rgb(0 0 0 / 8%)',
    '--connector-heading': theme.fonts.heading,
  } as CSSProperties;
  // Korea-only browser SDK credentials are intentionally unavailable in the
  // US product. Legacy connector records retain plain-link fallbacks only.
  const kakaoJsKey: string | undefined = undefined;
  const naverClientId: string | undefined = undefined;

  return (
    <section className="anaks-connectors" style={style} aria-labelledby="anaks-connectors-title">
      <style dangerouslySetInnerHTML={{ __html: CONNECTOR_CSS }} />
      <div className="anaks-connectors__inner">
        <p className="anaks-connectors__eyebrow">Connect directly</p>
        <h2 id="anaks-connectors-title" className="anaks-connectors__title">Go straight to the next step.</h2>
        <p className="anaks-connectors__lead">
          Call, message, book, or get directions from any device.
        </p>
        <div className="anaks-connectors__grid">
          {manifest.items.map((item) => {
            const isMap = item.id === 'naver-map' || item.id === 'map';
            const isNaverMap = item.id === 'naver-map';
            const mapId = `anaks-map-${siteId ?? 'preview'}`;
            return (
              <div
                key={item.id}
                className={isMap ? 'anaks-connector__map' : undefined}
              >
                <ActionRoot
                  item={item}
                  interactive={interactive}
                  kakaoJsKey={kakaoJsKey}
                  className="anaks-connector"
                >
                  <span className="anaks-connector__top">
                    {item.id === 'tel' ? (
                      <span className="anaks-connector__icon" aria-hidden="true">☎</span>
                    ) : isGenericConnectorId(item.id) ? (
                      <span
                        className="anaks-connector__icon"
                        data-connector-icon={item.id}
                        aria-hidden="true"
                      >
                        {GENERIC_CONNECTOR_ICONS[item.id]}
                      </span>
                    ) : (
                      <ConnectorBrandMark
                        connectorId={item.id}
                        surface={theme.palette.surface}
                      />
                    )}
                    <span className="anaks-connector__arrow" aria-hidden="true">↗</span>
                  </span>
                  <span>
                    <span className="anaks-connector__label">{item.label}</span>
                    <span className="anaks-connector__detail">{connectorDetail(item)}</span>
                  </span>
                </ActionRoot>
                {isNaverMap && item.coordinates && naverClientId && interactive ? (
                  <>
                    <button
                      type="button"
                      className="anaks-connector__preview-button"
                      data-naver-map-preview
                      data-naver-client-id={naverClientId}
                      data-latitude={item.coordinates.latitude}
                      data-longitude={item.coordinates.longitude}
                      data-map-target={mapId}
                    >
                      Map preview
                    </button>
                    <div id={mapId} className="anaks-connector__map-preview" hidden aria-label="Map preview" />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {interactive && runtimeDelivery === 'client' ? <ConnectorRuntime /> : null}
    </section>
  );
}
