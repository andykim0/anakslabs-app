import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { LegalFooter, SiteRenderer, TenantPageContent } from '@/components/site-renderer';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { CASES } from '@/lib/marketing/cases';
import {
  composeFictionalDemoConfig,
  FICTIONAL_DEMO_CONTENT,
} from '@/lib/marketing/fictional-demo-content';
import { auditPublishArtifacts } from '@/lib/publish/artifact-audit';
import {
  FICTIONAL_DEMO_ASSETS,
  FICTIONAL_DEMO_LABEL,
  FICTIONAL_DEMO_PROFILES,
  FICTIONAL_DEMO_SLUGS,
  buildFictionalDemo,
  configForFictionalDemoPreview,
  fictionalDemoHref,
} from '@/lib/marketing/fictional-demo-sites';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const EXPECTED_PAGE_SLUGS = {
  woldam: ['', 'story', 'course', 'guide', 'contact'],
  'yeobaek-workshop': ['', 'story', 'collection', 'process', 'contact'],
} as const;

describe('F8 — 실제 렌더러를 쓰는 가상 시네마틱 데모', () => {
  test('프로필은 승인된 두 개뿐이며 후보·시그니처·템플릿이 결정적으로 고정된다', () => {
    assert.deepEqual(FICTIONAL_DEMO_SLUGS, ['woldam', 'yeobaek-workshop']);
    assert.equal(Object.keys(FICTIONAL_DEMO_PROFILES).length, 2);

    const woldam = buildFictionalDemo('woldam');
    assert.equal(woldam.candidate.id, 'cand-dark-luxury');
    assert.equal(woldam.survey.templateId, 'local_store.fine_dining');
    assert.equal(woldam.survey.industryClass, 'fine_dining');
    assert.equal(woldam.survey.siteGoal, 'reserve');
    assert.equal(woldam.config.motion?.signatures?.[0]?.signatureId, 'scrollytelling-manifesto');

    const workshop = buildFictionalDemo('yeobaek-workshop');
    assert.equal(workshop.candidate.id, 'cand-warm-cozy');
    assert.equal(workshop.survey.templateId, 'company_brand.default');
    assert.equal(workshop.survey.industryClass, 'brand');
    assert.equal(workshop.survey.siteGoal, 'trust');
    assert.equal(workshop.config.motion?.signatures?.[0]?.signatureId, 'cinematic-scrub');
  });

  test('두 config 모두 5페이지·충분한 정보·가상 사업정보·한글 우선 폰트를 갖춘다', () => {
    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const demo = buildFictionalDemo(slug);
      const content = FICTIONAL_DEMO_CONTENT[slug];
      assert.equal(siteConfigSchema.safeParse(demo.config).success, true);
      assert.deepEqual(demo.config.pages.map((page) => page.slug), EXPECTED_PAGE_SLUGS[slug]);
      assert.equal(demo.config.pages.length, 5);
      assert.equal(demo.config.nav?.enabled, true);
      for (const page of demo.config.pages) {
        assert.ok(page.sections.length >= 3, `${slug}/${page.slug || 'home'}: 섹션이 충분하지 않음`);
        if (page.slug) {
          assert.equal(page.sections[0]?.type, 'hero', `${slug}/${page.slug}: 서브페이지 히어로 계약`);
          assert.match(page.sections[0]?.background.image?.src ?? '', /\/still-[123]\.webp$/);
        }
        const pageText = page.sections.flatMap((section) => section.elements
          .filter((element) => element.kind === 'text')
          .map((element) => element.kind === 'text' ? element.text : '')).join(' ');
        assert.ok(pageText.length >= 180, `${slug}/${page.slug || 'home'}: 정보량이 지나치게 짧음`);
        for (const section of page.sections.filter((candidate) => candidate.id.includes('-editorial-'))) {
          const heading = section.elements.find((element) => element.id.endsWith('-heading'));
          const body = section.elements.find((element) => element.id.endsWith('-body'));
          assert.ok(heading && body, `${section.id}: 제목·본문 프레임 누락`);
          assert.ok(
            heading.frame.y + heading.frame.h <= body.frame.y,
            `${section.id}: 긴 한글 제목이 본문 프레임과 겹치면 안 됨`,
          );
        }
      }

      assert.deepEqual(demo.config.businessInfo, content.businessInfo);
      assert.match(demo.config.businessInfo?.businessName ?? '', /가상 데모/);
      assert.equal(demo.config.businessInfo?.ownerName, '데모 운영자');
      assert.equal(demo.config.businessInfo?.businessNumber, '000-00-00000');
      assert.equal(demo.config.businessInfo?.address, '가상 주소 · 실제 방문 불가');
      assert.equal(demo.config.businessInfo?.phone, '000-0000-0000');
      assert.equal(demo.config.assetRefs, undefined, '코드 데모가 registry UUID를 꾸미면 안 된다');

      assert.deepEqual(demo.config.theme.fonts, content.fonts);
      assert.match(demo.config.theme.fonts.heading, /(?:Noto Serif KR|Gowun Batang)/);
      assert.match(demo.config.theme.fonts.body, /(?:Pretendard|Gowun Dodum|Noto Sans KR)/);
      const source = JSON.stringify(demo.config);
      assert.doesNotMatch(source, /Caveat|Playfair Display|Nanum Pen Script/);
      assert.doesNotMatch(source, /(?:고객\s*(?:후기|리뷰)|누적\s*\d+|매출\s*\d|전환율\s*\d|수상\s*(?:경력|실적)|₩\s*\d)/);
      assert.match(source, /데모 예시 · 가상 시나리오/);
      assert.match(source, /인스타그램/);
      assert.match(source, /(?:데모 계정 없음|실제 계정 연결 전)/);

      const elements = demo.config.pages.flatMap((page) => page.sections.flatMap((section) => section.elements));
      const socialLinks = elements.filter((element) => element.kind === 'socialLinks');
      assert.equal(socialLinks.length, 0, `${slug}: 가상 SNS를 실제 외부 링크로 만들면 안 됨`);
      const disabledFooter = renderToStaticMarkup(createElement(LegalFooter, {
        info: demo.config.businessInfo!,
        theme: demo.config.theme,
        disableActions: true,
      }));
      assert.doesNotMatch(disabledFooter, /href="tel:/);
      assert.doesNotMatch(disabledFooter, /maps|map\.naver|place\.map/i);
      assert.match(disabledFooter, /전화 000-0000-0000/);
      const sectionTypes = demo.config.pages.flatMap((page) => page.sections.map((section) => section.type));
      for (const inventedClaimType of ['testimonials', 'pricing', 'cases', 'team', 'menu']) {
        assert.equal(sectionTypes.includes(inventedClaimType as never), false, `${slug}: ${inventedClaimType} 허위 슬롯 금지`);
      }
    }
  });

  test('가상 데모 콘텐츠 계약은 4개 서브페이지보다 적으면 fail-closed다', () => {
    const demo = buildFictionalDemo('woldam');
    const content = FICTIONAL_DEMO_CONTENT.woldam;
    assert.throws(
      () => composeFictionalDemoConfig(demo.config, { ...content, pages: content.pages.slice(0, 3) }),
      /FICTIONAL_DEMO_PAGE_CONTRACT:woldam/,
    );
  });

  test('매니페스트의 경로·bytes·SHA가 실제 코드 자산과 같고 tenant registry를 사칭하지 않는다', () => {
    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const manifest = FICTIONAL_DEMO_ASSETS[slug];
      assert.equal(manifest.poster.publicPath, `/cases/demos/${slug}/poster.webp`);
      assert.equal(manifest.stills.length, 3);
      assert.deepEqual(
        manifest.stills.map((asset) => asset.publicPath),
        [1, 2, 3].map((index) => `/cases/demos/${slug}/still-${index}.webp`),
      );
      assert.equal(manifest.video.publicPath, `/cases/demos/${slug}/hero.mp4`);
      for (const asset of [manifest.poster, ...manifest.stills, manifest.video]) {
        assert.equal(asset.origin, 'ai_generated');
        assert.equal(asset.context, 'fictional_marketing_demo');
        assert.equal(asset.registryStatus, 'code_owned_marketing_asset');
        assert.equal(asset.tenantRegistry, 'not_applicable');
        const file = readFileSync(join(root, 'public', asset.publicPath));
        assert.equal(file.byteLength, asset.bytes);
        assert.equal(createHash('sha256').update(file).digest('hex'), asset.sha256);
      }
      const hero = buildFictionalDemo(slug).config.pages
        .find((page) => page.slug === '')?.sections.find((section) => section.type === 'hero');
      assert.equal(hero?.background.video?.src, manifest.video.publicPath);
      assert.equal(hero?.background.video?.poster, manifest.poster.publicPath);
      assert.equal(hero?.background.video?.bytes, manifest.video.bytes);
      const configSource = JSON.stringify(buildFictionalDemo(slug).config);
      for (const still of manifest.stills) assert.ok(configSource.includes(still.publicPath));
    }
  });

  test('실제 SiteRenderer SSR은 시그니처·poster-first video·핵심 카피를 모두 방출한다', () => {
    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const demo = buildFictionalDemo(slug);
      const profile = FICTIONAL_DEMO_PROFILES[slug];
      const html = renderToStaticMarkup(createElement(SiteRenderer, {
        config: demo.config,
        tier: 'premium',
        interactive: false,
        animate: true,
      }));
      assert.match(html, new RegExp(`data-motion-signature="${profile.signatureId}"`));
      assert.ok(html.includes(profile.businessName));
      assert.ok(html.includes(profile.copy.heroTitle.split('\n')[0]));
      assert.ok(html.includes(demo.assets.poster.publicPath));
      assert.ok(html.includes(demo.assets.video.publicPath));
      assert.match(html, /preload="none"/);
      assert.equal((html.match(/<link[^>]+rel="preload"[^>]+as="image"/g) ?? []).length, 1);
      if (profile.signatureId === 'scrollytelling-manifesto') {
        const scene = demo.config.motion?.signatures?.[0];
        assert.equal(scene?.signatureId, 'scrollytelling-manifesto');
        if (scene?.signatureId === 'scrollytelling-manifesto') {
          assert.equal(scene.acts.length, 4);
          for (const act of scene.acts) {
            assert.ok(html.includes(act.heading));
            assert.ok(html.includes(act.body));
          }
        }
      }
    }
  });

  test('정적 발행 셸·publish audit도 모든 데모 페이지에서 blocker 없이 통과한다', () => {
    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const demo = buildFictionalDemo(slug);
      const renderedPages = demo.config.pages.map((page) => {
        const bodyHtml = renderToStaticMarkup(createElement(TenantPageContent, {
          config: demo.config,
          pageSlug: page.slug,
          tier: 'premium',
          interactive: true,
          animate: true,
        }));
        return {
          pageSlug: page.slug,
          html: buildDocumentShell({
            config: demo.config,
            pageSlug: page.slug,
            headerHtml: '',
            bodyHtml,
            siteUrl: `https://${slug}.example.test`,
          }),
        };
      });
      assert.equal(renderedPages.length, 5);
      assert.deepEqual(auditPublishArtifacts(demo.config, 'premium', renderedPages).blockers, []);
      for (const rendered of renderedPages) {
        const page = demo.config.pages.find((candidate) => candidate.slug === rendered.pageSlug);
        assert.ok(page);
        assert.equal((rendered.html.match(/<h1(?:\s|>)/g) ?? []).length, 1, `${slug}/${rendered.pageSlug}: h1`);
        assert.equal((rendered.html.match(/<main(?:\s|>)/g) ?? []).length, 1, `${slug}/${rendered.pageSlug}: main`);
        assert.equal((rendered.html.match(/<footer(?:\s|>)/g) ?? []).length, 1, `${slug}/${rendered.pageSlug}: footer`);
        assert.ok(rendered.html.includes(page.title));
        assert.match(rendered.html, /class="anaks-legal-footer"/);
        assert.match(rendered.html, /사업자등록번호 000-00-00000/);
        assert.match(rendered.html, /주소 가상 주소 · 실제 방문 불가/);
        assert.match(rendered.html, /전화 000-0000-0000/);
      }
      assert.match(renderedPages[0]!.html, /<link rel="preload" as="image"[^>]+fetchpriority="high">/);
      assert.match(renderedPages[0]!.html, /<video[^>]+preload="none"/);
    }
  });

  test('마케팅 preview adapter만 내부 링크를 데모 하위 route로 바꾸고 production config는 보존한다', () => {
    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const demo = buildFictionalDemo(slug);
      const original = JSON.stringify(demo.config);
      const preview = configForFictionalDemoPreview(demo);
      const productionButtons = demo.config.pages.flatMap((page) => page.sections.flatMap((section) =>
        section.elements.filter((element) => element.kind === 'button')));
      const previewButtons = preview.pages.flatMap((page) => page.sections.flatMap((section) =>
        section.elements.filter((element) => element.kind === 'button')));
      for (const pageSlug of EXPECTED_PAGE_SLUGS[slug]) {
        const productionHref = pageSlug ? `/${pageSlug}` : '/';
        const expectedPreviewHref = fictionalDemoHref(slug, pageSlug);
        assert.ok(productionButtons.some((button) => button.kind === 'button' && button.href === productionHref));
        assert.ok(previewButtons.some((button) => button.kind === 'button' && button.href === expectedPreviewHref));
      }
      assert.equal(preview.businessInfo, demo.config.businessInfo);
      assert.equal(JSON.stringify(demo.config), original, '저장용 config 링크 의미를 바꾸면 안 된다');
      assert.equal(siteConfigSchema.safeParse(preview).success, true);
    }
  });

  test('사례 카드는 정확한 영구 라벨·내부 경로만 가지며 성과·고객 인용을 만들지 않는다', () => {
    const demoSlugs = new Set<string>(FICTIONAL_DEMO_SLUGS);
    const demos = CASES.filter((item) => demoSlugs.has(item.slug));
    assert.equal(demos.length, 2);
    for (const item of demos) {
      assert.equal(item.demoLabel, FICTIONAL_DEMO_LABEL);
      assert.equal(item.previewUrl, `/cases/demo/${item.slug}`);
      assert.equal(item.url, undefined);
      assert.equal(item.metrics, undefined);
      assert.equal(item.ownerQuote, undefined);
      assert.equal(item.before, undefined);
      assert.equal(item.after, undefined);
    }

    const cardSource = read('src/components/marketing/CaseCard.tsx');
    const routeSource = read('src/app/(marketing)/cases/demo/[slug]/_shared.tsx');
    const subpageSource = read('src/app/(marketing)/cases/demo/[slug]/[...path]/page.tsx');
    assert.match(cardSource, /item\.demoLabel \?\? '데모 사례'/);
    assert.match(cardSource, /href=\{item\.previewUrl\}/);
    assert.match(routeSource, /<SiteRenderer/);
    assert.match(routeSource, /interactive[\s\S]*animate/);
    assert.match(routeSource, /<TenantHeader/);
    assert.match(routeSource, /<SemanticOutline/);
    assert.match(routeSource, /<LegalFooter[^>]*disableActions/);
    assert.match(routeSource, /data-fictional-demo-shell/);
    assert.match(routeSource, /\.daboim-marketing>header,\.daboim-marketing>footer/);
    assert.match(routeSource, /aria-label="가상 데모 안내"/);
    assert.match(routeSource, /className="relative[^"]+sm:fixed/);
    assert.doesNotMatch(routeSource, /<main(?:\s|>)/);
    assert.match(routeSource, /robots: \{ index: false, follow: false \}/);
    assert.match(subpageSource, /generateStaticParams/);
  });

  test('빌더에는 provider 호출·외부 생성 경로가 없다', () => {
    const source = read('src/lib/marketing/fictional-demo-sites.ts');
    const contentSource = read('src/lib/marketing/fictional-demo-content.ts');
    assert.doesNotMatch(source, /generateGeminiImage|generateVeoVideo|generateVeoVideoBytes|refineCandidateTexts|fetch\(/);
    assert.doesNotMatch(contentSource, /generateGeminiImage|generateVeoVideo|generateVeoVideoBytes|refineCandidateTexts|fetch\(/);
    assert.match(source, /buildCandidateBlueprints/);
    assert.match(source, /buildSiteConfigFromSurvey/);
    assert.match(source, /applyHeroVideoToConfig/);
    assert.match(source, /applyGeneratedMotion/);
    assert.match(source, /composeFictionalDemoConfig/);
    assert.match(source, /siteConfigSchema\.parse/);
  });

  test('수동 생성 스크립트는 데모당 이미지·영상 각 1회, $5 이하, 재시도 0을 코드로 강제한다', () => {
    const source = read('scripts/generate-lp2-demo-assets.ts');
    assert.match(source, /const IMAGE_UNIT_USD = 0\.039/);
    assert.match(source, /const VIDEO_UNIT_USD = 0\.96/);
    assert.match(source, /const BATCH_HARD_CAP_USD = 5/);
    assert.equal((source.match(/await generateGeminiImage\(/g) ?? []).length, 1);
    assert.equal((source.match(/await generateVeoVideoBytes\(/g) ?? []).length, 1);
    assert.match(source, /if \(receipt\[kind\]\.status !== 'not-attempted'\)/);
    assert.match(source, /openSync\(lockPath, 'wx'\)/);
    assert.match(source, /PUBLIC_ASSET_ALREADY_EXISTS/);
    assert.match(source, /beginPaidCall\(profile, 'image'[^]*await generateGeminiImage/);
    assert.match(source, /beginPaidCall\(profile, 'video'[^]*await generateVeoVideoBytes/);
    assert.doesNotMatch(source, /for \([^)]*(?:retry|attempt)|while \([^)]*(?:retry|attempt)/i);
    assert.match(source, /'-g', '1'/);
    assert.match(source, /'-an'/);
    assert.match(source, /VIDEO_HARD_MAX_BYTES/);

    assert.doesNotMatch(source, /join\(outDir, 'generation\.json'\)/);
    for (const slug of FICTIONAL_DEMO_SLUGS) {
      assert.equal(
        existsSync(join(root, `public/cases/demos/${slug}/generation.json`)),
        false,
        `${slug}: 내부 provider 영수증은 public 자산이 아니어야 함`,
      );
    }
    const manifest = JSON.parse(read('scripts/lp2-demo-generation-manifest.json')) as {
      providerCalls: { image: number; video: number; retries: number };
      estimatedChargedUsd: number;
      assets: Record<string, {
        resolution: string;
        durationSeconds: number;
        videoCodec: string;
        frames: number;
        keyframes: number;
        audioStreams: number;
        posterSha256: string;
        videoSha256: string;
      }>;
    };
    assert.deepEqual(manifest.providerCalls, { image: 2, video: 2, retries: 0 });
    assert.equal(manifest.estimatedChargedUsd, 1.998);

    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const generation = manifest.assets[slug];
      assert.ok(generation);
      assert.equal(generation.resolution, '1920x1080');
      assert.equal(generation.durationSeconds, 8);
      assert.equal(generation.videoCodec, 'h264');
      assert.equal(generation.frames, 192);
      assert.equal(generation.keyframes, 192);
      assert.equal(generation.audioStreams, 0);
      assert.equal(generation.posterSha256, FICTIONAL_DEMO_ASSETS[slug].poster.sha256);
      assert.equal(generation.videoSha256, FICTIONAL_DEMO_ASSETS[slug].video.sha256);
    }
    assert.ok(manifest.estimatedChargedUsd <= 5);
  });
});
