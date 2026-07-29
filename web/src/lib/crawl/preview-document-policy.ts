import type { SiteConfig } from '@/lib/types/site';
import type { SharedSitePreviewRecord } from './contracts';

export interface PreviewDocumentPolicy {
  lang: 'en' | 'ko';
  preventMachineTranslation: boolean;
}

const KOREAN_PREVIEW_POLICY: PreviewDocumentPolicy = {
  lang: 'ko',
  preventMachineTranslation: false,
};

export function resolvePreviewDocumentPolicy(
  config: Pick<SiteConfig, 'meta'> | null | undefined,
  renderMode: SharedSitePreviewRecord['renderMode'] | undefined = 'standard',
): PreviewDocumentPolicy {
  if (!config || config.meta.locale !== 'en-US') return KOREAN_PREVIEW_POLICY;

  return {
    lang: 'en',
    preventMachineTranslation:
      renderMode !== 'standard'
      && config.meta.market === 'US-CA'
      && config.meta.jurisdiction === 'US',
  };
}
