import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeType, parse, type HTMLElement, type Node } from 'node-html-parser';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const OUTPUT_ROOT = '/private/tmp/crawl-access';
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
  documents: CorpusDocumentRecord[];
}

interface CorpusManifest {
  siteFiles: string[];
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function markerFor(element: HTMLElement): string {
  return normalizeText([
    element.getAttribute('class') ?? '',
    element.getAttribute('id') ?? '',
  ].join(' '));
}

function isModalCandidate(element: HTMLElement): boolean {
  const semantic = element.tagName === 'DIALOG'
    || element.getAttribute('role') === 'dialog'
    || element.getAttribute('aria-modal') === 'true';
  return semantic || MODAL_MARKER.test(markerFor(element));
}

function elementPath(element: HTMLElement): string {
  const segments: string[] = [];
  let current: Node | null = element;
  while (current && current.nodeType === NodeType.ELEMENT_NODE && segments.length < 6) {
    const item = current as HTMLElement;
    const id = item.getAttribute('id');
    if (id) {
      segments.unshift(`${item.tagName.toLocaleLowerCase('en-US')}#${id}`);
      break;
    }
    const className = (item.getAttribute('class') ?? '').trim().split(/\s+/u).filter(Boolean)[0];
    segments.unshift(`${item.tagName.toLocaleLowerCase('en-US')}${className ? `.${className}` : ''}`);
    current = item.parentNode;
  }
  return segments.join('>');
}

function residueBlocks(candidate: HTMLElement): HTMLElement[] {
  const blocks = candidate.querySelectorAll(CONTENT_TAGS);
  if (blocks.length > 0) return blocks;
  return [candidate];
}

function isCloseOnly(text: string): boolean {
  const withoutBrackets = text.replace(/^[\s\[({]+|[\s\])}]+$/gu, '').trim();
  return withoutBrackets.length <= 80 && CLOSE_ONLY.test(withoutBrackets);
}

function siteIdFor(file: string): string {
  return file.split('/')[1] ?? '';
}

async function readGzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(CORPUS_ROOT, 'manifest.json'), 'utf8'),
  ) as CorpusManifest;
  const sites = [];
  for (const file of manifest.siteFiles) {
    const record = await readGzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success') continue;
    let closeCopyBlockCount = 0;
    let panelBodyBlockCount = 0;
    let affectedDocumentCount = 0;
    const representatives: Array<{
      sourceUrl: string;
      kind: 'close-copy' | 'panel-body';
      selector: string;
      text: string;
    }> = [];
    for (const document of record.documents) {
      if ((document.removedDetails?.length ?? 0) === 0) continue;
      const html = gunzipSync(
        await readFile(path.join(CORPUS_ROOT, document.postModalDomFile)),
      ).toString('utf8');
      const root = parse(html);
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
      let documentHasResidue = false;
      const seenBlocks = new Set<HTMLElement>();
      for (const candidate of outermost) {
        const candidateText = normalizeText(candidate.text);
        const hasCloseSignal = CLOSE_COPY.test(candidateText)
          || candidate.querySelectorAll('button,a,[role="button"]').some((control) => (
            CLOSE_COPY.test(normalizeText(control.text))
            || CLOSE_COPY.test(control.getAttribute('aria-label') ?? '')
            || CLOSE_COPY.test(control.getAttribute('title') ?? '')
          ));
        // A semantic/marked panel on a document with recorded modal removal remains relevant even
        // when the close control itself was the removed node.
        if (!hasCloseSignal && !MODAL_MARKER.test(markerFor(candidate))) continue;
        for (const block of residueBlocks(candidate)) {
          if (seenBlocks.has(block)) continue;
          seenBlocks.add(block);
          if (block.closest('nav,[role="navigation"]')) continue;
          const text = normalizeText(block.text);
          if (!text) continue;
          documentHasResidue = true;
          const kind = isCloseOnly(text) ? 'close-copy' as const : 'panel-body' as const;
          if (kind === 'close-copy') closeCopyBlockCount += 1;
          else panelBodyBlockCount += 1;
          if (representatives.filter((entry) => entry.kind === kind).length < 5) {
            representatives.push({
              sourceUrl: document.sourceUrl,
              kind,
              selector: elementPath(block),
              text: text.slice(0, 500),
            });
          }
        }
      }
      if (documentHasResidue) affectedDocumentCount += 1;
    }
    if (closeCopyBlockCount > 0 || panelBodyBlockCount > 0) {
      sites.push({
        siteId: siteIdFor(file),
        market: record.target.market,
        seedUrl: record.target.url,
        affectedDocumentCount,
        closeCopyBlockCount,
        panelBodyBlockCount,
        totalModalResidueBlockCount: closeCopyBlockCount + panelBodyBlockCount,
        representatives,
      });
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    method: {
      corpus: 'post-modal DOM documents with non-empty removedDetails',
      candidate: 'semantic dialog/aria-modal or modal/popup marker after removal',
      correctionApplied: false,
    },
    totals: {
      siteCount: sites.length,
      affectedDocumentCount: sites.reduce((sum, site) => sum + site.affectedDocumentCount, 0),
      closeCopyBlockCount: sites.reduce((sum, site) => sum + site.closeCopyBlockCount, 0),
      panelBodyBlockCount: sites.reduce((sum, site) => sum + site.panelBodyBlockCount, 0),
      totalModalResidueBlockCount: sites.reduce(
        (sum, site) => sum + site.totalModalResidueBlockCount,
        0,
      ),
    },
    sites,
  };
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(
    path.join(OUTPUT_ROOT, 'modal-residue-analysis.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report.totals, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
