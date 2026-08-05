import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { SiteRenderer } from '@/components/site-renderer';
import { checkPublish } from '@/lib/publish/preflight';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';
import { buildJsonLd } from '@/lib/seo/jsonld';
import { applyOperatorConnectorInput } from '@/lib/operator-model/connectors';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { compilePremiumDentalMaster } from './compiler';
import { resolveClinicMasterTheme } from './tokens';
import {
  buildOperatorClinicNewbuildConfig,
  clinicNewbuildPin,
  clinicNewbuildSourceBlocks,
  neutralClinicNewbuildCopy,
  resolveClinicNewbuildServices,
  unsafeClinicNewbuildConfigForPolicyProof,
  type ClinicNewbuildInput,
} from './newbuild';
import { CLINIC_NEWBUILD_ACCENT_PRESETS } from './service-taxonomy';

const DECLARED: ClinicNewbuildInput = {
  businessName: 'Harbor Point Dental',
  specialty: 'general-dentistry',
  serviceIds: [
    'preventive-care',
    'dental-implants',
    'clear-aligners',
    'root-canal',
    'crowns-bridges',
  ],
  accentPreset: 'clean-blue',
  phone: '(213) 555-0142',
  bookingUrl: 'https://www.zocdoc.com/practice/harbor-point-dental',
  address: '410 Harbor Street, Long Beach, CA 90802',
  insurances: ['Delta Dental', 'Cigna'],
  hours: 'Mon-Thu 8:00am-5:00pm, Fri 8:00am-1:00pm',
};

async function newbuild(
  overrides: Partial<ClinicNewbuildInput> = {},
): Promise<SiteConfig> {
  const built = await buildOperatorClinicNewbuildConfig({ ...DECLARED, ...overrides });
  return built.config;
}

function connectorConfig(config: SiteConfig): SiteConfig {
  return applyOperatorConnectorInput(config, {
    phone: DECLARED.phone!,
    bookingUrl: DECLARED.bookingUrl!,
    address: DECLARED.address!,
  });
}

function render(config: SiteConfig): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'desktop',
    interactive: true,
    animate: false,
  }));
}

describe('CLINIC-NEWBUILD — declared-input premium-dental issuance', () => {
  test('선언값만으로 클리닉 디자인 시스템 홈이 완성된다', async () => {
    const html = render(connectorConfig(await newbuild()));

    assert.equal(html.match(/<h1\b/gu)?.length, 1);
    assert.match(html, /Harbor Point Dental/u);
    // 서비스는 features 카드 그리드 projection으로 나온다 (임의 id의 3열 폴백이 아니라).
    assert.match(html, /data-clinic-flow-section="features\./u);
    assert.match(html, /Preventive cleanings and exams/u);
    assert.match(html, /Full-arch|Clear aligners/u);
    // 선언한 보험사 원문
    assert.match(html, /Delta Dental/u);
    assert.match(html, /Cigna/u);
    // 전환 경로
    assert.match(html, /href="tel:2135550142"/u);
    assert.match(html, /href="https:\/\/www\.zocdoc\.com\/practice\/harbor-point-dental"/u);
    assert.match(html, /data-clinic-sticky-booking="1"/u);
    // 데모/영업 안내문은 유료 라이브에 실리지 않는다
    assert.doesNotMatch(html, /practice verification/u);
    assert.doesNotMatch(html, /advertising-claim review/u);
    assert.doesNotMatch(html, /Preview note/u);
    // 한국 전용 요소 없음
    assert.doesNotMatch(html, /NAVER|네이버/u);
  });

  test('홈 page.id는 home이라 JSON-LD가 MedicalClinic + LocalBusiness로 나온다', async () => {
    const config = await newbuild();
    assert.equal(config.pages.length, 1);
    assert.equal(config.pages[0].id, 'home');
    const types = buildJsonLd(config, 'https://harbor.example')
      .flatMap((node) => {
        const value = (node as { '@type'?: unknown })['@type'];
        return Array.isArray(value) ? value : [value];
      });
    assert.ok(types.includes('MedicalClinic'), JSON.stringify(types));
    assert.ok(types.includes('LocalBusiness'), JSON.stringify(types));
    assert.ok(!types.includes('Dentist'), JSON.stringify(types));
  });

  test('같은 선언은 바이트가 같은 config를 낸다', async () => {
    const [first, second] = await Promise.all([newbuild(), newbuild()]);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    // stock 선택과 팔레트 시드까지 결정적이다.
    assert.equal(
      first.clinicMaster?.paletteSource.sourceSha256,
      second.clinicMaster?.paletteSource.sourceSha256,
    );
    assert.deepEqual(first.assetRefs, second.assetRefs);
  });

  test('accentPreset 4종 모두 발행 감사의 팔레트·스크림 AA를 통과한다', async () => {
    for (const accentPreset of CLINIC_NEWBUILD_ACCENT_PRESETS) {
      const config = connectorConfig(await newbuild({ accentPreset }));
      const contrastBlockers = checkPublish(config, 'basic').blockers.filter(
        (blocker) => /색상 대비|대비\(AA\)/u.test(blocker),
      );
      assert.deepEqual(contrastBlockers, [], `${accentPreset}: ${contrastBlockers.join(' | ')}`);
    }
  });

  test('전환 경로가 없으면 발급 자체를 거부한다', async () => {
    await assert.rejects(
      () => buildOperatorClinicNewbuildConfig({
        ...DECLARED,
        phone: undefined,
        bookingUrl: undefined,
      }),
      /conversion path/u,
    );
  });

  test('서비스는 택소노미 2..8개만 허용한다', () => {
    assert.throws(() => resolveClinicNewbuildServices(['preventive-care']), /between 2 and 8/u);
    assert.throws(
      () => resolveClinicNewbuildServices(['preventive-care', 'not-a-service']),
      /Unknown service/u,
    );
    assert.throws(
      () => resolveClinicNewbuildServices(['preventive-care', 'preventive-care']),
      /Duplicate service/u,
    );
  });

  test('생성 카피가 정책에 걸리면 중립 템플릿으로 강등된다', async () => {
    const blocked = await buildOperatorClinicNewbuildConfig(DECLARED, {
      generateCopy: async ({ neutral }) => ({
        ...neutral,
        introduction: 'The best dental clinic with 100% guaranteed results.',
      }),
    });
    assert.equal(blocked.copySource, 'neutral-template');
    assert.ok(screenMedicalSiteConfig(blocked.config).ok);

    const failed = await buildOperatorClinicNewbuildConfig(DECLARED, {
      generateCopy: async () => { throw new Error('CLINIC_NEWBUILD_COPY_UNAVAILABLE'); },
    });
    assert.equal(failed.copySource, 'neutral-template');

    const accepted = await buildOperatorClinicNewbuildConfig(DECLARED, {
      generateCopy: async ({ neutral }) => ({
        ...neutral,
        introduction: 'Harbor Point Dental sees adults and children at one location.',
      }),
    });
    assert.equal(accepted.copySource, 'generated');
    assert.match(JSON.stringify(accepted.config), /sees adults and children/u);
  });

  // --- 비공허성 ---

  test('[비공허성] 리스크·한계 문구 의무를 끄면 의료 게이트가 실제로 막는다', async () => {
    const withDisclosure = await newbuild();
    assert.equal(screenMedicalSiteConfig(withDisclosure).ok, true);

    const without = unsafeClinicNewbuildConfigForPolicyProof(DECLARED);
    const screened = screenMedicalSiteConfig(without);
    assert.equal(screened.ok, false);
    assert.deepEqual(
      screened.violations.map((violation) => (
        violation.kind === 'copy' ? violation.ruleId : violation.code
      )),
      ['medical-side-effect-disclosure'],
    );
    assert.equal(screened.violations[0].path, '$structural.sideEffectDisclosure');
  });

  test('[비공허성] 항목별 유니크 sourceUrl을 공통값으로 되돌리면 설명이 오배치된다', () => {
    const services = resolveClinicNewbuildServices(DECLARED.serviceIds);
    const pin = clinicNewbuildPin({ declared: DECLARED, services });
    const theme = resolveClinicMasterTheme(emptySiteConfig('Harbor Point Dental').theme, pin);
    const blocks = clinicNewbuildSourceBlocks({
      declared: DECLARED,
      services,
      copy: neutralClinicNewbuildCopy(DECLARED, services),
    });

    // 구조 보장: 서비스마다, FAQ마다 sourceUrl이 유니크하다.
    const serviceUrls = blocks
      .filter((block) => block.kind === 'service')
      .map((block) => block.sourceUrl);
    assert.equal(new Set(serviceUrls).size, serviceUrls.length);
    const faqUrls = blocks
      .filter((block) => block.kind === 'faq_question')
      .map((block) => block.sourceUrl);
    assert.equal(new Set(faqUrls).size, faqUrls.length);

    // 짝짓기는 occurrence 인덱스라, 슬롯이 하나라도 비면 공통 sourceUrl은 밀린다.
    // (실제 신규 제작 카피는 항상 서비스마다 설명을 채우지만, 그 불변식이 깨지는 순간
    //  유니크 sourceUrl만이 오배치를 막는다.)
    const missingId = 'newbuild-service-detail-dental-implants';
    const gapped = blocks.filter((block) => block.id !== missingId);
    const collapsed = gapped.map((block) => ({ ...block, sourceUrl: 'newbuild://all' }));

    const alignedDetail = services.find((entry) => entry.id === 'clear-aligners')!.neutralDetail;

    function bodyBelongsToAligners(input: readonly typeof blocks[number][]): boolean {
      const section = compilePremiumDentalMaster({ blocks: input, theme, pin })
        .find((candidate) => candidate.type === 'features')!;
      const item = section.sectionLayout!.items.find(
        (candidate) => candidate.id === 'clinic-service-newbuild-service-clear-aligners',
      )!;
      const bodyId = section.elements.find(
        (element) => element.kind === 'text' && element.text === alignedDetail,
      )?.id;
      return bodyId !== undefined && item.elementIds.includes(bodyId);
    }

    assert.equal(bodyBelongsToAligners(gapped), true);
    assert.equal(bodyBelongsToAligners(collapsed), false);
  });

  // --- D5 additive 보장 ---

  test('omitRoles는 데모 슬롯 2개만 빼고 나머지 섹션 바이트를 보존한다', () => {
    const services = resolveClinicNewbuildServices(DECLARED.serviceIds);
    const pin = clinicNewbuildPin({ declared: DECLARED, services });
    const theme = resolveClinicMasterTheme(emptySiteConfig('Harbor Point Dental').theme, pin);
    const blocks = clinicNewbuildSourceBlocks({
      declared: DECLARED,
      services,
      copy: neutralClinicNewbuildCopy(DECLARED, services),
    });

    const legacy = compilePremiumDentalMaster({ blocks, theme, pin });
    assert.ok(legacy.some((section) => section.id === 'clinic-rating-aggregate'));
    assert.ok(legacy.some((section) => section.id === 'clinic-before-after-placeholder'));

    const omitted = compilePremiumDentalMaster({
      blocks,
      theme,
      pin,
      omitRoles: ['rating-aggregate', 'before-after'],
    });
    assert.deepEqual(
      omitted.map((section) => section.id),
      legacy
        .filter((section) => (
          section.id !== 'clinic-rating-aggregate'
          && section.id !== 'clinic-before-after-placeholder'
        ))
        .map((section) => section.id),
    );
    assert.equal(
      JSON.stringify(omitted),
      JSON.stringify(legacy.filter((section) => (
        section.id !== 'clinic-rating-aggregate'
        && section.id !== 'clinic-before-after-placeholder'
      ))),
    );
    // 빈 배열도 기존 분기 바이트를 그대로 둔다.
    assert.equal(
      JSON.stringify(compilePremiumDentalMaster({ blocks, theme, pin, omitRoles: [] })),
      JSON.stringify(legacy),
    );
  });
});
