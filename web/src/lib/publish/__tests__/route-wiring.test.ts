import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Q$6 publish route 서버 강제 배선', () => {
  const publish = source('src/app/api/sites/[siteId]/publish/route.ts');
  const preflight = source('src/app/api/sites/[siteId]/preflight/route.ts');

  test('휴먼 3체크와 artifact 감사가 실제 publish보다 먼저 실행된다', () => {
    const humanAt = publish.indexOf('missingPublishHumanChecks(body.humanChecks)');
    const auditAt = publish.indexOf('preflightScan(site.draftConfig');
    const persistAt = publish.indexOf('publishAuditedSnapshot(getDataServices().sites, siteId, site.draftConfig)');
    assert.ok(humanAt >= 0 && auditAt > humanAt && persistAt > auditAt);
    assert.match(publish, /PUBLISH_HUMAN_CHECKS_REQUIRED/);
    assert.match(publish, /artifact:\s*scan\.publishAudit/);
  });

  test('감사 예외는 503 fail-closed이고 예전 fail-open 문구가 없다', () => {
    assert.match(publish, /PUBLISH_AUDIT_UNAVAILABLE/);
    assert.doesNotMatch(publish, /렌더\/스캔 실패는 발행을 막지 않는다/);
    const catchAt = publish.indexOf("console.error('[publish-audit] preflight failed:'");
    const unavailableAt = publish.indexOf("'PUBLISH_AUDIT_UNAVAILABLE'");
    const persistAt = publish.indexOf('publishAuditedSnapshot(getDataServices().sites, siteId, site.draftConfig)');
    assert.ok(catchAt >= 0 && unavailableAt > catchAt && persistAt > unavailableAt);
  });

  test('진단 UI 경로도 소유자 tier와 같은 artifact 결과를 사용한다', () => {
    assert.match(preflight, /tier:\s*client\.tier/);
    assert.match(preflight, /artifact:\s*scan\.publishAudit/);
    assert.match(preflight, /PUBLISH_AUDIT_UNAVAILABLE/);
    assert.match(preflight, /503/);
  });
});
