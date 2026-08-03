import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { ClinicEngineProfile } from '@/lib/clinic-engine/contracts';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from '@/lib/clinic-engine/profiles';
import {
  compileRobustClinicVariants,
  type RobustClinicVariantCompilation,
} from '@/lib/clinic-engine/robust-compile';
import type { RobustClinicDocument } from '@/lib/clinic-engine/robust-source';
import { clinicExpressionAxisDifferences } from '@/lib/clinic-engine/variants';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const OUTPUT_ROOT = process.env.CLINIC_VARIANTS_OUTPUT_ROOT
  ?? '/private/tmp/clinic-variants';

interface CorpusTarget {
  market: 'KR' | 'US';
  url: string;
  canonicalUrl: string;
  predictedGrade: 'L1' | 'L2' | 'L3' | 'L4' | 'unrecorded';
}

interface CorpusSiteRecord {
  version: 1;
  target: CorpusTarget;
  status: 'success' | 'failure';
  artifact?: CrawlArtifactPayload;
  documents: Array<{
    sourceUrl: string;
    finalUrl: string;
    postModalDomFile: string;
    removedDetails?: Array<{
      selector: string;
      reason: 'explicit_close' | 'dim_backdrop';
    }>;
  }>;
}

interface CorpusManifest {
  generatedAt: string;
  siteFiles: string[];
  excluded: Array<{
    scope: 'page' | 'site';
    siteId: string;
    sourceUrl: string;
    reasonCode: string;
    reason: string;
  }>;
}

function sha(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizedUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString();
}

function siteIdFor(file: string): string {
  return file.split('/')[1] ?? '';
}

async function readGzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

async function readDocuments(
  record: CorpusSiteRecord,
  excludedPages: ReadonlySet<string>,
): Promise<RobustClinicDocument[]> {
  const result: RobustClinicDocument[] = [];
  for (const document of record.documents) {
    if (
      excludedPages.has(normalizedUrl(document.sourceUrl))
      || excludedPages.has(normalizedUrl(document.finalUrl))
    ) continue;
    result.push({
      sourceUrl: document.sourceUrl,
      finalUrl: document.finalUrl,
      html: gunzipSync(
        await readFile(path.join(CORPUS_ROOT, document.postModalDomFile)),
      ).toString('utf8'),
      ...(document.removedDetails
        ? { overlayRemovalEvidence: document.removedDetails }
        : {}),
    });
  }
  return result;
}

function filteredArtifact(
  artifact: CrawlArtifactPayload,
  excludedPages: ReadonlySet<string>,
): CrawlArtifactPayload {
  return {
    ...artifact,
    pages: artifact.pages.filter((page) => !excludedPages.has(normalizedUrl(page.url))),
  };
}

function profileFor(target: CorpusTarget): ClinicEngineProfile {
  return target.market === 'KR'
    ? KO_MEDICAL_IMPORT_PROFILE
    : US_MEDICAL_OUTREACH_PROFILE;
}

function variantEvidence(variant: RobustClinicVariantCompilation) {
  const expression = variant.variant.expression;
  return {
    id: variant.variant.id,
    configSha256: sha(variant.config),
    expression,
    expressionDifferenceFromFirst: variant.variant.expressionDifferenceFromFirst,
    activeMaterialAxes: variant.variant.activeMaterialAxes.map((axis) => ({
      axis: axis.axis,
      evidenceCount: axis.evidenceCount,
    })),
    emphasizedAxis: variant.variant.emphasizedAxis ?? null,
    pageCount: variant.config.pages.length,
    sectionCount: variant.config.pages.reduce(
      (total, page) => total + page.sections.length,
      0,
    ),
    sourceBlockCount: variant.audit.sourceBlockCount,
    targetBlockCount: variant.audit.targetBlockCount,
    placedBlockCount: variant.audit.placedBlockIds.length,
    unplacedBlockCount: variant.audit.unplacedTargetBlockIds.length,
    renderBlockViolationCount: variant.audit.renderBlockViolationCount,
    faqSourceUnitCount: variant.audit.variant?.faqSourceUnitCount ?? 0,
    faqRenderedUnitCount: variant.audit.variant?.faqRenderedUnitCount ?? 0,
    syntheticContentBlockCount: variant.audit.variant?.syntheticContentBlockCount ?? 0,
    layoutVariants: Object.fromEntries(
      [...new Set(variant.audit.pages.flatMap((page) => page.layoutVariants))]
        .sort()
        .map((layout) => [
          layout,
          variant.audit.pages.flatMap((page) => page.layoutVariants)
            .filter((candidate) => candidate === layout).length,
        ]),
    ),
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(CORPUS_ROOT, 'manifest.json'), 'utf8'),
  ) as CorpusManifest;
  const siteExclusions = new Set(manifest.excluded
    .filter((entry) => entry.scope === 'site')
    .map((entry) => entry.siteId));
  const pageExclusions = new Map<string, Set<string>>();
  for (const entry of manifest.excluded.filter((candidate) => candidate.scope === 'page')) {
    const values = pageExclusions.get(entry.siteId) ?? new Set<string>();
    values.add(normalizedUrl(entry.sourceUrl));
    pageExclusions.set(entry.siteId, values);
  }
  const sites = [];
  const capturePool: Array<{
    siteId: string;
    market: 'KR' | 'US';
    materialAxisCount: number;
    sourceBlockCount: number;
    homeItemCount: number;
    homeSectionCount: number;
    reviewable: boolean;
    variants: RobustClinicVariantCompilation[];
  }> = [];
  for (const file of manifest.siteFiles) {
    const siteId = siteIdFor(file);
    if (siteExclusions.has(siteId)) continue;
    const record = await readGzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success' || !record.artifact) continue;
    const excluded = pageExclusions.get(siteId) ?? new Set<string>();
    const artifact = filteredArtifact(record.artifact, excluded);
    const documents = await readDocuments(record, excluded);
    try {
      const first = compileRobustClinicVariants({
        artifact,
        documents,
        profile: profileFor(record.target),
      });
      const second = compileRobustClinicVariants({
        artifact,
        documents,
        profile: profileFor(record.target),
      });
      const setSha = sha(first);
      const repeatedSetSha = sha(second);
      const pairwiseExpressionDifferences = first.variants.flatMap((left, leftIndex) => (
        first.variants.slice(leftIndex + 1).map((right) => ({
          pair: [left.variant.id, right.variant.id],
          axes: clinicExpressionAxisDifferences(
            left.variant.expression,
            right.variant.expression,
          ),
        }))
      ));
      const materialIndependentAxes = new Set([
        'typography',
        'palette-tone',
        'motion-signature',
        'density-rhythm',
      ]);
      const evidence = first.variants.map(variantEvidence);
      const activeAxes = first.variants[0]?.variant.activeMaterialAxes ?? [];
      sites.push({
        siteId,
        market: record.target.market,
        seedUrl: record.target.url,
        status: 'success' as const,
        N: first.variants.length,
        setSha256: setSha,
        repeatedSetSha256: repeatedSetSha,
        deterministic: setSha === repeatedSetSha,
        minimumPairwiseExpressionAxisDifference: Math.min(
          ...pairwiseExpressionDifferences.map((entry) => entry.axes.length),
        ),
        minimumMaterialIndependentExpressionAxisDifference: Math.min(
          ...pairwiseExpressionDifferences.map((entry) => (
            entry.axes.filter((axis) => materialIndependentAxes.has(axis)).length
          )),
        ),
        pairwiseExpressionDifferences,
        activeMaterialAxes: activeAxes.map((axis) => ({
          axis: axis.axis,
          evidenceCount: axis.evidenceCount,
        })),
        variants: evidence,
      });
      capturePool.push({
        siteId,
        market: record.target.market,
        materialAxisCount: activeAxes.length,
        sourceBlockCount: first.variants[0]?.audit.sourceBlockCount ?? 0,
        homeItemCount: (() => {
          const home = first.variants[0]?.config.pages.find((page) => page.slug === '')
            ?? first.variants[0]?.config.pages[0];
          return home?.sections.reduce((total, section) => (
            total + (section.sectionLayout?.items.length ?? 0)
          ), 0) ?? 0;
        })(),
        homeSectionCount: (
          first.variants[0]?.config.pages.find((page) => page.slug === '')
            ?? first.variants[0]?.config.pages[0]
        )?.sections.length ?? 0,
        reviewable: !/(?:404|not found|forbidden|access denied|error)/iu.test(
          first.variants[0]?.config.pages[0]?.title ?? '',
        ),
        variants: first.variants,
      });
    } catch (error) {
      sites.push({
        siteId,
        market: record.target.market,
        seedUrl: record.target.url,
        status: 'failure' as const,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  capturePool.sort((left, right) => (
    left.materialAxisCount - right.materialAxisCount
    || left.sourceBlockCount - right.sourceBlockCount
    || left.siteId.localeCompare(right.siteId)
  ));
  const reviewableCapturePool = capturePool.filter((entry) => entry.reviewable);
  const selected = [
    { label: 'material-worst', value: reviewableCapturePool[0] },
    {
      label: 'material-median',
      value: reviewableCapturePool[Math.floor(reviewableCapturePool.length / 2)],
    },
    { label: 'material-best', value: reviewableCapturePool.at(-1) },
  ].filter((entry): entry is { label: string; value: NonNullable<typeof entry.value> } => (
    Boolean(entry.value)
  ));
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(path.join(OUTPUT_ROOT, 'driver-report.json'), `${JSON.stringify({
    version: 1,
    corpusGeneratedAt: manifest.generatedAt,
    measuredAt: new Date().toISOString(),
    issuance: false,
    eligibleRecordCount: sites.length,
    compileSuccessCount: sites.filter((site) => site.status === 'success').length,
    compileFailureCount: sites.filter((site) => site.status === 'failure').length,
    visualSamplingExcluded: capturePool
      .filter((entry) => !entry.reviewable)
      .map((entry) => ({
        siteId: entry.siteId,
        reason: 'source title is an access/error document; retained in N audit, not called a clinic visual',
      })),
    sites,
  }, null, 2)}\n`);
  await writeFile(path.join(OUTPUT_ROOT, 'capture-configs.json'), `${JSON.stringify(
    selected.map((entry) => ({
      label: entry.label,
      siteId: entry.value.siteId,
      market: entry.value.market,
      materialAxisCount: entry.value.materialAxisCount,
      sourceBlockCount: entry.value.sourceBlockCount,
      variants: entry.value.variants.map((variant) => ({
        id: variant.variant.id,
        expression: variant.variant.expression,
        config: variant.config,
      })),
    })),
    null,
    2,
  )}\n`);
  const signatureConfigs = new Map<string, {
    siteId: string;
    variantId: string;
    config: RobustClinicVariantCompilation['config'];
  }>();
  const compactMotionCapturePool = [...reviewableCapturePool]
    .filter((candidate) => (
      candidate.homeSectionCount >= 2
      && candidate.homeItemCount >= 6
      && candidate.homeItemCount <= 40
    ))
    .sort((left, right) => (
      left.homeItemCount - right.homeItemCount
      || left.homeSectionCount - right.homeSectionCount
      || left.siteId.localeCompare(right.siteId)
    ));
  const preferredMotionCandidate = selected.find((entry) => (
    entry.label === 'material-median'
  ))?.value;
  const motionCapturePool = [
    ...(preferredMotionCandidate ? [preferredMotionCandidate] : []),
    ...compactMotionCapturePool.filter((candidate) => (
      candidate.siteId !== preferredMotionCandidate?.siteId
    )),
  ];
  for (const candidate of motionCapturePool) {
    for (const variant of candidate.variants) {
      const signature = variant.variant.expression.motionSignature;
      const home = variant.config.pages.find((page) => page.slug === '')
        ?? variant.config.pages[0];
      if (!signatureConfigs.has(signature) && (home?.sections.length ?? 0) >= 2) {
        signatureConfigs.set(signature, {
          siteId: candidate.siteId,
          variantId: variant.variant.id,
          config: variant.config,
        });
      }
    }
  }
  await writeFile(path.join(OUTPUT_ROOT, 'motion-configs.json'), `${JSON.stringify(
    Object.fromEntries(signatureConfigs),
    null,
    2,
  )}\n`);
  await Promise.all([...signatureConfigs.entries()].map(([signature, entry]) => (
    writeFile(
      path.join(OUTPUT_ROOT, `motion-${signature}.json`),
      `${JSON.stringify(entry.config, null, 2)}\n`,
    )
  )));
  process.stdout.write(`${JSON.stringify({
    output: path.join(OUTPUT_ROOT, 'driver-report.json'),
    compileSuccessCount: sites.filter((site) => site.status === 'success').length,
    compileFailureCount: sites.filter((site) => site.status === 'failure').length,
    captureSites: selected.map((entry) => ({
      label: entry.label,
      siteId: entry.value.siteId,
      N: entry.value.variants.length,
    })),
    motionSignatures: [...signatureConfigs.keys()],
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
