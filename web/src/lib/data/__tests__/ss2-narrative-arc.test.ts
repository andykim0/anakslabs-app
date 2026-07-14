import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { buildNarrativeArc, groundedIntro } from '@/lib/data/narrative-arc';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate } from '@/lib/data/site-blueprints';
import { SITE_GOALS } from '@/lib/onboarding/site-goal';
import { SCROLLYTELLING_MOTION_ID } from '@/lib/motion/scrollytelling';
import { emptySiteConfig } from '@/lib/types/site';

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  const template = resolveTemplate('company_brand', '브랜드 회사');
  return {
    businessName: '아카이브 스튜디오',
    purposeId: 'company_brand',
    purpose: '회사를 알리고 싶어요',
    industry: '브랜드 컨설팅',
    tone: ['우아한', '차분한'],
    colorPreference: '#315c78',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    templateId: template.id,
    tagline: '본질을 오래 남기는 브랜드',
    providedContent: '[소개]\n창업자의 관점과 고객의 언어를 연결합니다.\n[서비스]\n브랜드 전략',
    highlights: ['12년 브랜드 전략 경험', '직접 진행하는 워크숍'],
    siteGoal: 'kakao_inquiry',
    heroMotionId: SCROLLYTELLING_MOTION_ID,
    videoAddon: true,
    ...overrides,
  };
}

const candidate: DesignCandidate = {
  id: 'candidate-ss2',
  label: '서사형',
  description: '테스트',
  style: 'photo',
  theme: emptySiteConfig('테스트').theme,
  heroImageUrl: '/mock/candidate.svg',
};

describe('SS2 — 결정적 narrative arc', () => {
  test('입력 원문을 분위기→정체성→증거→초대 4막으로만 매핑한다', () => {
    const input = survey();
    const acts = buildNarrativeArc(input);
    assert.equal(acts.length, 4);
    assert.deepEqual(acts.map((act) => act.band), [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]]);
    assert.equal(acts[0].heading, input.tagline);
    assert.match(acts[0].body, /우아한, 차분한/);
    assert.match(acts[1].body, /창업자의 관점과 고객의 언어를 연결합니다/);
    assert.equal(acts[2].heading, '12년 브랜드 전략 경험');
    assert.equal(acts[2].kind, 'stat');
    assert.deepEqual(acts[3], {
      heading: SITE_GOALS.kakao_inquiry.label,
      body: SITE_GOALS.kakao_inquiry.ctaLabel,
      kind: 'text',
      band: [0.75, 1],
    });
  });

  test('증거가 없으면 3막으로 축소하고, 증거·목표가 모두 없으면 기능을 적용하지 않는다', () => {
    const three = buildNarrativeArc(survey({ highlights: [] }));
    assert.equal(three.length, 3);
    assert.deepEqual(three.map((act) => act.band), [[0, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 1]]);

    assert.deepEqual(buildNarrativeArc(survey({ highlights: [], siteGoal: undefined })), []);
  });

  test('소개 블록만 정체성 근거로 쓰고 메뉴·서비스 블록을 소개로 오인하지 않는다', () => {
    const intro = '[소개]\n고객이 직접 적은 소개입니다.\n[메뉴]\n가짜 아님';
    assert.equal(groundedIntro(intro), '고객이 직접 적은 소개입니다.');
    assert.equal(groundedIntro('[메뉴]\n항목 A\n[가격]\n10,000원'), undefined);
    assert.equal(groundedIntro('머리말 없는 고객 소개 원문'), '머리말 없는 고객 소개 원문');
  });

  test('같은 입력은 같은 결과이며 생성 섹션의 후기·플레이스홀더 수치를 읽지 않는다', () => {
    const input = survey({ highlights: ['직접 진행하는 워크숍'] });
    const first = buildNarrativeArc(input);
    assert.deepEqual(first, buildNarrativeArc(structuredClone(input)));
    const text = JSON.stringify(first);
    assert.doesNotMatch(text, /98%|단골 고객|재방문 고객/);
  });

  test('허용 템플릿 + 명시 선택만 홈 hero에 acts를 보존한다', () => {
    const input = survey();
    const config = buildSiteConfigFromSurvey(input, candidate, {
      heroImageUrl: '/hero.webp',
      imagePool: ['/one.webp', '/two.webp'],
    });
    const hero = config.pages.find((page) => page.slug === '')!.sections.find((section) => section.type === 'hero')!;
    assert.equal(config.meta.templateId, input.templateId);
    assert.equal(hero.layout, 'scrollytelling');
    assert.deepEqual(hero.acts, buildNarrativeArc(input));

    const cafeTemplate = resolveTemplate('local_store', '카페');
    const cafe = survey({ purposeId: 'local_store', industry: '카페', templateId: cafeTemplate.id });
    const blocked = buildSiteConfigFromSurvey(cafe, candidate, {
      heroImageUrl: '/hero.webp',
      imagePool: ['/one.webp'],
    });
    const blockedHero = blocked.pages[0].sections.find((section) => section.type === 'hero')!;
    assert.notEqual(blockedHero.layout, 'scrollytelling');
    assert.equal(blockedHero.acts, undefined);
  });
});
