import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { buildUsMedicalCompilationAudit } from './compilation-audit';
import { compileUsMedicalDemo } from './source-compiler';
import {
  clinicImageDimensions,
  eligibleForClinicHero,
  heroImageIsTooSmall,
  HERO_MINIMUM_HEIGHT,
  HERO_MINIMUM_WIDTH,
  heroImageIsDecorative,
  heroImageIsProviderPortrait,
  prospectPublicSourceImages,
  sourceImageIsProvider,
} from './source-images';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const SAMPLES = ['dental360', 'cameods', 'iddental'] as const;

const artifact = (name: string) => JSON.parse(
  readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8'),
) as CrawlArtifactPayload;

function auditFor(name: string) {
  const payload = artifact(name);
  const compilation = compileUsMedicalDemo(payload, { renderMode: 'preview-full' });
  return buildUsMedicalCompilationAudit({
    artifact: payload,
    compilation,
    renderMode: 'preview-full',
    config: compilation.config,
  });
}

const basename = (url: string) => new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '';

describe('D1 — hero candidacy', () => {
  test('사람 호칭이 든 파일명은 히어로에서 빠지고, 직업·장소 낱말은 빠지지 않는다', () => {
    const images = SAMPLES.flatMap((name) => prospectPublicSourceImages(artifact(name)));
    const excluded = images.filter(heroImageIsProviderPortrait).map((i) => basename(i.source.url));
    // Every match across all 113 projected images is a genuine portrait — no false positives.
    assert.equal(excluded.length, 16);
    assert.ok(excluded.every((f) => /\b(?:dr|dds|dmd|doctor|headshot|portrait)\b/iu.test(f)), excluded.join(', '));
    // A room with a dentist in it is a room. The page-context predicate calls it a provider; the
    // hero predicate must not, or the practice loses its best photograph.
    const lamp = images.find((i) => basename(i.source.url).startsWith('female-dentist-adjusting-lamp'))!;
    assert.equal(sourceImageIsProvider(lamp), true);
    assert.equal(heroImageIsProviderPortrait(lamp), false);
    assert.equal(eligibleForClinicHero(lamp), true);
  });

  test('장식 자산은 세그먼트 단위로만 걸린다', () => {
    const images = SAMPLES.flatMap((name) => prospectPublicSourceImages(artifact(name)));
    const decorative = images.filter(heroImageIsDecorative).map((i) => basename(i.source.url));
    assert.deepEqual(decorative, ['mask.png']);
  });

  test('cameods 는 더 이상 빈 마스크로 열리지 않고, 원장 사진으로도 열리지 않는다', () => {
    const heroes = auditFor('cameods').heroDecisions;
    assert.ok(heroes.every((d) => !(d.imageUrl ?? '').includes('mask.png')));
    assert.ok(
      heroes.every((d) => !/\bdr\b/iu.test(basename(d.imageUrl ?? 'x.png'))),
      heroes.map((d) => basename(d.imageUrl ?? '')).join(', '),
    );
  });
});

describe('D3 — fallback precedence, and the audit keeps telling the truth', () => {
  test('원문 생존자 > 스톡 > 없음, 그리고 heroIsStock 이 결정 로그와 일치한다', () => {
    for (const name of SAMPLES) {
      const audit = auditFor(name);
      const stockBySlug = new Map(audit.pages.map((page) => [page.slug, page.stockHero]));
      for (const decision of audit.heroDecisions) {
        assert.equal(
          decision.outcome === 'stock',
          stockBySlug.get(decision.pageSlug),
          `${name}/${decision.pageSlug || 'home'} disagrees with heroIsStock`,
        );
        // A source survivor is never displaced by stock: an allocated candidate means outcome source.
        if (decision.candidateCount > 0) assert.equal(decision.outcome, 'source');
        if (decision.outcome === 'stock') assert.equal(decision.candidateCount, 0);
      }
    }
  });

  test('스톡을 금지하지 않는다 — 후보가 없으면 정직하게 스톡으로 간다', () => {
    const iddental = auditFor('iddental').heroDecisions;
    const stock = iddental.filter((d) => d.outcome === 'stock');
    assert.ok(stock.length > 0, 'the sample with the thinnest pool must still exercise stock');
    assert.ok(stock.every((d) => d.tieBreak === 'no-candidate'));
  });
});

describe('D4 — the ranking records which stage decided', () => {
  test('모든 히어로 슬롯이 단계와 후보 수를 남긴다', () => {
    for (const name of SAMPLES) {
      const audit = auditFor(name);
      // One record per gated hero slot. The About hero is outside the gate, so it never appears.
      const slugs = new Set(audit.pages.map((page) => page.slug));
      assert.ok(audit.heroDecisions.every((d) => slugs.has(d.pageSlug)));
      assert.ok(audit.heroDecisions.every((d) => d.pageSlug !== 'about'));
      assert.equal(
        audit.heroDecisions.length,
        audit.pages.filter((page) => page.slug !== 'about').length,
      );
      for (const decision of audit.heroDecisions) {
        assert.ok([
          'atmosphere', 'known-area', 'pool-order', 'only-candidate', 'no-candidate',
        ].includes(decision.tieBreak));
        assert.equal(decision.candidateCount === 0, decision.tieBreak === 'no-candidate');
        assert.equal(decision.candidateCount === 1, decision.tieBreak === 'only-candidate');
      }
    }
  });

  test('같은 규칙이 사이트마다 다른 단계에서 갈린다 — 그래서 단계를 기록한다', () => {
    const stages = Object.fromEntries(SAMPLES.map((name) => [
      name,
      [...new Set(auditFor(name).heroDecisions.map((d) => d.tieBreak))].sort(),
    ]));
    assert.deepEqual(stages.dental360, ['atmosphere', 'known-area', 'only-candidate', 'pool-order']);
    assert.deepEqual(stages.cameods, ['pool-order']);
    assert.deepEqual(stages.iddental, ['known-area', 'no-candidate', 'only-candidate', 'pool-order']);
  });

  test('About 히어로는 이 게이트 밖이다 — 원장 사진이 정답인 유일한 자리', () => {
    // None of the three samples yields provider blocks, so no About page is compiled for them.
    // The invariant that matters is that the gate never reaches that slot: no decision is ever
    // recorded for it, which is what keeps a provider portrait allowed there.
    for (const name of SAMPLES) {
      assert.equal(auditFor(name).heroDecisions.some((d) => d.pageSlug === 'about'), false);
    }
  });
});

describe('D1(c)-lite — the size floor, measured from the filename when nothing else says', () => {
  test('워드프레스가 파일명에 적어둔 치수를 읽고, 출처를 남긴다', () => {
    const images = SAMPLES.flatMap((name) => prospectPublicSourceImages(artifact(name)));
    const tiny = images.find((i) => basename(i.source.url) === 'Untitled-2-150x150.png')!;
    assert.deepEqual(clinicImageDimensions(tiny), { width: 150, height: 150, source: 'filename' });
    const declared = images.find((i) => i.candidate.declaredWidth && i.candidate.declaredHeight)!;
    assert.equal(clinicImageDimensions(declared).source, 'metadata');
    // Nothing in the name and nothing declared stays unknown rather than being invented.
    const bare = images.find((i) => clinicImageDimensions(i).source === 'unknown')!;
    assert.equal(clinicImageDimensions(bare).width, undefined);
  });

  test('측정된 작은 이미지만 떨어지고, 치수를 모르는 이미지는 계속 후보다', () => {
    const images = SAMPLES.flatMap((name) => prospectPublicSourceImages(artifact(name)));
    const tiny = images.find((i) => basename(i.source.url) === 'Untitled-2-150x150.png')!;
    assert.equal(heroImageIsTooSmall(tiny), true);
    assert.equal(eligibleForClinicHero(tiny), false);
    const unknown = images.filter((i) => clinicImageDimensions(i).source === 'unknown');
    assert.ok(unknown.length > 0, 'the corpus must exercise the unknown-dimensions path');
    assert.ok(unknown.every((i) => !heroImageIsTooSmall(i)));
  });

  test('어떤 히어로도 하한 아래로 내려가지 않는다', () => {
    for (const name of SAMPLES) {
      const byUrl = new Map(prospectPublicSourceImages(artifact(name)).map((i) => [i.source.url, i]));
      for (const decision of auditFor(name).heroDecisions) {
        const image = decision.imageUrl ? byUrl.get(decision.imageUrl) : undefined;
        if (!image) continue;
        const { width, height, source } = clinicImageDimensions(image);
        assert.equal(decision.dimensionSource, source);
        if (source === 'unknown') continue;
        assert.ok(width! >= HERO_MINIMUM_WIDTH && height! >= HERO_MINIMUM_HEIGHT,
          `${name}/${decision.pageSlug || 'home'} kept ${width}x${height}`);
      }
    }
  });

  test('150x150 로고는 어느 히어로도 차지하지 못한다', () => {
    for (const name of SAMPLES) {
      assert.ok(auditFor(name).heroDecisions.every(
        (d) => !(d.imageUrl ?? '').includes('Untitled-2-150x150'),
      ));
    }
  });
});
