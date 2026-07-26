import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import { buildCandidateBlueprintsForPipeline } from '@/lib/data/design-candidates';
import { emptySiteConfig, type SiteTheme } from '@/lib/types/site';
import { initializeEditor, useEditorStore } from '@/stores/editor';
import {
  applyKoreanFontPairing,
  fontPairingResources,
  MODERN_DNA_FONT_PAIRING_MAP,
  MODERN_KOREAN_FONT_SELECTION_POLICY,
  resolveKoreanFontPairingId,
} from '.';

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '온결',
    purposeId: 'local_store',
    purpose: '동네 가게',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', required: true, source: 'template' }],
    templateId: 'local_store.default',
    imageStyle: 'photo',
    ...overrides,
  } as SurveyInput;
}

const dnaCalls = [
  { dna_id: 'cafe-warm-editorial', hue_seed: 28, overrides: {} },
  { dna_id: 'medical-clinical-clarity', hue_seed: 190, overrides: {} },
  { dna_id: 'retail-bold-geometric', hue_seed: 315, overrides: {} },
];

function legacyTheme(): SiteTheme {
  return {
    fonts: {
      heading: "'Noto Serif KR', serif",
      body: "'Pretendard', sans-serif",
      googleFonts: ['Noto Serif KR'],
    },
    palette: {
      background: '#ffffff',
      surface: '#f7f7f7',
      text: '#111111',
      muted: '#666666',
      primary: '#315ad8',
      accent: '#13a78e',
    },
  };
}

describe('FNT F3 — 신규 생성 선택·pin 배선', () => {
  test('플래그 OFF는 DNA 후보에 fontPairing을 발급하지 않고 ON만 결정적 pin을 저장한다', async () => {
    const input = survey();
    const off = await buildCandidateBlueprintsForPipeline(input, {
      enabled: true,
      invoke: async () => dnaCalls,
      layoutEnabled: false,
      fontPairingEnabled: false,
    });
    const on = await buildCandidateBlueprintsForPipeline(input, {
      enabled: true,
      invoke: async () => dnaCalls,
      layoutEnabled: false,
      fontPairingEnabled: true,
    });
    const rerun = await buildCandidateBlueprintsForPipeline(input, {
      enabled: true,
      invoke: async () => dnaCalls,
      layoutEnabled: false,
      fontPairingEnabled: true,
    });
    assert.ok(off.every((candidate) => candidate.theme.fontPairing === undefined));
    assert.ok(on.every((candidate) => candidate.theme.fontPairing !== undefined));
    assert.ok(on.every((candidate) => (
      candidate.theme.fontPairing?.selectionPolicy
        === MODERN_KOREAN_FONT_SELECTION_POLICY
    )));
    assert.deepEqual(on, rerun);
  });

  test('현대화 선택표는 8 DNA를 산세리프 기반 세트로 결정하고 명조를 자동 발급하지 않는다', () => {
    assert.equal(
      resolveKoreanFontPairingId({
        dnaId: 'academy-structured-friendly',
        industryClass: 'other',
      }),
      'kr-nanum-square-round-friendly',
    );
    assert.equal(
      resolveKoreanFontPairingId({
        dnaId: 'dining-refined-contrast',
        industryClass: 'fine_dining',
      }),
      'kr-pretendard-neutral',
    );
    assert.equal(
      resolveKoreanFontPairingId({
        dnaId: 'retail-bold-geometric',
        industryClass: 'retail',
      }),
      'kr-gmarket-noto-structured',
    );
    assert.equal(Object.keys(MODERN_DNA_FONT_PAIRING_MAP).length, 8);
    assert.equal(
      (Object.values(MODERN_DNA_FONT_PAIRING_MAP) as readonly string[])
        .includes('kr-nanum-myeongjo-readable'),
      false,
    );
  });

  test('저장된 pin은 런타임 플래그와 무관하게 inline optional face만 소비한다', () => {
    const theme = applyKoreanFontPairing(legacyTheme(), 'kr-nanum-myeongjo-readable');
    const resources = fontPairingResources(theme);
    assert.ok(resources);
    assert.equal(resources.id, 'kr-nanum-myeongjo-readable');
    assert.equal(resources.familyCount, 2);
    assert.equal(resources.faceCount, 3);
    assert.equal((resources.css.match(/@font-face/gu) ?? []).length, resources.assets.length);
    assert.equal((resources.css.match(/font-display:optional/gu) ?? []).length, resources.assets.length);
    assert.equal((resources.css.match(/unicode-range:/gu) ?? []).length, resources.assets.length);
    assert.doesNotMatch(resources.css, /fonts\.googleapis|cdn\.jsdelivr|preload/iu);
  });

  test('에디터에서 폰트를 직접 바꾸면 stale pin만 제거하고 기존 편집 경로는 유지한다', () => {
    const config = emptySiteConfig('폰트 편집');
    config.theme = applyKoreanFontPairing(config.theme, 'kr-pretendard-neutral');
    initializeEditor('site-font-editor', config, 'basic');
    useEditorStore.getState().updateTheme({
      fonts: {
        heading: "'Nanum Myeongjo', serif",
        googleFonts: ['Nanum Myeongjo'],
      },
      clearFontPairing: true,
    });
    const edited = useEditorStore.getState().config.theme;
    assert.equal(edited.fontPairing, undefined);
    assert.equal(edited.fonts.heading, "'Nanum Myeongjo', serif");
    assert.deepEqual(edited.fonts.googleFonts, ['Nanum Myeongjo']);
  });
});
