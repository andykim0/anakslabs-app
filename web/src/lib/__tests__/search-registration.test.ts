import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { buildDocumentShell } from '@/lib/export/document-shell';
import {
  NAVER_ACCOUNT_SITE_LIMIT,
  NAVER_ACCOUNT_SWITCH_WARNING,
  summarizeRegistrationAccounts,
  type SearchRegistrationRecord,
} from '@/lib/seo/search-registration';
import {
  preserveServerSearchVerification,
  withServerSearchVerification,
} from '@/lib/seo/search-verification';
import { emptySiteConfig } from '@/lib/types/site';

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
const record = (siteId: string, accountLabel: string, status: 'pending' | 'completed' = 'completed'): SearchRegistrationRecord => ({
  siteId,
  status,
  accountLabel,
  naverVerification: 'naver_token_123',
  googleVerification: null,
  indexStatus: 'present',
  completedAt: status === 'completed' ? '2026-07-20T00:00:00.000Z' : null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
});

describe('GT$ G3 검색 등록 대행', () => {
  test('SiteConfig 스키마는 두 소유확인 슬롯만 안전한 형식으로 보존한다', () => {
    const config = withServerSearchVerification(emptySiteConfig('검색 등록 테스트'), {
      naver: 'naver_token_123',
      google: 'google-token_456',
    });
    assert.deepEqual(siteConfigSchema.parse(config).searchVerification, config.searchVerification);
    assert.throws(() => siteConfigSchema.parse({ ...config, searchVerification: { naver: '<script>' } }));
  });

  test('일반 초안 저장은 클라이언트 주입·삭제를 모두 버리고 서버 값을 보존한다', () => {
    const persisted = withServerSearchVerification(emptySiteConfig('기존'), { naver: 'server_token_123' });
    const injected = withServerSearchVerification(emptySiteConfig('새 초안'), { naver: 'client_token_999' });
    assert.deepEqual(preserveServerSearchVerification(injected, persisted).searchVerification, { naver: 'server_token_123' });
    assert.deepEqual(preserveServerSearchVerification(emptySiteConfig('삭제 시도'), persisted).searchVerification, { naver: 'server_token_123' });

    const mockRepo = source('src/lib/data/mock/services.ts');
    const realRepo = source('src/lib/data/supabase/services.ts');
    assert.match(mockRepo, /preserveServerSearchVerification\(config,/);
    assert.match(realRepo, /preserveServerSearchVerification\(config,/);
  });

  test('정적 발행 HTML head에 네이버·구글 메타태그가 정확히 한 번 들어간다', () => {
    const config = withServerSearchVerification(emptySiteConfig('메타 테스트'), {
      naver: 'naver_token_123',
      google: 'google-token_456',
    });
    const html = buildDocumentShell({ config, pageSlug: '', headerHtml: '', bodyHtml: '<main>본문</main>' });
    assert.equal((html.match(/name="naver-site-verification"/g) ?? []).length, 1);
    assert.equal((html.match(/name="google-site-verification"/g) ?? []).length, 1);
    assert.match(html, /content="naver_token_123"/);
    assert.match(source('src/app/s/[domain]/_shared.tsx'), /'naver-site-verification'/);
  });

  test('80곳부터 다음 계정 경고, 100곳에서 가득 참을 결정적으로 계산한다', () => {
    assert.equal(NAVER_ACCOUNT_SWITCH_WARNING, 80);
    assert.equal(NAVER_ACCOUNT_SITE_LIMIT, 100);
    const at80 = summarizeRegistrationAccounts(Array.from({ length: 80 }, (_, index) => record(`site-${index}`, 'NAVER-OPS-01')))[0];
    const at100 = summarizeRegistrationAccounts(Array.from({ length: 100 }, (_, index) => record(`site-${index}`, 'NAVER-OPS-01')))[0];
    assert.deepEqual({ warning: at80.warning, full: at80.full }, { warning: true, full: false });
    assert.deepEqual({ warning: at100.warning, full: at100.full }, { warning: true, full: true });
  });

  test('미완료 건은 계정 등록 수에 포함하지 않는다', () => {
    assert.deepEqual(summarizeRegistrationAccounts([record('pending', 'NAVER-OPS-01', 'pending')]), []);
  });

  test('legacy registration APIs remain guarded while the Korean admin surface is removed', () => {
    const listRoute = source('src/app/api/admin/search-registration/route.ts');
    const updateRoute = source('src/app/api/admin/search-registration/[siteId]/route.ts');
    assert.match(listRoute, /requireAdminOr403\(\)/);
    assert.match(updateRoute, /requireAdminOr403\(\)/);
    assert.match(updateRoute, /sites\.setSearchVerification/);
    assert.match(updateRoute, /NAVER_ACCOUNT_SITE_LIMIT/);
    assert.equal(existsSync(join(process.cwd(), 'src/components/admin/search-registration-queue.tsx')), false);
    assert.doesNotMatch(source('src/components/admin/admin-shell.tsx'), /search-registration/u);
  });

  test('DB 큐는 service role 전용이며 운영 계정 비밀번호를 저장하지 않는다', () => {
    const sql = source('../supabase/migrations/0037_search_registration_queue.sql');
    assert.match(sql, /enable row level security/);
    assert.match(sql, /revoke all.*anon, authenticated/);
    assert.doesNotMatch(sql, /password|secret|credential/i);
  });
});
