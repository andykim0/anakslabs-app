import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Q$6 publish route 서버 강제 배선', () => {
  const publish = source('src/app/api/sites/[siteId]/publish/route.ts');
  const preflight = source('src/app/api/sites/[siteId]/preflight/route.ts');

  test('휴먼 3체크 → provenance 감사 → artifact 감사가 실제 publish보다 먼저 실행된다', () => {
    const humanAt = publish.indexOf('missingPublishHumanChecks(body.humanChecks)');
    const provenanceAt = publish.indexOf('await resolveSiteAssetPolicy({');
    const auditAt = publish.indexOf('preflightScan(auditedDraft');
    const persistAt = publish.indexOf('publishAuditedSnapshot(getDataServices().sites, siteId, auditedDraft)');
    assert.ok(humanAt >= 0 && provenanceAt > humanAt && auditAt > provenanceAt && persistAt > auditAt);
    assert.match(publish, /PUBLISH_HUMAN_CHECKS_REQUIRED/);
    assert.match(publish, /PUBLISH_ASSET_PROVENANCE_BLOCKED/);
    assert.match(publish, /shouldBlockAssetPolicy\(assetAudit\.mode, assetPolicyIssues\)/);
    assert.match(publish, /assetPolicyVersion:\s*site\.assetPolicyVersion/);
    assert.match(publish, /artifact:\s*scan\.publishAudit/);
  });

  test('감사 예외는 503 fail-closed이고 예전 fail-open 문구가 없다', () => {
    assert.match(publish, /PUBLISH_AUDIT_UNAVAILABLE/);
    assert.doesNotMatch(publish, /렌더\/스캔 실패는 발행을 막지 않는다/);
    const catchAt = publish.indexOf("console.error('[publish-audit] preflight failed:'");
    const unavailableAt = publish.indexOf("'PUBLISH_AUDIT_UNAVAILABLE'", catchAt);
    const persistAt = publish.indexOf('publishAuditedSnapshot(getDataServices().sites, siteId, auditedDraft)');
    assert.ok(catchAt >= 0 && unavailableAt > catchAt && persistAt > unavailableAt);
    assert.doesNotMatch(publish, /preflight failed:',\s*error\s*\)/);
    assert.doesNotMatch(publish, /asset policy failed:',\s*error\s*\)/);
    assert.doesNotMatch(publish, /motion provenance failed:',\s*error\s*\)/);
    assert.doesNotMatch(preflight, /(?:scan|asset policy|motion provenance) failed:',\s*error\s*\)/);
  });

  test('진단 UI도 provenance가 감사한 config와 소유자 tier의 artifact 결과를 사용한다', () => {
    const provenanceAt = preflight.indexOf('await resolveSiteAssetPolicy({');
    const scanAt = preflight.indexOf('preflightScan(auditedConfig');
    assert.ok(provenanceAt >= 0 && scanAt > provenanceAt);
    assert.match(preflight, /PREFLIGHT_ASSET_PROVENANCE_BLOCKED/);
    assert.match(preflight, /shouldBlockAssetPolicy\(assetAudit\.mode, assetPolicyIssues\)/);
    assert.match(preflight, /assetPolicyVersion:\s*site\.assetPolicyVersion/);
    assert.match(preflight, /tier:\s*client\.tier/);
    assert.match(preflight, /artifact:\s*scan\.publishAudit/);
    assert.match(preflight, /PUBLISH_AUDIT_UNAVAILABLE/);
    assert.match(preflight, /503/);
  });

  test('API에는 정제된 violation만 반환하고 로그에는 자산 식별자를 기록하지 않는다', () => {
    for (const route of [publish, preflight]) {
      assert.match(route, /publishAssetPolicyIssues\(assetAudit\.violations\)/);
      assert.match(route, /violations:\s*assetPolicyIssues/);
      assert.doesNotMatch(route, /assetAudit\.violations[\s\S]{0,120}apiError/);
      assert.doesNotMatch(route, /console\.(?:warn|error)\([^)]*assetId/);
    }
  });
});
