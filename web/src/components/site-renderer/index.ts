/**
 * 멀티테넌트 사이트 렌더러 — 대시보드/에디터 미리보기에서도 재사용.
 * 사용 예: <SiteRenderer config={site.siteConfig} mode="desktop" />
 */
export { SiteRenderer, type SiteRendererMode } from './SiteRenderer';
export { LegalFooter } from './LegalFooter';
export { SemanticOutline } from './SemanticOutline';
export { SuspendedNotice } from './SuspendedNotice';
export { ElementContent, type RenderVariant } from './ElementContent';
export { SectionCanvas } from './SectionCanvas';
export { SectionStack } from './SectionStack';
export { cqw, mobileFontSize } from './scale';
