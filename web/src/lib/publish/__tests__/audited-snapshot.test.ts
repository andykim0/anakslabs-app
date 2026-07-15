import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { SitesRepo } from '@/lib/data/types';
import { publishAuditedSnapshot } from '@/lib/publish/publish-audited-snapshot';
import { emptySiteConfig } from '@/lib/types/site';
import type { Site } from '@/lib/types/domain';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Q$6 발행 snapshot 원자성 경계', () => {
  test('helper가 진단 snapshot을 복제해 저장소의 두 번째 인자로 전달한다', async () => {
    const audited = emptySiteConfig(`검증본-${crypto.randomUUID()}`);
    audited.meta.description = '검증을 통과한 초안 A';
    let received = null as typeof audited | null;
    const publisher = {
      async publish(_siteId: string, snapshot?: typeof audited): Promise<Site> {
        assert.ok(snapshot);
        received = snapshot;
        return {
          id: 'site-1', clientId: 'client-1', name: '테스트', domain: null, domainType: 'subdomain',
          dnsVerified: false, cloudflareHostnameId: null, status: 'live', siteConfig: snapshot,
          draftConfig: null, publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
        };
      },
    } as unknown as SitesRepo;

    const published = await publishAuditedSnapshot(publisher, 'site-1', audited);
    assert.equal(published.siteConfig?.meta.description, '검증을 통과한 초안 A');
    assert.notEqual(received, audited, '저장소가 route의 검사 객체를 변형할 수 없도록 복제해야 한다');
  });

  test('mock과 Supabase 모두 현재 draft 재조회값이 아닌 auditedDraft를 site_config에 쓴다', () => {
    const mock = source('src/lib/data/mock/services.ts');
    const supabase = source('src/lib/data/supabase/services.ts');
    assert.match(mock, /site\.siteConfig = structuredClone\(auditedDraft\)/);
    assert.match(mock, /if \(!auditedDraft\) throw new Error\('sites\.publish: 검증된 발행 초안이 필요합니다'\)/);
    assert.match(supabase, /site_config:\s*auditedDraft/);
    assert.match(supabase, /if \(!auditedDraft\) throw new Error\('sites\.publish: 검증된 발행 초안이 필요합니다'\)/);
    assert.doesNotMatch(supabase, /site_config:\s*site\.draftConfig/);
  });
});
