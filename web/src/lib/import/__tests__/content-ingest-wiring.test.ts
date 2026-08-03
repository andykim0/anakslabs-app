import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { surveySchema } from '@/app/api/_lib/schemas';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

test('the first onboarding step preserves website and Instagram imports with customer_import provenance', () => {
  const step = read('src/components/dashboard/onboarding/steps/step02-existing.tsx');
  const host = read('src/components/dashboard/onboarding/survey-step.tsx');
  assert.match(host, /1: "Do you already have a website, blog, or place\?"/);
  assert.match(host, /step === 1 \? <Step02Existing \/>/);
  assert.match(step, /kind: 'website'/);
  assert.match(step, /kind: 'instagram'/);
  assert.doesNotMatch(step, /kind: 'naver_blog'|kind: 'naver_place'/);
  assert.match(step, /setValue\('businessName'/);
  assert.match(step, /setValue\('factualAnswers'/);
  assert.match(step, /setValue\('contentItems'/);
  assert.match(step, /setValue\('importedContentSources'/);
  assert.match(step, /source: 'customer_import'/);
  assert.match(step, /if \(!factsByKey\.get\(fact\.key\)\?\.value\.trim\(\)\)/);
});

test('contentDepth 서버 계약은 가져온 원문 출처와 직접 답변 출처를 구분한다', () => {
  const base = {
    businessName: '테스트 상점',
    purposeId: 'local_store' as const,
    purpose: '오프라인 매장',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '파랑',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero' as const, name: '첫 화면', brief: '', source: 'template' as const }],
    templateId: 'local_store.default',
  };
  const parsed = surveySchema.parse({
    ...base,
    existingPresence: [
      { kind: 'website', url: 'https://shop.example.com' },
      { kind: 'naver_blog', url: 'https://blog.naver.com/shop' },
    ],
    contentDepth: {
      version: 1,
      facts: [
        { key: 'phone', value: '02-123-4567', source: 'customer_import' },
        { key: 'parking', value: '주차 불가', source: 'customer' },
      ],
      faqAnswers: [],
      imports: [{
        url: 'https://shop.example.com',
        origin: 'customer_import',
        extractedAt: '2026-07-22T00:00:00.000Z',
        fields: ['phone'],
      }],
    },
  });
  assert.equal(parsed.contentDepth?.facts[0]?.source, 'customer_import');
  assert.equal(parsed.contentDepth?.imports[0]?.origin, 'customer_import');
});

test('0041은 고객 업로드와 고객 가져오기만 권리확약 대상으로 허용한다', () => {
  const migration = read('../supabase/migrations/0041_customer_import_asset_attestations.sql');
  assert.match(migration, /origin in \('customer_upload', 'customer_import'\)/);
  assert.doesNotMatch(migration, /origin in \([^\n]*ai_generated/);
  for (const line of migration.split('\n').filter((value) => /^\s*--/.test(value))) {
    assert.doesNotMatch(line, /\$/);
  }
  assert.doesNotMatch(migration, /if[^;]*case/iu);
});
