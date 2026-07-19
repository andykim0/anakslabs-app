import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('W4 — 관리자 승인 후 영상 process 재개 UI', () => {
  test('서버 페이지의 현재 tier를 상세 화면에 전달한다', () => {
    const page = source('src/app/(dashboard)/dashboard/sites/[siteId]/page.tsx');
    assert.match(page, /<SiteDetail siteId=\{siteId\} tier=\{client\.tier\} \/>/);
  });

  test('상세 화면은 draft 우선 설정과 U3 표시 가드 뒤에서만 process를 실행한다', () => {
    const detail = source('src/components/dashboard/site-detail.tsx');
    const resume = detail.slice(
      detail.indexOf('function HeroVideoResumeCard'),
      detail.indexOf('// ---------- [v3 Phase 3] 문의함'),
    );
    const config = resume.indexOf('site.draftConfig ?? site.siteConfig');
    const addon = resume.indexOf('!hasVideoAddon(tier)');
    const eligible = resume.indexOf('!plan.canResume');
    const button = resume.indexOf('onClick={() => mutation.mutate()}');
    assert.ok(config >= 0 && addon > config && eligible > config && button > eligible);
    assert.match(resume, /processApprovedHeroVideo\(/);
    assert.doesNotMatch(resume, /useEffect\([\s\S]{0,200}processApprovedHeroVideo/);
  });

  test('적용 뒤 사이트 쿼리를 갱신하고 passive mount가 아닌 명시 버튼으로 다보임 AI 영상 생성을 시작한다', () => {
    const detail = source('src/components/dashboard/site-detail.tsx');
    assert.match(detail, /invalidateQueries\(\{ queryKey: \['site', site\.id\] \}\)/);
    assert.match(detail, /이 버튼을 누를 때만 다보임 AI 영상 생성을 시작해요/);
    assert.match(detail, /영상 만들기/);
  });
});
