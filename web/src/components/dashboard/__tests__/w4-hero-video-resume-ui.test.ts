import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('W4 — 관리자 검수 영상 이행 상태 UI', () => {
  test('서버 페이지의 현재 tier를 상세 화면에 전달한다', () => {
    const page = source('src/app/(dashboard)/dashboard/sites/[siteId]/page.tsx');
    assert.match(page, /<SiteDetail siteId=\{siteId\} tier=\{client\.tier\} \/>/);
  });

  test('상세 화면은 draft 우선 설정에서 요청·권한·적용 여부를 상태로 표시한다', () => {
    const detail = source('src/components/dashboard/site-detail.tsx');
    const statusCard = detail.slice(
      detail.indexOf('function HeroVideoStatusCard'),
      detail.indexOf('// ---------- [v3 Phase 3] 문의함'),
    );
    assert.match(statusCard, /site\.draftConfig \?\? site\.siteConfig/);
    assert.match(statusCard, /if \(!plan\.requested\) return null/);
    assert.match(statusCard, /plan\.applied[\s\S]*hasVideoAddon\(tier\)/);
    assert.match(statusCard, /VIDEO_FULFILLMENT_STATUS_LABELS\[status\]/);
  });

  test('고객 화면에서 즉시 생성·적용하지 않고 관리자 이행 큐의 검수 약속을 보여준다', () => {
    const detail = source('src/components/dashboard/site-detail.tsx');
    assert.match(detail, /VIDEO_FULFILLMENT_COPY/);
    assert.doesNotMatch(detail, /processApprovedHeroVideo|generateHeroVideoDrafts|applyHeroVideoDraft/);
    assert.doesNotMatch(detail, /영상 만들기|바로 적용/);
  });
});
