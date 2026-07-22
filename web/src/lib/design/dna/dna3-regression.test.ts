import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  deterministicDnaSelections,
  expandTokens,
  tokenSetToSiteTheme,
} from '@/lib/design/dna';
import type { SurveyInput } from '@/lib/types/domain';

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const cafeSurvey = {
  businessName: '모과 커피',
  purposeId: 'local_store',
  purpose: '음식점·로컬 매장',
  industry: '카페',
  tagline: '천천히 내린 한 잔과 오늘의 디저트',
  tone: ['따뜻한', '차분한'],
  colorPreference: '시스템 추천',
  referenceImageUrls: [],
  sectionPlan: [],
  templateId: 'local_store.default',
  imageStyle: 'photo',
} as SurveyInput;

describe('DNA3 렌더 토큰 통합 회귀', () => {
  test('같은 고객에게 고른 3안은 실제 renderer가 소비하는 시각 토큰 시그니처가 겹치지 않는다', () => {
    const selections = deterministicDnaSelections(cafeSurvey);
    assert.equal(selections.length, 3);

    const signatures = selections.map((selection) => {
      const theme = tokenSetToSiteTheme(
        expandTokens(selection.dnaId, selection.hueSeed, selection.overrides),
      );
      assert.ok(theme.tokens, selection.dnaId);
      return JSON.stringify({
        radius: theme.tokens.radius,
        spacing: theme.tokens.spacing,
        typeRatio: theme.tokens.typography.ratio,
        surface: theme.tokens.color.surfaceStrong,
      });
    });

    assert.equal(new Set(signatures).size, 3);
  });

  test('실렌더 검수는 레거시 동일성과 1440/768/390 overflow·CLS를 실패 차단한다', () => {
    const review = source('scripts/render-dna-review.tsx');
    assert.match(review, /createElement\(SiteRenderer/u);
    assert.match(review, /same-content-three-families-390\.png/u);
    assert.match(review, /htmlByteIdentical/u);
    assert.match(review, /pixelFileIdentical/u);
    assert.match(review, /raster\.equivalent/u);
    assert.match(review, /--force-prefers-reduced-motion/u);
    assert.match(review, /\{ width: 1440,[^\n]+mode: 'desktop'/u);
    assert.match(review, /\{ width: 768,[^\n]+mode: 'mobile'/u);
    assert.match(review, /\{ width: 390,[^\n]+mode: 'mobile'/u);
    assert.match(review, /item\.overflow \|\| item\.cls !== 0/u);
    assert.match(review, /throw new Error\('Legacy OFF renderer parity failed\.'\)/u);
    assert.match(review, /throw new Error\('DNA viewport overflow\/CLS audit failed\.'\)/u);
  });

  test('검수 산출물은 기존 저장 자산만 재사용하고 생성 공급자를 호출하지 않는다', () => {
    const review = source('scripts/render-dna-review.tsx');
    assert.match(review, /public\/mock\/candidate-light\.svg/u);
    assert.match(review, /generatedAssetCalls: 0/u);
    assert.doesNotMatch(review, /generateImage|generateVideo|Veo|Gemini|Seedance/u);
  });
});
