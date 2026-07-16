import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ASSET_POLICY_USER_MESSAGES,
  assetPolicyBlockedMessage,
  publishAssetPolicyIssues,
  shouldBlockAssetPolicy,
} from '../asset-policy-feedback';
import { ASSET_TRUTH_POLICY_DENIAL_REASONS } from '@/lib/assets/truth-policy';
import type { SiteAssetPolicyViolation } from '@/lib/assets/assignment';
import { resolveSiteAssetPolicyCore } from '@/lib/assets/assignment-core';
import type { AssetProvenanceConfig } from '@/lib/assets/provenance-flags-core';
import type { AssetRecord } from '@/lib/assets/provenance';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const ENFORCE_FLAGS: AssetProvenanceConfig = {
  write: true,
  assign: true,
  enforceNewSites: true,
  enforceLegacy: false,
  beforeAfterEnabled: false,
  beforeAfterApprovedIndustries: [],
};

function factualMenuConfig(): SiteConfig {
  const config = emptySiteConfig('출처 감사');
  config.meta.industryClass = 'cafe';
  config.assetRefs = [{ assetId: 'asset-ai', url: '/registered/ai-menu.webp' }];
  config.pages[0].sections.push({
    id: 'menu',
    type: 'menu',
    name: '메뉴',
    height: 640,
    background: {},
    elements: [{
      id: 'menu-image',
      kind: 'image',
      frame: { x: 80, y: 80, w: 480, h: 360 },
      z: 1,
      src: '/registered/ai-menu.webp',
      alt: '대표 메뉴',
      style: { objectFit: 'cover' },
    }],
  });
  return config;
}

function aiRecord(): AssetRecord {
  return {
    id: 'asset-ai',
    origin: 'ai_generated',
    mediaType: 'image',
    storageBucket: 'generated',
    storageKey: 'site/ai-menu.webp',
    canonicalUrl: '/registered/ai-menu.webp',
    createdAt: '2026-07-16T00:00:00.000Z',
    ownerId: 'owner-1',
    siteId: 'site-1',
  };
}

describe('Track 3 publish asset-policy feedback', () => {
  test('모든 stable denial reason에 수정 가능한 사용자 메시지가 있다', () => {
    assert.deepEqual(
      Object.keys(ASSET_POLICY_USER_MESSAGES).sort(),
      [...ASSET_TRUTH_POLICY_DENIAL_REASONS].sort(),
    );
    for (const message of Object.values(ASSET_POLICY_USER_MESSAGES)) {
      assert.ok(message.length >= 20);
      assert.match(message, /사진|이미지|전후/);
    }
  });

  test('API projection은 asset ID를 제거하고 안정적인 필드만 반환한다', () => {
    const violation: SiteAssetPolicyViolation = {
      reason: 'ASSET_OWNER_MISMATCH',
      slotKey: 'page:home/section:hero/background:image',
      fallbackIntent: 'typography-only',
      assetId: 'private-asset-id',
    };
    const [issue] = publishAssetPolicyIssues([violation]);

    assert.deepEqual(Object.keys(issue).sort(), [
      'fallbackIntent',
      'message',
      'reason',
      'slotKey',
    ]);
    assert.doesNotMatch(JSON.stringify(issue), /private-asset-id/);
    assert.equal(issue.message, ASSET_POLICY_USER_MESSAGES.MISSING_ASSET_RECORD);
  });

  test('차단 요약은 첫 조치와 추가 수정 개수를 알려 준다', () => {
    const issues = publishAssetPolicyIssues([
      {
        reason: 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT',
        slotKey: 'page:home/section:hero/background:image',
        fallbackIntent: 'typography-only',
      },
      {
        reason: 'MISSING_GENERAL_ATTESTATION',
        slotKey: 'page:home/section:gallery/element:image-1',
        fallbackIntent: 'brand-shape',
      },
    ]);
    assert.match(assetPolicyBlockedMessage(issues), /AI 이미지/);
    assert.match(assetPolicyBlockedMessage(issues), /1개 더/);
  });

  test('실제 v2 enforce 위반은 publish/preflight 차단 판정으로 이어진다', () => {
    const result = resolveSiteAssetPolicyCore({
      operation: 'audit',
      config: factualMenuConfig(),
      clientId: 'owner-1',
      siteId: 'site-1',
      assetPolicyVersion: 2,
      phase: 'publish',
      flags: ENFORCE_FLAGS,
      records: [aiRecord()],
      attestations: { generalAttestation: null, personConsentsByAssetId: new Map() },
    });
    const issues = publishAssetPolicyIssues(result.violations);

    assert.equal(result.mode, 'enforce');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].reason, 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT');
    assert.equal(shouldBlockAssetPolicy(result.mode, issues), true);
    assert.equal(
      result.config.pages[0].sections[0].elements[0].kind,
      'shape',
      'audit projection must remove the contaminated factual image before rendering',
    );
  });

  test('legacy enforcement OFF는 config identity와 발행 가능 상태를 그대로 보존한다', () => {
    const config = factualMenuConfig();
    const result = resolveSiteAssetPolicyCore({
      operation: 'audit',
      config,
      clientId: 'owner-1',
      siteId: 'site-1',
      assetPolicyVersion: undefined,
      phase: 'publish',
      flags: {
        ...ENFORCE_FLAGS,
        write: false,
        assign: false,
        enforceNewSites: false,
      },
      records: [],
      attestations: { generalAttestation: null, personConsentsByAssetId: new Map() },
    });
    const issues = publishAssetPolicyIssues(result.violations);

    assert.equal(result.mode, 'legacy-bypass');
    assert.equal(result.config, config);
    assert.deepEqual(issues, []);
    assert.equal(shouldBlockAssetPolicy(result.mode, issues), false);
  });
});
