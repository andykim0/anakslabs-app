import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { evaluateGuarantee } from '@/lib/guarantee';
import { SCAN_COMPARISON_LIMIT, SCAN_REQUEST_URL_LIMIT } from '@/lib/scan/comparison';
import { preserveServerSearchVerification, withServerSearchVerification } from '@/lib/seo/search-verification';
import { emptySiteConfig } from '@/lib/types/site';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('GT$ G4 통합 회귀', () => {
  test('성과 보장 판정은 같은 데이터에서 항상 같은 결과를 낸다', () => {
    const input = {
      publishedAt: '2026-01-01T00:00:00.000Z',
      asOf: '2026-04-01T00:00:00.000Z',
      naverIndexed: false,
      naverReferralCount: 29,
    } as const;
    assert.deepEqual(evaluateGuarantee(input), evaluateGuarantee(input));
    assert.equal(evaluateGuarantee(input).decision, 'eligible');
  });

  test('비교 스캔은 기존 제한 1회 안에서 본인 포함 최대 3 URL만 처리한다', () => {
    assert.equal(SCAN_COMPARISON_LIMIT, 2);
    assert.equal(SCAN_REQUEST_URL_LIMIT, 3);
    const route = read('src/app/api/scan/route.ts');
    assert.equal((route.match(/rateLimited\(ip\)/g) ?? []).length, 1);
    assert.match(route, /competitorUrls[\s\S]*\.max\(SCAN_COMPARISON_LIMIT\)/);
    assert.doesNotMatch(`${route}\n${read('src/lib/scan/fetch-target.ts')}`, /search\.naver\.com|google\.com\/search/);
  });

  test('검색 소유확인은 서버 값만 보존되고 관리자 API만 서버 기록 메서드를 호출한다', () => {
    const persisted = withServerSearchVerification(emptySiteConfig('서버'), { naver: 'server_token_123' });
    const client = withServerSearchVerification(emptySiteConfig('클라이언트'), { naver: 'client_token_999' });
    assert.equal(preserveServerSearchVerification(client, persisted).searchVerification?.naver, 'server_token_123');
    assert.match(read('src/app/api/admin/search-registration/[siteId]/route.ts'), /requireAdminOr403[\s\S]*setSearchVerification/);
    assert.doesNotMatch(read('src/app/api/sites/[siteId]/route.ts'), /setSearchVerification/);
  });

  test('등록 큐에는 PII나 계정 비밀 필드가 없고 서비스 역할 외 직접 접근을 막는다', () => {
    const sql = read('../supabase/migrations/0037_search_registration_queue.sql');
    assert.doesNotMatch(sql, /email|phone|owner_name|password|secret|credential/i);
    assert.match(sql, /revoke all on table public\.search_registration_queue from anon, authenticated/);
  });

  test('보장·비교·검색 등록의 정직성 카피가 고객 화면의 정적 소스에 남는다', () => {
    const guarantee = read('src/app/(marketing)/guarantee/page.tsx');
    const scanner = read('src/components/landing/LandingScanner.tsx');
    const landing = read('src/app/(marketing)/page.tsx');
    assert.match(guarantee, /시행 전 법무 검토 필요/);
    assert.match(scanner, /실제 검색 순위 조회나 순위 보장이 아닙니다/);
    assert.match(scanner, /진단하고, 고쳐서, 만들어드리는 건 다보임뿐입니다/);
    assert.match(landing, /네이버·구글 검색 등록까지 다보임이 대신합니다/);
  });
});
