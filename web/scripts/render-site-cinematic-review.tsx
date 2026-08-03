/**
 * SITECINE owner-review fixtures. Uses SiteRenderer and repository-owned mock media only.
 * No generated asset or provider call is made.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-site-cinematic-review.tsx
 * Out: /private/tmp/anakslabs-site-cinematic-review
 */
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey, type SectionCopy } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme, type DesignDNA } from '@/lib/design/dna';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import type { DesignCandidate, SitePurposeId, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const OUTPUT_DIR = process.env.SITECINE_REVIEW_OUTPUT ?? '/private/tmp/anakslabs-site-cinematic-review';
const HERO_SOURCE = path.resolve('public/mock/candidate-light.svg');
const VIDEO_SOURCE = path.resolve('public/mock/clip-ember.mp4');

interface IndustrySpec {
  id: string;
  label: string;
  purposeId: SitePurposeId;
  purpose: string;
  industry: string;
  businessName: string;
  tagline: string;
  tone: string[];
  dnaId: DesignDNA['id'];
  hueSeed: number;
  heroVariant: 'fullbleed' | 'centered' | 'split';
  copy: SectionCopy;
}

const SPECS: readonly IndustrySpec[] = [
  {
    id: 'cafe', label: '카페', purposeId: 'local_store', purpose: '음식점·로컬 매장', industry: '카페',
    businessName: '모과 커피', tagline: '천천히 내린 한 잔과 오늘의 디저트', tone: ['따뜻한', '차분한'],
    dnaId: 'cafe-warm-editorial', hueSeed: 44, heroVariant: 'fullbleed',
    copy: {
      heroKicker: '동네에서 쉬어 가는 한 잔', heroTitle: '매일의 한 잔을\n차분하게 준비합니다',
      heroSub: '메뉴와 공간, 방문 전에 궁금한 내용을 한눈에 안내합니다.',
    },
  },
  {
    id: 'medical', label: '의료', purposeId: 'booking_service', purpose: '예약·서비스업', industry: '의원',
    businessName: '새봄 의원', tagline: '진료 전 궁금한 내용을 분명하게 안내합니다', tone: ['신뢰감 있는', '차분한'],
    dnaId: 'medical-clinical-clarity', hueSeed: 184, heroVariant: 'centered',
    copy: {
      heroKicker: '차분하고 분명한 진료 안내', heroTitle: '알기 쉬운 설명으로\n진료의 첫걸음을 돕습니다',
      heroSub: '진료 분야와 운영 시간, 방문 전에 필요한 내용을 한곳에서 확인하세요.',
    },
  },
  {
    id: 'retail', label: '리테일', purposeId: 'local_store', purpose: '음식점·로컬 매장', industry: '리테일 편집숍',
    businessName: '파도 상점', tagline: '일상에 오래 남는 물건을 고릅니다', tone: ['선명한', '감각적인'],
    dnaId: 'retail-bold-geometric', hueSeed: 312, heroVariant: 'split',
    copy: {
      heroKicker: '오늘의 물건을 고르는 기준', heroTitle: '쓰임과 모양이 좋은\n생활 도구를 소개합니다',
      heroSub: '새로 들어온 제품과 카테고리, 방문 정보를 빠르게 둘러보세요.',
    },
  },
] as const;

function survey(spec: IndustrySpec): SurveyInput {
  const template = resolveTemplate(spec.purposeId, spec.industry);
  return {
    businessName: spec.businessName,
    purposeId: spec.purposeId,
    purpose: spec.purpose,
    industry: spec.industry,
    tagline: spec.tagline,
    region: '서울',
    tone: [...spec.tone],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageStyle: 'photo',
  } as SurveyInput;
}

function candidate(input: SurveyInput, spec: IndustrySpec, heroImageUrl: string): DesignCandidate {
  const legacy = buildCandidateBlueprints(input)[0];
  if (!legacy) throw new Error(`Candidate missing for ${spec.industry}`);
  return {
    ...legacy,
    heroImageUrl,
    theme: tokenSetToSiteTheme(expandTokens(spec.dnaId, spec.hueSeed)),
    designDna: { catalogVersion: 1, dnaId: spec.dnaId, hueSeed: spec.hueSeed, overrides: {} },
  };
}

function buildConfig(spec: IndustrySpec, heroImageUrl: string): SiteConfig {
  const input = survey(spec);
  const config = buildSiteConfigFromSurvey(input, candidate(input, spec, heroImageUrl), {
    heroImageUrl,
    imagePool: [heroImageUrl],
    heroVariant: spec.heroVariant,
    copy: spec.copy,
  });
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  return config;
}

function fixtureDocument(config: SiteConfig, mode: 'desktop' | 'mobile'): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: true,
    animate: true,
    tier: 'premium',
    runtimeDelivery: 'inline',
  })).replace(/<link[^>]*>/gu, '');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;overflow-x:hidden;background:${config.theme.palette.background}}body{min-height:100dvh}</style></head><body>${markup}</body></html>`;
}

function attachReviewVideo(config: SiteConfig): SiteConfig {
  const next = structuredClone(config);
  const hero = next.pages[0]?.sections.find((section) => section.type === 'hero');
  if (!hero) throw new Error('Video review hero missing');
  hero.background.image = {
    src: '/assets/customer-poster.svg', overlayColor: '#081426', overlayOpacity: 0.44,
  };
  hero.background.video = {
    src: '/assets/customer-film.mp4', poster: '/assets/customer-poster.svg', bytes: 40_000,
  };
  next.motion = { presetId: 'cinematic-hero', intensity: 'normal', heroTechnique: 'video-hero' };
  return next;
}

async function fileBytes(file: string): Promise<number> {
  return (await stat(file)).size;
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'assets'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'recordings'), { recursive: true });

  const heroSource = await readFile(HERO_SOURCE);
  const heroImageUrl = `data:image/svg+xml;base64,${heroSource.toString('base64')}`;
  await copyFile(HERO_SOURCE, path.join(OUTPUT_DIR, 'assets', 'customer-poster.svg'));
  await copyFile(VIDEO_SOURCE, path.join(OUTPUT_DIR, 'assets', 'customer-film.mp4'));

  const fixtures: Array<{
    id: string;
    html: string;
    label: string;
    industry: string;
    width: number;
    height: number;
    mode: 'desktop' | 'mobile';
    rollout: 'legacy' | 'site-cinematic';
  }> = [];
  const afterConfigs = new Map<string, SiteConfig>();

  for (const spec of SPECS) {
    const legacy = buildConfig(spec, heroImageUrl);
    const current = withSiteCinematicDefault(legacy);
    afterConfigs.set(spec.id, current);
    for (const viewport of [
      { width: 1440, height: 900, mode: 'desktop' as const },
      { width: 768, height: 900, mode: 'mobile' as const },
      { width: 390, height: 844, mode: 'mobile' as const },
    ]) {
      const id = `${spec.id}-${viewport.width}`;
      const html = `fixtures/${id}.html`;
      await writeFile(path.join(OUTPUT_DIR, html), fixtureDocument(current, viewport.mode), 'utf8');
      fixtures.push({ id, html, label: spec.label, industry: spec.industry, ...viewport, rollout: 'site-cinematic' });
    }
    if (spec.id === 'cafe') {
      for (const viewport of [
        { width: 1440, height: 900, mode: 'desktop' as const },
        { width: 390, height: 844, mode: 'mobile' as const },
      ]) {
        const id = `cafe-before-${viewport.width}`;
        const html = `fixtures/${id}.html`;
        await writeFile(path.join(OUTPUT_DIR, html), fixtureDocument(legacy, viewport.mode), 'utf8');
        fixtures.push({ id, html, label: '카페 · 기존 발행 계약', industry: spec.industry, ...viewport, rollout: 'legacy' });
      }
    }
  }

  const cafe = afterConfigs.get('cafe');
  if (!cafe) throw new Error('Cafe review config missing');
  const videoConfig = attachReviewVideo(cafe);
  const videoHtml = 'fixtures/customer-video-1440.html';
  await writeFile(path.join(OUTPUT_DIR, videoHtml), fixtureDocument(videoConfig, 'desktop'), 'utf8');
  fixtures.push({
    id: 'customer-video-1440', html: videoHtml, label: '고객 영상 경로', industry: '카페',
    width: 1440, height: 900, mode: 'desktop', rollout: 'site-cinematic',
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    rendererPath: 'buildSiteConfigFromSurvey -> withSiteCinematicDefault -> SiteRenderer',
    generatedAssetCalls: 0,
    reusedAssets: [path.relative(process.cwd(), HERO_SOURCE), path.relative(process.cwd(), VIDEO_SOURCE)],
    fixtures,
    representativeIndustries: SPECS.map((spec) => ({
      id: spec.id, label: spec.label, dnaId: spec.dnaId, hueSeed: spec.hueSeed,
      sectionCount: afterConfigs.get(spec.id)?.pages[0]?.sections.length ?? 0,
    })),
    comparison: {
      desktop: { before: 'fixtures/cafe-before-1440.html', after: 'fixtures/cafe-1440.html' },
      mobile: { before: 'fixtures/cafe-before-390.html', after: 'fixtures/cafe-390.html' },
    },
    performanceFixture: { before: 'fixtures/cafe-before-390.html', after: 'fixtures/cafe-390.html' },
    media: {
      video: { file: 'assets/customer-film.mp4', bytes: await fileBytes(VIDEO_SOURCE) },
      poster: { file: 'assets/customer-poster.svg', bytes: await fileBytes(HERO_SOURCE) },
    },
  };
  await writeFile(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  process.stdout.write(`SITECINE fixtures: ${fixtures.length} -> ${OUTPUT_DIR}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
