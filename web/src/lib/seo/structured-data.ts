/**
 * [S-batch] 서빙 레이어 단일 소스 — canonical URL + JSON-LD 직렬화.
 * 라이브 서빙(app/s/[domain]/_shared.tsx)과 정적 발행물(lib/export/render-static)이
 * 같은 함수를 공유한다(측정 결함 ①: preflight가 서빙보다 빈약한 문서를 채점 / 실결함 ②:
 * 정적 발행물에 구조화 데이터 누락 — 둘 다 이 모듈로 해소).
 * 순수 함수 — node:test로 직접 검증.
 */
import type { SiteConfig } from '@/lib/types/site';
import { buildJsonLd } from './jsonld';

// [제품 확정] 목적별 schema.org 타입 매핑 — 구조화 데이터 단일 소스로 재노출(jsonld.ts 정의).
export { PURPOSE_SCHEMA_MAP, schemaSpecFor, type PurposeSchemaSpec } from './jsonld';

/** 테넌트 라이브 URL (canonical/JSON-LD 원천). domain 없으면 '' — 소비자가 생략 처리 */
export function siteUrlOf(domain: string | null | undefined): string {
  return domain ? `https://${domain}` : '';
}

/** 페이지 canonical URL — 홈은 사이트 루트, 서브페이지는 /{slug}. siteUrl 없으면 null(생략) */
export function canonicalUrlFor(siteUrl: string, pageSlug: string): string | null {
  const base = siteUrl.replace(/\/+$/, '');
  if (!base) return null;
  return pageSlug === '' ? base : `${base}/${pageSlug}`;
}

/** JSON-LD 노드 배열 — buildJsonLd 위임(구조화 데이터 단일 소스는 lib/seo/jsonld.ts) */
export function structuredDataNodes(config: SiteConfig, siteUrl: string): Record<string, unknown>[] {
  return buildJsonLd(config, siteUrl);
}

/**
 * 인라인 <script type="application/ld+json"> 콘텐츠 — '<'를 <로 이스케이프해
 * '</script>' 등 스크립트 탈출을 원천 차단(JSON 의미는 동일 — 파서가 동일 값으로 해석).
 */
export function jsonLdScriptContent(config: SiteConfig, siteUrl: string): string {
  return JSON.stringify(structuredDataNodes(config, siteUrl)).replace(/</g, '\\u003c');
}
