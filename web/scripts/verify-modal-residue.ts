import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeType, parse, type HTMLElement, type Node } from 'node-html-parser';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  compileRobustClinicArtifact,
} from '@/lib/clinic-engine/robust-compile';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from '@/lib/clinic-engine/profiles';
import {
  extractRobustClinicSource,
  type RobustClinicDocument,
  type RobustClinicSourceBlock,
} from '@/lib/clinic-engine/robust-source';
import type { ClinicEngineProfile } from '@/lib/clinic-engine/contracts';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const OUTPUT_ROOT = '/private/tmp/modal-residue';
const CONTENT_TAGS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,figcaption,blockquote,pre,th,td';
const MODAL_MARKER = /(?:^|[-_\s])(?:modal|popup|pop|layerpop|layer-popup)(?:$|[-_\s])/iu;
const CLOSE_COPY = /(?:오늘\s*하루|오늘은\s*그만|하루\s*동안|다시\s*보지|안\s*열기|열지\s*않|닫기|창\s*닫기|close|do\s*not\s*show|don['’]?t\s*show)/iu;
const CLOSE_ONLY = /^(?:(?:오늘\s*하루(?:\s*동안)?\s*(?:보지\s*않기|안\s*열기|열지\s*않기)|오늘은\s*그만\s*볼래요|다시\s*보지\s*않기|창을?\s*열지\s*않습니다?)[\s·|/\[\](){}.,:;!?-]*)?(?:닫기|창\s*닫기|close|[×✕x])?$/iu;

interface RemovedDetail {
  selector: string;
  reason: 'explicit_close' | 'dim_backdrop';
}

interface CorpusDocumentRecord {
  sourceUrl: string;
  finalUrl: string;
  postModalDomFile: string;
  removedDetails?: RemovedDetail[];
}

interface CorpusSiteRecord {
  target: { market: 'KR' | 'US'; url: string };
  status: 'success' | 'failure';
  artifact?: CrawlArtifactPayload;
  documents: CorpusDocumentRecord[];
}

interface CorpusManifest {
  siteFiles: string[];
  excluded: Array<{
    scope: 'site' | 'page';
    siteId: string;
    sourceUrl: string;
  }>;
}

interface GroundTruthBlock {
  siteId: string;
  sourceUrl: string;
  finalUrl: string;
  selector: string;
  candidateSelector: string;
  tagName: string;
  text: string;
  kind: 'close-copy' | 'panel-body';
  descendantPaths: string[];
  candidateDescendantPaths: string[];
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function normalizedUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString();
}

function markerFor(element: HTMLElement): string {
  return normalizeText([
    element.getAttribute('class') ?? '',
    element.getAttribute('id') ?? '',
  ].join(' '));
}

function isModalCandidate(element: HTMLElement): boolean {
  return element.tagName === 'DIALOG'
    || element.getAttribute('role') === 'dialog'
    || element.getAttribute('aria-modal') === 'true'
    || MODAL_MARKER.test(markerFor(element));
}

function exactElementPath(element: HTMLElement): string {
  const segments: string[] = [];
  let current: Node | null = element;
  while (current && current.nodeType === NodeType.ELEMENT_NODE) {
    const item = current as HTMLElement;
    if (!item.tagName) break;
    const id = item.getAttribute('id');
    if (id) {
      segments.unshift(`${item.tagName.toLocaleLowerCase('en-US')}#${id}`);
      break;
    }
    const parent = item.parentNode;
    const siblingIndex = parent
      ? parent.childNodes.filter((node) => (
        node.nodeType === NodeType.ELEMENT_NODE
        && (node as HTMLElement).tagName === item.tagName
      )).indexOf(item)
      : 0;
    segments.unshift(
      `${item.tagName.toLocaleLowerCase('en-US')}:nth-of-type(${siblingIndex + 1})`,
    );
    current = parent;
  }
  return segments.join('>');
}

function elementAndDescendantPaths(element: HTMLElement): string[] {
  return [element, ...element.querySelectorAll('*')].map(exactElementPath);
}

function residueBlocks(candidate: HTMLElement): HTMLElement[] {
  const blocks = candidate.querySelectorAll(CONTENT_TAGS);
  return blocks.length > 0 ? blocks : [candidate];
}

function isCloseOnly(text: string): boolean {
  const withoutBrackets = text.replace(/^[\s\[({]+|[\s\])}]+$/gu, '').trim();
  return withoutBrackets.length <= 80 && CLOSE_ONLY.test(withoutBrackets);
}

/** Independent copy of the pre-change CRAWL-ACCESS measurement rule. */
function measuredResidue(input: {
  siteId: string;
  document: CorpusDocumentRecord;
  html: string;
}): GroundTruthBlock[] {
  if ((input.document.removedDetails?.length ?? 0) === 0) return [];
  const root = parse(input.html);
  root.querySelectorAll('script,style,noscript,template,svg,canvas').forEach((node) => node.remove());
  const candidates = root.querySelectorAll('body *').filter(isModalCandidate);
  const candidateSet = new Set(candidates);
  const outermost = candidates.filter((candidate) => {
    let ancestor = candidate.parentNode;
    while (ancestor && ancestor.nodeType === NodeType.ELEMENT_NODE) {
      if (candidateSet.has(ancestor as HTMLElement)) return false;
      ancestor = ancestor.parentNode;
    }
    return true;
  });
  const result: GroundTruthBlock[] = [];
  const seenBlocks = new Set<HTMLElement>();
  for (const candidate of outermost) {
    const candidateText = normalizeText(candidate.text);
    const hasCloseSignal = CLOSE_COPY.test(candidateText)
      || candidate.querySelectorAll('button,a,[role="button"]').some((control) => (
        CLOSE_COPY.test(normalizeText(control.text))
        || CLOSE_COPY.test(control.getAttribute('aria-label') ?? '')
        || CLOSE_COPY.test(control.getAttribute('title') ?? '')
      ));
    if (!hasCloseSignal && !MODAL_MARKER.test(markerFor(candidate))) continue;
    const candidateDescendantPaths = elementAndDescendantPaths(candidate);
    for (const block of residueBlocks(candidate)) {
      if (seenBlocks.has(block)) continue;
      seenBlocks.add(block);
      if (block.closest('nav,[role="navigation"]')) continue;
      const text = normalizeText(block.text);
      if (!text) continue;
      result.push({
        siteId: input.siteId,
        sourceUrl: input.document.sourceUrl,
        finalUrl: input.document.finalUrl,
        selector: exactElementPath(block),
        candidateSelector: exactElementPath(candidate),
        tagName: block.tagName.toLocaleLowerCase('en-US'),
        text,
        kind: isCloseOnly(text) ? 'close-copy' : 'panel-body',
        descendantPaths: elementAndDescendantPaths(block),
        candidateDescendantPaths,
      });
    }
  }
  return result;
}

function siteIdFor(file: string): string {
  return file.split('/')[1] ?? '';
}

function profileFor(record: CorpusSiteRecord): ClinicEngineProfile {
  return record.target.market === 'KR'
    ? KO_MEDICAL_IMPORT_PROFILE
    : US_MEDICAL_OUTREACH_PROFILE;
}

async function readGzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

function blockSummary(block: RobustClinicSourceBlock, finalUrl: string) {
  return {
    sourceUrl: block.sourceUrl,
    finalUrl,
    selector: block.sourceElementPath,
    text: block.text,
    evidence: block.overlayUiChromeEvidence,
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(CORPUS_ROOT, 'manifest.json'), 'utf8'),
  ) as CorpusManifest;
  const excludedSites = new Set(manifest.excluded
    .filter((entry) => entry.scope === 'site')
    .map((entry) => entry.siteId));
  const excludedPages = new Map<string, Set<string>>();
  for (const entry of manifest.excluded.filter((candidate) => candidate.scope === 'page')) {
    const values = excludedPages.get(entry.siteId) ?? new Set<string>();
    values.add(normalizedUrl(entry.sourceUrl));
    excludedPages.set(entry.siteId, values);
  }
  const groundTruth: GroundTruthBlock[] = [];
  const classified: Array<ReturnType<typeof blockSummary> & { siteId: string }> = [];
  const beforeBlocks: Array<ReturnType<typeof blockSummary> & { siteId: string }> = [];
  const remaining: Array<ReturnType<typeof blockSummary> & { siteId: string }> = [];
  const sites = [];
  const captureConfigs = [];
  let unexpectedRemovedSourceBlockCount = 0;
  let unexpectedAddedSourceBlockCount = 0;

  for (const file of manifest.siteFiles) {
    const siteId = siteIdFor(file);
    if (excludedSites.has(siteId)) continue;
    const record = await readGzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success' || !record.artifact) continue;
    const pageExclusions = excludedPages.get(siteId) ?? new Set<string>();
    const artifact = {
      ...record.artifact,
      pages: record.artifact.pages.filter((page) => !pageExclusions.has(normalizedUrl(page.url))),
    };
    const documents: RobustClinicDocument[] = [];
    const beforeDocuments: RobustClinicDocument[] = [];
    const siteGround: GroundTruthBlock[] = [];
    for (const document of record.documents) {
      if (
        pageExclusions.has(normalizedUrl(document.sourceUrl))
        || pageExclusions.has(normalizedUrl(document.finalUrl))
      ) continue;
      const html = gunzipSync(
        await readFile(path.join(CORPUS_ROOT, document.postModalDomFile)),
      ).toString('utf8');
      const shared = { sourceUrl: document.sourceUrl, finalUrl: document.finalUrl, html };
      beforeDocuments.push(shared);
      documents.push({
        ...shared,
        ...(document.removedDetails
          ? { overlayRemovalEvidence: document.removedDetails }
          : {}),
      });
      siteGround.push(...measuredResidue({ siteId, document, html }));
    }
    const beforePlan = extractRobustClinicSource({
      artifact,
      documents: beforeDocuments,
      profile: profileFor(record),
    });
    const plan = extractRobustClinicSource({
      artifact,
      documents,
      profile: profileFor(record),
    });
    const finalUrlByBlockId = new Map<string, string>();
    for (const page of plan.pages) {
      page.blocks.forEach((block) => finalUrlByBlockId.set(block.id, page.finalUrl));
    }
    const beforeFinalUrlByBlockId = new Map<string, string>();
    for (const page of beforePlan.pages) {
      page.blocks.forEach((block) => beforeFinalUrlByBlockId.set(block.id, page.finalUrl));
    }
    const siteClassified = plan.excludedBlocks.filter(
      (block) => block.exclusion === 'overlay-ui-chrome',
    );
    const beforeTargetIds = new Set(beforePlan.targetBlocks.map((block) => block.id));
    const afterTargetIds = new Set(plan.targetBlocks.map((block) => block.id));
    const classifiedIds = new Set(siteClassified.map((block) => block.id));
    const unexpectedRemoved = beforePlan.targetBlocks.filter((block) => (
      !afterTargetIds.has(block.id) && !classifiedIds.has(block.id)
    ));
    const unexpectedAdded = plan.targetBlocks.filter((block) => !beforeTargetIds.has(block.id));
    unexpectedRemovedSourceBlockCount += unexpectedRemoved.length;
    unexpectedAddedSourceBlockCount += unexpectedAdded.length;
    const candidatePathsByPage = new Map<string, Set<string>>();
    for (const block of siteGround) {
      const key = normalizedUrl(block.finalUrl);
      const values = candidatePathsByPage.get(key) ?? new Set<string>();
      block.candidateDescendantPaths.forEach((value) => values.add(value));
      candidatePathsByPage.set(key, values);
    }
    const siteRemaining = plan.targetBlocks.filter((block) => (
      candidatePathsByPage.get(normalizedUrl(finalUrlByBlockId.get(block.id) ?? block.sourceUrl))
        ?.has(block.sourceElementPath)
    ));
    groundTruth.push(...siteGround);
    classified.push(...siteClassified.map((block) => ({
      siteId,
      ...blockSummary(block, finalUrlByBlockId.get(block.id) ?? block.sourceUrl),
    })));
    beforeBlocks.push(...beforePlan.targetBlocks.map((block) => ({
      siteId,
      ...blockSummary(block, beforeFinalUrlByBlockId.get(block.id) ?? block.sourceUrl),
    })));
    remaining.push(...siteRemaining.map((block) => ({
      siteId,
      ...blockSummary(block, finalUrlByBlockId.get(block.id) ?? block.sourceUrl),
    })));
    if (siteGround.length > 0) {
      sites.push({
        siteId,
        seedUrl: record.target.url,
        measuredObservationCount: siteGround.length,
        uniqueExcludedSourceBlockCount: siteClassified.length,
        remainingOverlayCandidateTargetCount: siteRemaining.length,
        targetBlockCountBefore: beforePlan.targetBlocks.length,
        targetBlockCountAfter: plan.targetBlocks.length,
        unexpectedRemovedSourceBlockCount: unexpectedRemoved.length,
        unexpectedAddedSourceBlockCount: unexpectedAdded.length,
        hospitalSourceBlockSetPreserved: unexpectedRemoved.length === 0
          && unexpectedAdded.length === 0,
      });
    }
    if ([
      '020-kr-www.champodonamu.com-af4b7d7486',
      '023-kr-www.ppeum1.com-2d1e58aca0',
      '055-us-aventuradentalarts.com-3f3ee68dfd',
    ].includes(siteId)) {
      const before = compileRobustClinicArtifact({
        artifact,
        documents: beforeDocuments,
        profile: profileFor(record),
      });
      const after = compileRobustClinicArtifact({
        artifact,
        documents,
        profile: profileFor(record),
      });
      captureConfigs.push({
        siteId,
        market: record.target.market,
        before: before.config,
        after: after.config,
        audit: {
          removedOverlayBlocks: siteClassified.map((block) => ({
            id: block.id,
            text: block.text,
          })),
          preservedHospitalBlocks: plan.targetBlocks.slice(0, 24).map((block) => ({
            id: block.id,
            text: block.text,
          })),
          unexpectedRemoved: unexpectedRemoved.map((block) => ({ id: block.id, text: block.text })),
          unexpectedAdded: unexpectedAdded.map((block) => ({ id: block.id, text: block.text })),
        },
      });
    }
  }

  const pathsOverlap = (ground: GroundTruthBlock, candidate: { selector: string; text: string }) => (
    ground.descendantPaths.includes(candidate.selector)
    || (
      candidate.selector !== ground.selector
      && ground.selector.startsWith(`${candidate.selector}>`)
      && candidate.text === ground.text
    )
  );
  const classifiedBySiteAndPage = new Map<string, typeof classified>();
  for (const block of classified) {
    const key = `${block.siteId}\u0000${normalizedUrl(block.finalUrl)}`;
    const values = classifiedBySiteAndPage.get(key) ?? [];
    values.push(block);
    classifiedBySiteAndPage.set(key, values);
  }
  const missed = groundTruth.filter((ground) => {
    const candidates = classifiedBySiteAndPage.get(
      `${ground.siteId}\u0000${normalizedUrl(ground.finalUrl)}`,
    ) ?? [];
    return !candidates.some((candidate) => pathsOverlap(ground, candidate));
  });
  const groundBySiteAndPage = new Map<string, GroundTruthBlock[]>();
  for (const block of groundTruth) {
    const key = `${block.siteId}\u0000${normalizedUrl(block.finalUrl)}`;
    const values = groundBySiteAndPage.get(key) ?? [];
    values.push(block);
    groundBySiteAndPage.set(key, values);
  }
  const outside = classified.filter((candidate) => {
    const ground = groundBySiteAndPage.get(
      `${candidate.siteId}\u0000${normalizedUrl(candidate.finalUrl)}`,
    ) ?? [];
    return !ground.some((block) => pathsOverlap(block, candidate));
  });
  const beforeBySiteAndPage = new Map<string, typeof beforeBlocks>();
  for (const block of beforeBlocks) {
    const key = `${block.siteId}\u0000${normalizedUrl(block.finalUrl)}`;
    const values = beforeBySiteAndPage.get(key) ?? [];
    values.push(block);
    beforeBySiteAndPage.set(key, values);
  }
  const notPreviouslyEmitted = groundTruth.filter((ground) => {
    const blocks = beforeBySiteAndPage.get(
      `${ground.siteId}\u0000${normalizedUrl(ground.finalUrl)}`,
    ) ?? [];
    return !blocks.some((block) => pathsOverlap(ground, block));
  });
  const notPreviouslyEmittedKeys = new Set(notPreviouslyEmitted.map((block) => (
    `${block.siteId}\u0000${normalizedUrl(block.finalUrl)}\u0000${block.selector}\u0000${block.text}`
  )));
  const missedEmitted = missed.filter((block) => !notPreviouslyEmittedKeys.has(
    `${block.siteId}\u0000${normalizedUrl(block.finalUrl)}\u0000${block.selector}\u0000${block.text}`,
  ));
  const novelGroups = new Map<string, {
    siteId: string;
    text: string;
    count: number;
    sourceUrls: Set<string>;
    selectors: Set<string>;
  }>();
  for (const block of outside) {
    const key = `${block.siteId}\u0000${block.text}`;
    const group = novelGroups.get(key) ?? {
      siteId: block.siteId,
      text: block.text,
      count: 0,
      sourceUrls: new Set<string>(),
      selectors: new Set<string>(),
    };
    group.count += 1;
    group.sourceUrls.add(block.sourceUrl);
    group.selectors.add(block.selector);
    novelGroups.set(key, group);
  }
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    issuance: false,
    issuanceDatabase: null,
    corpus: {
      root: CORPUS_ROOT,
      recrawled: false,
      mutated: false,
    },
    method: {
      groundTruth: 'independent pre-change CRAWL-ACCESS DOM rule',
      classifier: 'robust-source overlay-ui-chrome exclusion',
      nestedObservationPolicy: 'a measured ancestor observation is covered by its one emitted descendant source block',
    },
    accuracy: {
      measuredObservationCount: groundTruth.length,
      previouslyEmittedObservationCount: groundTruth.length - notPreviouslyEmitted.length,
      notPreviouslyEmittedObservationCount: notPreviouslyEmitted.length,
      caughtMeasuredObservationCount: groundTruth.length - missed.length,
      recall: groundTruth.length === 0 ? 0 : (groundTruth.length - missed.length) / groundTruth.length,
      emittedObservationRecall: groundTruth.length === notPreviouslyEmitted.length
        ? 0
        : (
          groundTruth.length - notPreviouslyEmitted.length - missedEmitted.length
        ) / (groundTruth.length - notPreviouslyEmitted.length),
      outputAbsentMeasuredObservationCount: groundTruth.length - missedEmitted.length,
      missedEmittedObservationCount: missedEmitted.length,
      uniqueExcludedSourceBlockCount: classified.length,
      outsideMeasuredSetCount: outside.length,
      outsideMeasuredSetGroupCount: novelGroups.size,
      remainingOverlayCandidateTargetCount: remaining.length,
      unexpectedRemovedSourceBlockCount,
      unexpectedAddedSourceBlockCount,
    },
    missed,
    notPreviouslyEmitted,
    outsideMeasuredSet: outside,
    outsideMeasuredSetGroups: [...novelGroups.values()].map((group) => ({
      ...group,
      sourceUrls: [...group.sourceUrls].sort(),
      selectors: [...group.selectors].sort(),
    })),
    remainingOverlayCandidateTargets: remaining,
    sites,
    groundTruthBlocks: groundTruth.map((block) => ({
      siteId: block.siteId,
      sourceUrl: block.sourceUrl,
      finalUrl: block.finalUrl,
      selector: block.selector,
      candidateSelector: block.candidateSelector,
      tagName: block.tagName,
      text: block.text,
      kind: block.kind,
    })),
    classifiedBlocks: classified,
  };
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(
    path.join(OUTPUT_ROOT, 'accuracy-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    path.join(OUTPUT_ROOT, 'capture-configs.json'),
    `${JSON.stringify(captureConfigs)}\n`,
  );
  process.stdout.write(`${JSON.stringify({ accuracy: report.accuracy, sites }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
