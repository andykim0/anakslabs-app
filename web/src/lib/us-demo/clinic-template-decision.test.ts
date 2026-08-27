import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { clinicHeroLayoutDecision, prospectPublicSourceImages } from './source-images';
import { buildUsMedicalCompilationAudit } from './compilation-audit';
import { compileUsMedicalDemo } from './source-compiler';
import { clinicTemplateDecisionFromSource } from './template-system';
import { prospectPublicSourceBlocks } from './source-extraction';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const SAMPLES = ['dental360', 'cameods', 'iddental'] as const;

function artifact(name: string): CrawlArtifactPayload {
  return JSON.parse(readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8')) as CrawlArtifactPayload;
}

describe('TEMPLATE-SYSTEM §7-2 — the decision is recorded, from source', () => {
  test('크롤 3건이 실제로 내리는 결정', () => {
    const measured = SAMPLES.map((name) => ({
      name,
      decision: compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' })
        .config.clinicMaster?.templateDecision,
    }));
    assert.deepEqual(measured, [
      {
        name: 'dental360',
        decision: {
          version: 1,
          templateId: null,
          designatedByDoc: 'T7',
          reason: 'multi-location US network — T7 Multi-unit, not yet implemented',
          multiLocation: true,
          singleProcedureFocus: false,
        },
      },
      {
        // One practice with a locations index and one satellite page. The old URL-count rule read
        // that as a network; it has one address, so it is not one. Its pool is entirely usable
        // photography, so this is the fixture that actually renders an implemented template.
        name: 'cameods',
        decision: {
          version: 1,
          templateId: 'T6',
          designatedByDoc: 'T6',
          reason: 'US dental with a gallery — T6 Photo Immersive, 36 usable photographs at 100% of the pool',
          multiLocation: false,
          singleProcedureFocus: false,
        },
      },
      {
        // Designated T6 and declined by the image gate: 18 of 46 images are usable photographs,
        // so a repeated gallery would be filled with rejects. Declining is the honest demotion.
        name: 'iddental',
        decision: {
          version: 1,
          templateId: null,
          designatedByDoc: 'T6',
          reason: 'US dental with a gallery — T6 Photo Immersive declined: 39% of the images are usable photographs, under the 60% a photo-led template needs',
          multiLocation: false,
          singleProcedureFocus: false,
        },
      },
    ]);
  });

  test('구현되지 않은 템플릿을 가리켜도 마스터와 섹션 순서는 그대로다', () => {
    for (const name of SAMPLES) {
      const config = compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' }).config;
      // Whether or not a template resolved, the master and its section order are untouched:
      // T6 is a media treatment, not a different page.
      assert.equal(config.clinicMaster?.masterId, 'premium-dental-v1');
      assert.equal(config.namedTemplate?.templateId, 'premium-dental-v1');
      assert.ok(config.pages.every((page) => page.sections[0]?.type === 'hero'));
    }
  });

  test('감사는 기록된 결정을 읽는다 — 컴파일된 섹션에서 되짚지 않는다', () => {
    for (const name of SAMPLES) {
      const compilation = compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' });
      const audit = buildUsMedicalCompilationAudit({
        artifact: artifact(name),
        compilation,
        renderMode: 'preview-full',
        config: compilation.config,
      });
      assert.deepEqual(audit.template, compilation.config.clinicMaster?.templateDecision);
    }
  });

  test('결정 입력은 전부 원문에서 나온다 — 섹션 타입은 쓰지 않는다', () => {
    const blocks = prospectPublicSourceBlocks(artifact('dental360'));
    const address = (text: string) => ({
      ...blocks.find((b) => b.kind === 'address')!,
      text,
    });

    /**
     * A network is a practice with more than one address. Location URLs are not the discriminator
     * and this pins that: the same two /locations/ URLs decide nothing on their own, and one
     * address with those URLs is a single practice — which is exactly the cameods case the old
     * URL-count rule got wrong.
     */
    const locationUrls = ['https://x.test/locations/', 'https://x.test/locations/north/'];
    const oneAddress = clinicTemplateDecisionFromSource({
      specialty: 'dental',
      pageUrls: locationUrls,
      blocks: [...blocks.filter((b) => b.kind !== 'address'), address('910 W Van Buren St, Chicago IL')],
      eligiblePhotoCount: 30,
    });
    assert.equal(oneAddress.input.multiLocation, false);

    const twoAddresses = clinicTemplateDecisionFromSource({
      specialty: 'dental',
      pageUrls: locationUrls,
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('910 W Van Buren St, Chicago IL'),
        address('444 W Sunset Dr, Waukesha WI'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(twoAddresses.input.multiLocation, true);
    assert.equal(twoAddresses.designatedByDoc, 'T7');

    // And no URL at all cannot hide a real network: the addresses still decide.
    const noUrls = clinicTemplateDecisionFromSource({
      specialty: 'dental',
      pageUrls: ['https://x.test/', 'https://x.test/services/'],
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('910 W Van Buren St, Chicago IL'),
        address('444 W Sunset Dr, Waukesha WI'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(noUrls.input.multiLocation, true);

    // One door written three ways is still one door — punctuation must not rebuild the false
    // positive that counting URLs produced.
    const punctuationVariants = clinicTemplateDecisionFromSource({
      specialty: 'dental',
      pageUrls: locationUrls,
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('3435 W. Irving Park Rd, Chicago, IL 60618'),
        address('3435 W Irving Park Rd Chicago, IL 60618'),
        address('3435 w irving park rd  chicago il 60618'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(punctuationVariants.input.multiLocation, false);

    /**
     * The same door with something glued to the front of it is still one door. Ora Dentistry's
     * header printed its phone immediately before its address, so a stray "1000" led one copy of
     * the address and normalisation kept both — a single dentist counted as a two-site group.
     * Containment is the rule and its whole width: one normalised address ends with the other.
     */
    const gluedPrefix = clinicTemplateDecisionFromSource({
      specialty: 'dental',
      pageUrls: locationUrls,
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('1000 2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'),
        address('2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(gluedPrefix.input.multiLocation, false);

    // And containment is not a licence to merge neighbours: same street and city, different
    // number, is two doors. Neither ends with the other.
    const twoDoorsOneStreet = clinicTemplateDecisionFromSource({
      specialty: 'dental',
      pageUrls: locationUrls,
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'),
        address('2755 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(twoDoorsOneStreet.input.multiLocation, true);

    // Trust bands come from source evidence, and two of them make it an R practice.
    // Single address on purpose: dental360's own blocks carry eight, which would correctly make
    // this a network and settle the decision at T7 before the R/S axis is ever consulted.
    const repeated = clinicTemplateDecisionFromSource({
      specialty: 'dental',
      pageUrls: ['https://x.test/reviews/', 'https://x.test/meet-the-doctors/'],
      blocks: [...blocks.filter((b) => b.kind !== 'address'), address('910 W Van Buren St, Chicago IL')],
      eligiblePhotoCount: 0,
    });
    assert.equal(repeated.input.trustSectionCount, 2);
    assert.equal(repeated.designatedByDoc, 'T2');
  });
});

describe('T6 — the media treatment, and the two stored decisions together', () => {
  const config = (name: string) => compileUsMedicalDemo(
    artifact(name),
    { renderMode: 'preview-full' },
  ).config;

  test('T6 홈은 서비스 앞뒤로 갤러리를 두 번 두고, 나머지 섹션 순서는 건드리지 않는다', () => {
    const cameods = config('cameods');
    assert.equal(cameods.clinicMaster?.templateDecision?.templateId, 'T6');
    const home = cameods.pages.find((page) => page.slug === '')!;
    const types = home.sections.map((section) => section.type);
    // §3 T6: gallery at 0.57 and repeated — a band before the services and another after.
    /**
     * `faq` is here because the ingestion guard stopped deleting cameods' credential and
     * causal-"leading" blocks: five blocks were released, three of them placed, and that pushed
     * cameods over the FAQ content threshold. The template system is reacting to more source
     * content, which is what it is supposed to do — this is not the gallery rule changing. The
     * gallery assertions below are the part this test exists to protect, and they are unmoved.
     */
    assert.deepEqual(types, ['hero', 'gallery', 'features', 'gallery', 'contact', 'faq', 'cta']);
    const galleries = home.sections.filter((section) => section.type === 'gallery');
    assert.equal(galleries.length, 2);
    // Two bands must be two sets of photographs, not the same twelve shown twice.
    const first = new Set(galleries[0].elements.filter((e) => e.kind === 'image').map((e) => e.id));
    const second = galleries[1].elements.filter((e) => e.kind === 'image').map((e) => e.id);
    assert.ok(second.length > 0);
    assert.equal(second.some((id) => first.has(id)), false, 'the second band repeats the first');
  });

  test('T6 가 아닌 곳의 홈 구성은 그대로다', () => {
    for (const name of ['dental360', 'iddental']) {
      const cfg = config(name);
      assert.notEqual(cfg.clinicMaster?.templateDecision?.templateId, 'T6');
      const types = cfg.pages.find((page) => page.slug === '')!.sections.map((s) => s.type);
      // services still lead, exactly as before T6 existed
      assert.equal(types[0], 'hero');
      assert.equal(types[1], 'features');
    }
  });

  test('결정 두 개는 함께 간다 — 템플릿만 있고 레이아웃이 없는 히어로는 불가능하다', () => {
    for (const name of ['dental360', 'cameods', 'iddental']) {
      const cfg = config(name);
      const hasTemplate = Boolean(cfg.clinicMaster?.templateDecision);
      assert.equal(hasTemplate, true, `${name} must record a template decision`);
      for (const page of cfg.pages) {
        const hero = page.sections.find((section) => section.type === 'hero');
        if (!hero?.background.image) continue;
        // A hero that carries a photograph carries the layout decision for it. The combination
        // "template recorded, layout missing" would leave the renderer branching on a mode that
        // was never decided, so it must be unreachable.
        const isStock = hero.background.image.src.startsWith('/stock/');
        assert.equal(
          Boolean(hero.clinicHeroLayout),
          !isStock,
          `${name}/${page.slug || 'home'} — source hero without a layout decision`,
        );
      }
    }
  });

  test('레이아웃 결정은 실제로 거기 있는 사진을 가리킨다 — 이월된 값이 아니다', () => {
    /**
     * The compile order is template -> composition -> photo allocation -> layout decision, and the
     * failure mode it exists to prevent is silent: a layout carried over from an earlier winner
     * describes a photograph that is no longer in the hero. So recompute from the image actually
     * sitting in background.image and require the stored decision to match it exactly.
     */
    for (const name of ['dental360', 'cameods', 'iddental']) {
      const cfg = config(name);
      const byUrl = new Map(
        prospectPublicSourceImages(artifact(name)).map((image) => [image.source.url, image]),
      );
      for (const page of cfg.pages) {
        const hero = page.sections.find((section) => section.type === 'hero');
        const stored = hero?.clinicHeroLayout;
        if (!stored) continue;
        const image = byUrl.get(hero!.background.image!.src);
        assert.ok(image, `${name}/${page.slug || 'home'} hero photo is not a source image`);
        assert.deepEqual(
          stored,
          clinicHeroLayoutDecision(image!),
          `${name}/${page.slug || 'home'} layout does not describe the photo that is there`,
        );
      }
    }
  });

  test('저장 왕복에서도 두 결정이 함께 살아남는다', () => {
    const cfg = config('cameods');
    const parsed = siteConfigSchema.parse(cfg);
    assert.equal(parsed.clinicMaster?.templateDecision?.templateId, 'T6');
    const hero = parsed.pages.find((page) => page.slug === '')!
      .sections.find((section) => section.type === 'hero')!;
    assert.ok(hero.clinicHeroLayout, 'the hero layout decision must survive the storage boundary');
    assert.deepEqual(hero.clinicHeroLayout, cfg.pages.find((p) => p.slug === '')!
      .sections.find((s) => s.type === 'hero')!.clinicHeroLayout);
  });
});
