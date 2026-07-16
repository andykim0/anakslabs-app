import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { resolveSiteAssetPolicyCore } from '../assignment-core';
import type { AssetProvenanceConfig } from '../provenance-flags-core';
import type { AssetRecord } from '../provenance';
import { projectAssetIngressResponse } from '../compatibility';
import { rewriteAssetReferences } from '@/lib/export/rewrite-asset-references';

const FLAGS_OFF: AssetProvenanceConfig = {
  write: false,
  assign: false,
  enforceNewSites: false,
  enforceLegacy: false,
  beforeAfterEnabled: false,
  beforeAfterApprovedIndustries: [],
};

const ENFORCE_V2: AssetProvenanceConfig = {
  write: true,
  assign: true,
  enforceNewSites: true,
  enforceLegacy: false,
  beforeAfterEnabled: false,
  beforeAfterApprovedIndustries: [],
};

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
  const policy = resolveSiteAssetPolicyCore({
    operation: 'audit',
    config: after,
    clientId: 'legacy-owner',
    assetPolicyVersion: undefined,
    phase: 'render',
    flags: FLAGS_OFF,
    records: [],
    attestations: { generalAttestation: null, personConsentsByAssetId: new Map() },
  });
  assert.equal(policy.mode, 'legacy-bypass');
  assert.equal(policy.config, after, 'legacy bypass must preserve the exact config identity');

  const beforeBody = staticBody(before);
  const afterBody = staticBody(policy.config);
  assert.equal(afterBody, beforeBody);

  const shell = (config: SiteConfig, bodyHtml: string) => buildDocumentShell({
    config,
    pageSlug: '',
    headerHtml: '',
    bodyHtml,
    siteUrl: 'https://legacy.example.com',
  });
  assert.equal(shell(policy.config, afterBody), shell(before, beforeBody));
});

test('hosted metadata/body and static export use the shared policy projection before media output', () => {
  const shared = readFileSync('src/app/s/[domain]/_shared.tsx', 'utf8');
  const exporter = readFileSync('src/lib/export/exporter.ts', 'utf8');

  assert.match(shared, /export const getSiteByDomain = cache\(async/);
  assert.match(shared, /resolveSiteAssetPolicy\(\{[\s\S]*phase: 'render'/);
  assert.match(shared, /siteConfig: policy\.config/);
  assert.doesNotMatch(shared, /tenantMetadata\([\s\S]*resolveSiteAssetPolicy/, 'metadata must not run a second divergent audit');

  const policyIndex = exporter.indexOf('await resolveSiteAssetPolicy({');
  const collectionIndex = exporter.indexOf('await collectAndRewriteAssets(renderConfig)');
  assert.ok(policyIndex >= 0, 'static export provenance policy call missing');
  assert.ok(collectionIndex > policyIndex, 'asset collection must happen only after policy fallback projection');
  assert.match(exporter, /resolveStoredBeforeAfterMotionOptions\(\{[\s\S]*config: renderConfig/);
});

test('authenticated dashboard and editor previews project persisted configs without GET-side storage mutation', () => {
  const route = readFileSync('src/app/api/sites/[siteId]/route.ts', 'utf8');
  const getBlock = route.slice(route.indexOf('export const GET'), route.indexOf('const patchSchema'));
  const editor = readFileSync('src/app/(dashboard)/dashboard/sites/[siteId]/editor/page.tsx', 'utf8');

  assert.match(getBlock, /getOwnedSite\(siteId, client\.id\)/);
  assert.match(getBlock, /resolveSiteAssetPolicy\(\{[\s\S]*operation: 'audit'[\s\S]*phase: 'preview'/);
  assert.match(getBlock, /Promise\.all\(\[[\s\S]*site\.draftConfig[\s\S]*site\.siteConfig/);
  assert.doesNotMatch(getBlock, /saveDraft|publish\(/, 'GET projection must not mutate persisted config');

  const editorPolicyIndex = editor.indexOf('await resolveSiteAssetPolicy({');
  const editorShellIndex = editor.indexOf('<EditorShell');
  assert.ok(editorPolicyIndex >= 0 && editorShellIndex > editorPolicyIndex);
  assert.match(editor, /operation: 'audit'[\s\S]*assetPolicyVersion: site\.assetPolicyVersion[\s\S]*phase: 'preview'/);
  assert.doesNotMatch(editor, /saveDraft|publish\(/, 'server editor load must remain read-only');
});

test('v2 enforce replaces denied factual media, preserves copy/CTA, and leaves nothing for export to fetch', async () => {
  const ownerId = 'owner-v2';
  const siteId = 'site-v2';
  const assetId = '11111111-1111-4111-8111-111111111111';
  const deniedUrl = 'https://assets.example.invalid/generated-menu.jpg';
  const slotKey = 'page:home/section:menu/element:menu-photo:image';
  const config: SiteConfig = {
    version: 2,
    theme: emptySiteConfig('v2-enforce').theme,
    meta: { title: '정직한 메뉴 소개', industryClass: 'cafe' },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [{
        id: 'menu',
        type: 'menu',
        name: '메뉴',
        height: 720,
        background: {},
        elements: [
          {
            id: 'menu-copy',
            kind: 'text',
            frame: { x: 96, y: 96, w: 760, h: 120 },
            z: 2,
            text: '실제 메뉴 정보는 텍스트로 정확하게 안내합니다',
            style: { fontSize: 44, fontWeight: 700, fontFamily: 'heading' },
          },
          {
            id: 'menu-cta',
            kind: 'button',
            frame: { x: 96, y: 250, w: 260, h: 64 },
            z: 2,
            label: '메뉴 문의하기',
            href: '#contact',
            style: { variant: 'solid' },
          },
          {
            id: 'menu-photo',
            kind: 'image',
            frame: { x: 900, y: 80, w: 420, h: 560 },
            z: 1,
            src: deniedUrl,
            alt: '실제 메뉴 사진',
            style: { objectFit: 'cover' },
          },
        ],
      }],
    }],
    assetRefs: [{ assetId, url: deniedUrl }],
    assetUsages: [{ assetId, role: 'factual', subject: 'product', slotKey }],
  };
  const record: AssetRecord = {
    id: assetId,
    origin: 'ai_generated',
    mediaType: 'image',
    storageBucket: 'generated',
    storageKey: 'menu.jpg',
    canonicalUrl: deniedUrl,
    createdAt: '2026-07-16T00:00:00.000Z',
    ownerId,
    siteId,
  };

  const observed = resolveSiteAssetPolicyCore({
    operation: 'audit',
    config,
    clientId: ownerId,
    siteId,
    assetPolicyVersion: 2,
    phase: 'preview',
    flags: { ...ENFORCE_V2, enforceNewSites: false },
    records: [record],
    attestations: { generalAttestation: null, personConsentsByAssetId: new Map() },
  });
  assert.equal(observed.mode, 'observe');
  assert.equal(observed.config, config, 'observe mode must not project a different dashboard config');
  assert.equal(staticBody(observed.config), staticBody(config), 'observe mode must preserve exact preview DOM');

  const policy = resolveSiteAssetPolicyCore({
    operation: 'audit',
    config,
    clientId: ownerId,
    siteId,
    assetPolicyVersion: 2,
    phase: 'render',
    flags: ENFORCE_V2,
    records: [record],
    attestations: { generalAttestation: null, personConsentsByAssetId: new Map() },
  });
  assert.equal(policy.mode, 'enforce');
  assert.equal(policy.violations[0]?.reason, 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT');
  assert.notEqual(policy.config, config);

  const body = staticBody(policy.config);
  assert.doesNotMatch(body, /generated-menu\.jpg|실제 메뉴 사진/);
  assert.match(body, /실제 메뉴 정보는 텍스트로 정확하게 안내합니다/);
  assert.match(body, /메뉴 문의하기/);
  assert.match(body, /data-asset-fallback="true"/);

  let rewriteCalls = 0;
  const exportProjection = structuredClone(policy.config);
  await rewriteAssetReferences(exportProjection, async () => {
    rewriteCalls += 1;
    return 'assets/should-not-exist.jpg';
  });
  assert.equal(rewriteCalls, 0, 'denied factual source must never reach static-export asset collection');
});
