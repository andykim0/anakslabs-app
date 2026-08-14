import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import {
  CRAWL_ARTIFACT_RETENTION_DAYS,
  SHARED_PREVIEW_RETENTION_DAYS,
  US_MEDICAL_PREVIEW_RETENTION_DAYS,
  sharedPreviewRetentionDays,
} from './contracts';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('preview lifetime — the retention purge cannot orphan a live preview', () => {
  test('아티팩트는 어떤 프리뷰보다도 오래 산다 — cascade 가 살아있는 링크를 못 지운다', () => {
    /**
     * The invariant, stated as the thing that actually breaks: the preview row is deleted by
     * cascade when its artifact goes, so artifact retention must strictly exceed every lifetime
     * a preview can be stamped with. Equality is not enough — both rows would expire in the same
     * cron tick, and which delete lands first is not something this test should have to know.
     */
    for (const previewDays of [SHARED_PREVIEW_RETENTION_DAYS, US_MEDICAL_PREVIEW_RETENTION_DAYS]) {
      assert.ok(
        CRAWL_ARTIFACT_RETENTION_DAYS > previewDays,
        `artifacts live ${CRAWL_ARTIFACT_RETENTION_DAYS}d, a preview can be stamped ${previewDays}d`,
      );
    }
  });

  test('발급 경로가 실제로 찍는 값 — US 아웃리치 45일, 일반 14일', () => {
    assert.equal(
      sharedPreviewRetentionDays({
        renderMode: 'preview-full',
        siteConfig: { meta: { locale: 'en-US', jurisdiction: 'US' } } as never,
      }),
      45,
    );
    assert.equal(
      sharedPreviewRetentionDays({
        renderMode: 'standard',
        siteConfig: { meta: { locale: 'ko-KR' } } as never,
      }),
      14,
    );
  });

  test('cascade 는 여전히 존재한다 — 이 테스트가 지키는 대상이 사라지지 않았는지 확인', () => {
    // If this ever stops matching, the invariant above is guarding a rule that no longer exists.
    assert.match(
      source('../supabase/migrations/0046_crawler_lite.sql'),
      /crawl_artifact_id\s+uuid\s+not null\s+references\s+public\.crawl_artifacts\s*\(id\)\s+on delete cascade/u,
    );
  });

  test('사람이 읽는 수명 문구는 상수에서 나온다 — 하드코딩된 날짜 수가 남아있지 않다', () => {
    const admin = source('src/components/admin/us-demo-pipeline.tsx');
    assert.match(admin, /\{US_MEDICAL_PREVIEW_RETENTION_DAYS\}-day preview/u);
    assert.match(admin, /404 after \{US_MEDICAL_PREVIEW_RETENTION_DAYS\} days/u);
    assert.doesNotMatch(admin, /14-day preview|after 14 days/u);
    const previewPage = source('src/app/preview/[token]/[[...path]]/page.tsx');
    assert.match(previewPage, /\$\{US_MEDICAL_PREVIEW_RETENTION_DAYS\}-day private demo/u);
    assert.doesNotMatch(previewPage, /45-day private demo/u);
  });
});
