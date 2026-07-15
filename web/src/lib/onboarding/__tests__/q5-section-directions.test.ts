import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { emptySiteConfig, type Section, type SectionDirection, type SiteConfig } from '@/lib/types/site';
import { scrimPassesAA } from '@/lib/design/scrim';
import {
  applySectionDirection,
  applySectionDirections,
  configForSectionReview,
  reviewTargets,
  sectionContentFingerprint,
  sectionDirectionGuidesFromNote,
  sectionDirectionPrompt,
  sectionDirectionsIntent,
} from '@/lib/onboarding/section-directions';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function hero(): Section {
  return {
    id: 'hero',
    type: 'hero',
    name: '첫인상',
    height: 760,
    background: { image: { src: '/real-hero.webp', overlayOpacity: 0.1 } },
    elements: [
      { id: 'title', kind: 'text', text: '실제 경력 12년', frame: { x: 100, y: 120, w: 600, h: 120 }, z: 2, style: { fontSize: 64, fontWeight: 700 } },
      { id: 'photo', kind: 'image', src: '/real-product.webp', alt: '고객 제공 실제 사진', frame: { x: 820, y: 80, w: 480, h: 520 }, z: 1, style: { objectFit: 'cover' } },
      { id: 'cta', kind: 'button', label: '상담하기', href: '#contact', frame: { x: 100, y: 300, w: 180, h: 56 }, z: 3, style: { variant: 'solid' } },
      { id: 'shape', kind: 'shape', shape: 'ellipse', frame: { x: 40, y: 40, w: 160, h: 160 }, z: 0, style: { fill: '#eef4ff' } },
    ],
  };
}

function contact(): Section {
  return {
    id: 'contact',
    type: 'contact',
    name: '문의',
    height: 560,
    background: { color: '#ffffff' },
    elements: [
      { id: 'contact-title', kind: 'text', text: '문의해 주세요', frame: { x: 120, y: 100, w: 600, h: 80 }, z: 1, style: { fontSize: 42 } },
      { id: 'contact-form', kind: 'form', formType: 'contact', fields: ['name', 'phone', 'message'], submitLabel: '문의 보내기', frame: { x: 760, y: 80, w: 520, h: 360 }, z: 1, style: { variant: 'card' } },
    ],
  };
}

function config(): SiteConfig {
  const value = emptySiteConfig('디렉션 검수');
  value.pages[0].sections = [hero()];
  value.pages.push({ id: 'contact-page', title: '문의', slug: 'contact-us', sections: [contact()] });
  return value;
}

describe('Q$5 — 섹션별 결정적 부분 재디자인', () => {
  test('review target은 보이는 섹션만 페이지 순서로 정확히 한 번 나열한다', () => {
    const value = config();
    value.pages[0].sections.push({ ...contact(), id: 'hidden', hidden: true });
    assert.deepEqual(reviewTargets(value), [
      { pageSlug: '', pageTitle: '홈', sectionId: 'hero', sectionName: '첫인상' },
      { pageSlug: 'contact-us', pageTitle: '문의', sectionId: 'contact', sectionName: '문의' },
    ]);
  });

  test('keep은 타깃 section과 비타깃 page/section 모두 diff 0으로 동결하고 이력만 남긴다', () => {
    const value = config();
    const heroBefore = value.pages[0].sections[0];
    const otherPage = value.pages[1];
    const result = applySectionDirection(value, { sectionId: 'hero', intent: 'keep' });

    assert.equal(result.pages[0].sections[0], heroBefore);
    assert.deepEqual(result.pages[0].sections[0], heroBefore);
    assert.equal(result.pages[1], otherPage);
    assert.deepEqual(result.directions, [{ sectionId: 'hero', intent: 'keep' }]);
  });

  test('adjust는 등록 디렉션만 타깃에 반영하고 사실·사진·링크는 byte-identical이다', () => {
    const value = config();
    const heroBefore = value.pages[0].sections[0];
    const otherSection = value.pages[1].sections[0];
    const result = applySectionDirection(value, {
      sectionId: 'hero',
      intent: 'adjust',
      guided: ['사진 더 크게', '여백 늘리기', '카피 강조', '톤 더 따뜻하게'],
      note: '대표 사진을 크게 하고 카피도 강조해 주세요',
    });
    const heroAfter = result.pages[0].sections[0];

    assert.equal(sectionContentFingerprint(heroAfter), sectionContentFingerprint(heroBefore));
    assert.equal(result.pages[1].sections[0], otherSection);
    assert.ok(heroAfter.height > heroBefore.height);
    assert.ok(heroAfter.elements.find((element) => element.id === 'photo')!.frame.w > 480);
    assert.equal(heroAfter.background.image?.src, '/real-hero.webp');
    assert.equal(heroAfter.background.image?.overlayColor, '#4a2418');
    const heroText = heroAfter.elements.find((element) => element.id === 'title');
    assert.equal(heroText?.kind, 'text');
    assert.equal(
      scrimPassesAA(
        heroAfter.background.image!.overlayColor!,
        heroAfter.background.image!.overlayOpacity!,
        heroText!.kind === 'text' ? heroText!.style.color! : '',
      ),
      true,
      '사용자 tone 조정도 AA를 깨면 안 된다',
    );
  });

  test('regenerate는 같은 콘텐츠를 다른 레이아웃으로 배치하고 결과가 결정적이다', () => {
    const firstInput = config();
    const secondInput = config();
    const direction: SectionDirection = { sectionId: 'hero', intent: 'regenerate', guided: ['더 역동적으로'] };
    const first = applySectionDirection(firstInput, direction);
    const second = applySectionDirection(secondInput, direction);

    assert.deepEqual(first, second);
    assert.notDeepEqual(first.pages[0].sections[0].elements[0].frame, firstInput.pages[0].sections[0].elements[0].frame);
    assert.equal(
      sectionContentFingerprint(first.pages[0].sections[0]),
      sectionContentFingerprint(firstInput.pages[0].sections[0]),
    );
  });

  test('고객 note·칩은 생성용 방향 문자열에 남고 날조 금지 문장이 항상 붙는다', () => {
    const prompt = sectionDirectionPrompt({
      sectionId: 'hero',
      intent: 'adjust',
      guided: ['더 미니멀', '신뢰 요소 강조'],
      note: '숫자는 그대로 두고 더 차분하게',
    });
    assert.match(prompt, /reduce decorative weight/);
    assert.match(prompt, /existing proof only/);
    assert.match(prompt, /숫자는 그대로 두고 더 차분하게/);
    assert.match(prompt, /Preserve every supplied fact, number, name, media source, label, and link exactly/);
  });

  test('자유 메모는 실제 지원하는 등록 방향만 판정하고 intent 서명은 이력 변화를 구분한다', () => {
    assert.deepEqual(sectionDirectionGuidesFromNote('사진을 더 크게 하고 여백도 늘려주세요'), [
      '사진 더 크게',
      '여백 늘리기',
    ]);
    assert.deepEqual(sectionDirectionGuidesFromNote('좀 더 고급스럽게 해주세요'), []);

    const directions: SectionDirection[] = [{ sectionId: 'hero', intent: 'keep' }];
    assert.equal(sectionDirectionsIntent(directions), sectionDirectionsIntent(structuredClone(directions)));
    assert.notEqual(
      sectionDirectionsIntent(directions),
      sectionDirectionsIntent([...directions, { sectionId: 'contact', intent: 'adjust', guided: ['여백 늘리기'] }]),
    );
  });

  test('generate/regenerate와 실 AI 카피 프롬프트가 같은 directions 계약을 소비한다', () => {
    const value = config();
    value.directions = [{ sectionId: 'hero', intent: 'adjust', guided: ['여백 늘리기'] }];
    const applied = applySectionDirections(value, value.directions);
    assert.ok(applied.pages[0].sections[0].height > value.pages[0].sections[0].height);
    assert.deepEqual(applied.directions, value.directions, 'generation 재현이 direction history를 중복시키면 안 된다');

    const generate = source('src/app/api/onboarding/generate/route.ts');
    const regenerate = source('src/app/api/onboarding/regenerate/route.ts');
    const ai = source('src/lib/data/supabase/ai.ts');
    const client = source('src/components/dashboard/onboarding/generate-step.tsx');
    assert.match(generate, /applySectionDirections\([\s\S]*survey\.directions/);
    assert.match(regenerate, /applySectionDirections\([\s\S]*survey\.directions/);
    assert.match(ai, /survey\.directions[\s\S]*sectionDirectionPrompt/);
    assert.match(ai, /기존 사실·숫자·이름·링크는 그대로 보존/);
    assert.match(client, /sectionDirectionsIntent\(survey\.directions\)/);
  });

  test('타깃 preview projection은 원본을 바꾸지 않고 비홈 페이지도 유효한 단일 홈으로 보여준다', () => {
    const value = config();
    const before = structuredClone(value);
    const projected = configForSectionReview(value, 'contact-us', 'contact');
    assert.equal(projected.pages.length, 1);
    assert.equal(projected.pages[0].slug, '');
    assert.deepEqual(projected.pages[0].sections.map((section) => section.id), ['contact']);
    assert.deepEqual(value, before);
  });

  test('없는 section/오염된 intent는 fail-closed로 원본 identity를 반환한다', () => {
    const value = config();
    assert.equal(applySectionDirection(value, { sectionId: 'missing', intent: 'adjust' }), value);
    assert.equal(
      applySectionDirection(value, { sectionId: 'hero', intent: 'delete' } as unknown as SectionDirection),
      value,
    );
  });
});
