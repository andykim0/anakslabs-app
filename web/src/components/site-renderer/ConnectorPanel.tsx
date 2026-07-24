import type { CSSProperties, ReactNode } from 'react';
import type { SiteTheme } from '@/lib/types/site';
import type { SiteConnector, SiteConnectorManifest } from '@/lib/connectors/types';
import { connectorCatalogEntry } from '@/lib/connectors/catalog';
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
.anaks-connector__arrow{color:var(--connector-muted);font-size:1.15rem}
.anaks-connector__label{display:block;margin:1.15rem 0 0;font-weight:750;font-size:1.04rem;word-break:keep-all}
.anaks-connector__detail{display:block;margin:.35rem 0 0;color:var(--connector-muted);font-size:.86rem;line-height:1.55;word-break:keep-all}
.anaks-connector__map{grid-column:span 2}
.anaks-connector__map-preview{width:100%;height:15rem;margin-top:1rem;border:0;border-radius:calc(var(--connector-radius) * .72);overflow:hidden}
.anaks-connector__preview-button{align-self:flex-start;margin-top:.8rem;border:0;padding:.6rem .85rem;border-radius:999px;background:var(--connector-primary);color:var(--connector-bg);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
.anaks-connector__instagram{grid-column:span 2}
.anaks-connector__instagram-feed{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-top:1rem}
.anaks-connector__instagram-item{display:block;aspect-ratio:1;overflow:hidden;border-radius:calc(var(--connector-radius) * .65);background:color-mix(in srgb,var(--connector-primary) 8%,var(--connector-bg))}
.anaks-connector__instagram-item img{width:100%;height:100%;object-fit:cover}
@media(max-width:64rem){.anaks-connectors__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:47.99rem){.anaks-connectors{padding-block:3.75rem}.anaks-connectors__grid{grid-template-columns:1fr}.anaks-connector,.anaks-connector__map,.anaks-connector__instagram{grid-column:auto;min-height:8.75rem}.anaks-connector__instagram-feed{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){a.anaks-connector{transition:none}a.anaks-connector:hover{transform:none}}
`;

const ICONS: Record<SiteConnector['id'], string> = {
  tel: '☎',
  'kakao-channel': 'K',
  'naver-booking': 'N',
  'naver-map': '⌖',
  instagram: '◎',
};

function connectorDetail(item: SiteConnector): string {
  if (item.id === 'tel') return item.displayPhone;
  if (item.id === 'kakao-channel') return connectorCatalogEntry(item.id).description;
  if (item.id === 'naver-booking') return connectorCatalogEntry(item.id).description;
  if (item.id === 'naver-map') return item.address;
  return `@${item.username}`;
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
  instagramEndpoint,
  interactive,
}: {
  manifest: SiteConnectorManifest;
  theme: SiteTheme;
  siteId?: string;
  instagramEndpoint?: string;
  interactive: boolean;
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
  const kakaoJsKey = process.env.KAKAO_JAVASCRIPT_KEY?.trim();
  const naverClientId = process.env.NAVER_MAP_CLIENT_ID?.trim();

  return (
    <section className="anaks-connectors" style={style} aria-labelledby="anaks-connectors-title">
      <style dangerouslySetInnerHTML={{ __html: CONNECTOR_CSS }} />
      <div className="anaks-connectors__inner">
        <p className="anaks-connectors__eyebrow">바로 연결하기</p>
        <h2 id="anaks-connectors-title" className="anaks-connectors__title">필요한 곳으로 바로 이어집니다.</h2>
        <p className="anaks-connectors__lead">
          전화, 상담, 예약과 길찾기를 휴대폰에서도 편하게 이용하세요.
        </p>
        <div className="anaks-connectors__grid">
          {manifest.items.map((item) => {
            const isMap = item.id === 'naver-map';
            const isInstagram = item.id === 'instagram';
            const mapId = `anaks-map-${siteId ?? 'preview'}`;
            return (
              <div
                key={item.id}
                className={[
                  isMap ? 'anaks-connector__map' : '',
                  isInstagram ? 'anaks-connector__instagram' : '',
                ].filter(Boolean).join(' ') || undefined}
              >
                <ActionRoot
                  item={item}
                  interactive={interactive}
                  kakaoJsKey={kakaoJsKey}
                  className="anaks-connector"
                >
                  <span className="anaks-connector__top">
                    <span className="anaks-connector__icon" aria-hidden="true">{ICONS[item.id]}</span>
                    <span className="anaks-connector__arrow" aria-hidden="true">↗</span>
                  </span>
                  <span>
                    <span className="anaks-connector__label">{item.label}</span>
                    <span className="anaks-connector__detail">{connectorDetail(item)}</span>
                  </span>
                </ActionRoot>
                {isMap && item.coordinates && naverClientId && interactive ? (
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
                      지도 미리보기
                    </button>
                    <div id={mapId} className="anaks-connector__map-preview" hidden aria-label="네이버 지도 미리보기" />
                  </>
                ) : null}
                {isInstagram ? (
                  <div
                    className="anaks-connector__instagram-feed"
                    aria-label="최근 인스타그램 게시물"
                    {...(interactive && (instagramEndpoint || siteId)
                      ? {
                          'data-instagram-feed-endpoint':
                            instagramEndpoint ?? `/api/connectors/instagram/${siteId}`,
                        }
                      : {})}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {interactive ? <ConnectorRuntime /> : null}
    </section>
  );
}
