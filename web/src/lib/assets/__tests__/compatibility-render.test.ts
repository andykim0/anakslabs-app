import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { projectAssetIngressResponse } from '../compatibility';

function legacyConfig(imageUrl: string): SiteConfig {
  return {
    version: 2,
    theme: emptySiteConfig('legacy-provenance-off').theme,
    meta: { title: '기존 사이트', description: '기존 URL-only 사이트 설명' },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [{
        id: 'hero',
        type: 'hero',
        name: '히어로',
        height: 720,
        background: { image: { src: imageUrl } },
        elements: [{
          id: 'heading',
          kind: 'text',
          frame: { x: 120, y: 180, w: 720, h: 120 },
          z: 1,
          text: '기존 콘텐츠는 그대로 보입니다',
          style: { fontSize: 52, fontFamily: 'heading', fontWeight: 700 },
        }],
      }],
    }],
  };
}

function staticBody(config: SiteConfig): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: true,
    animate: true,
  }));
}

test('WRITE OFF legacy URL flow preserves renderer DOM and static-export document exactly', () => {
  const originalUrl = '/mock/interior-modern.svg';
  const response = projectAssetIngressResponse({ url: originalUrl }, false);
  assert.deepEqual(response, { url: originalUrl });
  assert.equal('assetRef' in response, false);

  const before = legacyConfig(originalUrl);
  const after: SiteConfig = siteConfigSchema.parse(legacyConfig(response.url));
  assert.equal(Object.hasOwn(after, 'assetRefs'), false);

  const beforeBody = staticBody(before);
  const afterBody = staticBody(after);
  assert.equal(afterBody, beforeBody);

  const shell = (config: SiteConfig, bodyHtml: string) => buildDocumentShell({
    config,
    pageSlug: '',
    headerHtml: '',
    bodyHtml,
    siteUrl: 'https://legacy.example.com',
  });
  assert.equal(shell(after, afterBody), shell(before, beforeBody));
});
