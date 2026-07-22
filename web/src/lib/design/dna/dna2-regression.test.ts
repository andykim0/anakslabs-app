import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import {
  buildCandidateBlueprints,
  buildCandidateBlueprintsForPipeline,
} from '@/lib/data/design-candidates';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import type { SurveyInput } from '@/lib/types/domain';
import {
  DESIGN_DNA_CATALOG,
  DNA_SELECTION_TOOL,
  deterministicDnaSelections,
  expandTokens,
  tokenSetToSiteTheme,
} from '@/lib/design/dna';

const root = process.cwd();
const source = (file: string) => readFileSync(join(root, file), 'utf8');

function survey(): SurveyInput {
  return {
    businessName: '회귀 검증 공방',
    purposeId: 'portfolio',
    purpose: '포트폴리오',
    industry: '도예 공방',
    tagline: '손으로 만든 과정과 결과를 보여드립니다',
    tone: ['따뜻한', '정갈한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    referenceStyleIds: ['organic-natural'],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '작업 소개', required: true, source: 'template' },
      { type: 'gallery', name: '작업', brief: '대표 작업', source: 'template' },
    ],
    templateId: 'portfolio.default',
    imageStyle: 'photo',
  } as SurveyInput;
}

describe('DNA2 통합 회귀', () => {
  test('기본 OFF는 구조화 invoker를 호출하지 않고 기존 블루프린트를 바이트 동일하게 보존한다', async () => {
    const input = survey();
    let invoked = 0;
    const actual = await buildCandidateBlueprintsForPipeline(input, {
      enabled: false,
      invoke: async () => {
        invoked += 1;
        return [];
      },
    });
    assert.equal(invoked, 0);
    assert.deepEqual(actual, buildCandidateBlueprints(input));
  });

  test('ON은 세 enum 핀을 어댑터 테마로 바꾸고 SiteConfig 재렌더 선택을 고정한다', async () => {
    const input = survey();
    const toolInputs = [
      { dna_id: 'workshop-tactile-heritage', hue_seed: 42, overrides: { density: 'airy' } },
      { dna_id: 'medical-clinical-clarity', hue_seed: 188, overrides: { radius: 'soft' } },
      { dna_id: 'retail-bold-geometric', hue_seed: 302, overrides: { color_chroma: 'vivid' } },
    ] as const;
    const candidates = await buildCandidateBlueprintsForPipeline(input, {
      enabled: true,
      invoke: async () => toolInputs,
    });
    assert.equal(candidates.length, 3);
    for (const [index, candidate] of candidates.entries()) {
      const pin = candidate.designDna;
      assert.ok(pin);
      assert.deepEqual(candidate.theme, tokenSetToSiteTheme(expandTokens(pin.dnaId, pin.hueSeed, pin.overrides)));
      const persisted = buildSiteConfigFromSurvey(input, {
        ...candidate,
        heroImageUrl: '/mock/candidate-light.svg',
      }, {
        heroImageUrl: '/mock/candidate-light.svg',
        imagePool: ['/mock/candidate-light.svg'],
      });
      assert.deepEqual(persisted.designDna, pin, `candidate ${index}`);
      assert.equal(siteConfigSchema.safeParse(persisted).success, true);
    }
  });

  test('모델 도구 계약에는 자유 문자열 색·크기 슬롯이 없고 저장 경계도 임의 필드를 거부한다', () => {
    const schema = DNA_SELECTION_TOOL.inputSchema;
    assert.equal(schema.additionalProperties, false);
    assert.doesNotMatch(JSON.stringify(schema), /(?:hex|px)/iu);
    const properties = schema.properties as Record<string, { type?: string; enum?: unknown[]; properties?: Record<string, { type?: string; enum?: unknown[] }> }>;
    for (const [key, property] of Object.entries(properties.overrides?.properties ?? {})) {
      assert.equal(property.type, 'string', key);
      assert.ok(Array.isArray(property.enum) && property.enum.length > 0, key);
    }
    const pin = deterministicDnaSelections(survey())[0];
    const config = buildSiteConfigFromSurvey(survey(), {
      ...buildCandidateBlueprints(survey(), [pin])[0],
      heroImageUrl: '/mock/candidate-light.svg',
    }, {
      heroImageUrl: '/mock/candidate-light.svg',
      imagePool: ['/mock/candidate-light.svg'],
    });
    assert.equal(siteConfigSchema.safeParse({
      ...config,
      designDna: { ...config.designDna, arbitraryColor: '#ffffff' },
    }).success, false);
  });

  test('런타임의 TokenSet 투영은 단일 어댑터 호출 지점이고 렌더러는 DNA를 역참조하지 않는다', () => {
    const runtimeFiles = [
      'src/lib/data/design-candidates.ts',
      'src/lib/data/site-templates.ts',
      'src/components/site-renderer/SiteRenderer.tsx',
      'src/components/site-renderer/MotionSignatureRenderer.tsx',
    ];
    const occurrences = runtimeFiles.flatMap((file) => {
      const matches = source(file).match(/tokenSetToSiteTheme/g) ?? [];
      return matches.map(() => file);
    });
    assert.deepEqual(occurrences, [
      'src/lib/data/design-candidates.ts',
      'src/lib/data/design-candidates.ts',
    ]);
    assert.doesNotMatch(source('src/components/site-renderer/SiteRenderer.tsx'), /DesignDNA|designDna|expandTokens/u);
  });

  test('후보 UI는 390px production SitePreview이며 고객 사진을 세 config에 동일 전달한다', () => {
    const step = source('src/components/dashboard/onboarding/candidate-step.tsx');
    const preview = source('src/components/dashboard/site-preview.tsx');
    const projection = source('src/lib/onboarding/candidate-preview.ts');
    assert.match(step, /<SitePreview[\s\S]*mode="mobile"/u);
    assert.match(preview, /const MOBILE_PREVIEW_WIDTH = 390/u);
    assert.match(projection, /heroImageUrl,[\s\S]*imagePool: \[heroImageUrl\]/u);
    assert.doesNotMatch(step, /CandidateThemePreview|generateImage|@keyframes cand-/u);
  });

  test('E4 스크립트는 8×2와 OFF\/ON 3쌍을 실제 renderer로 만들며 생성 API를 호출하지 않는다', () => {
    const review = source('scripts/render-dna-review.tsx');
    assert.equal(DESIGN_DNA_CATALOG.length, 8);
    assert.match(review, /const HUES = \[24, 216\] as const/u);
    assert.match(review, /createElement\(SiteRenderer/u);
    assert.match(review, /mode: 'mobile'/u);
    assert.match(review, /const comparisonIds = \[/u);
    assert.match(review, /generatedAssetCalls: 0/u);
    assert.doesNotMatch(review, /generateImage|generateVideo|Veo|Gemini/u);
  });
});
