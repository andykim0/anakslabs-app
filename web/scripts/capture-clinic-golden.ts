/**
 * Capture the full compiled output of every dental fixture, so that widening the engine to other
 * specialties can be proved not to have moved dental by a single byte.
 *
 * Captured on pristine main before the specialty parameter existed. Regenerating it is how you
 * declare "dental output is allowed to change", so it is a deliberate, reviewable act:
 *
 *   npx tsx scripts/capture-clinic-golden.ts --write
 *
 * Without --write it verifies instead, and prints the first differing JSON path.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CrawlArtifactPayload } from '../src/lib/crawl/contracts';
import { buildJsonLd } from '../src/lib/seo/jsonld';
import { prepareUsMedicalPreview } from '../src/lib/us-demo/admin-workflow';
import type { UsDemoRenderMode } from '../src/lib/us-demo/contracts';

/** The three real dental practices the US corpus was built from. */
export const DENTAL_GOLDEN_FIXTURES = ['cameods', 'dental360', 'iddental'] as const;
export const DENTAL_GOLDEN_RENDER_MODES = ['outreach-safe', 'preview-full'] as const;

export const DENTAL_GOLDEN_PATH = resolve(
  process.cwd(),
  'scripts/fixtures/clinic-golden/dental-golden.json',
);

function artifactFor(name: string): CrawlArtifactPayload {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `scripts/fixtures/us-demo-artifacts/t0-${name}.json`),
      'utf8',
    ),
  ) as CrawlArtifactPayload;
}

/**
 * Key-sorted stringify. The compile builds objects by spreading, so a refactor can reorder keys
 * without changing meaning; sorting means the golden catches value changes rather than key order.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export interface DentalGoldenEntry {
  fixture: string;
  renderMode: UsDemoRenderMode;
  deliverable: boolean;
  deliveryBlockers: unknown;
  sourceReport: unknown;
  /** Page slug -> JSON-LD nodes. This is where the schema.org @type is pinned. */
  jsonLd: Record<string, unknown>;
  config: unknown;
  sha256: string;
}

export function captureDentalGolden(): DentalGoldenEntry[] {
  const entries: DentalGoldenEntry[] = [];
  for (const fixture of DENTAL_GOLDEN_FIXTURES) {
    for (const renderMode of DENTAL_GOLDEN_RENDER_MODES) {
      const prepared = prepareUsMedicalPreview({
        artifact: artifactFor(fixture),
        renderMode,
      });
      const jsonLd: Record<string, unknown> = {};
      for (const page of prepared.config.pages) {
        jsonLd[page.slug] = canonical(
          buildJsonLd(prepared.config, 'https://golden.invalid', page.slug),
        );
      }
      const body = {
        fixture,
        renderMode,
        deliverable: prepared.deliverable,
        deliveryBlockers: canonical(prepared.deliveryBlockers),
        sourceReport: canonical(prepared.sourceReport),
        jsonLd,
        config: canonical(prepared.config),
      };
      entries.push({
        ...body,
        sha256: createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex'),
      });
    }
  }
  return entries;
}

export function readDentalGolden(): DentalGoldenEntry[] {
  return JSON.parse(readFileSync(DENTAL_GOLDEN_PATH, 'utf8')) as DentalGoldenEntry[];
}

/** First differing path, so a failure names the field instead of dumping two megabytes of JSON. */
export function firstDifference(
  expected: unknown,
  actual: unknown,
  path = '$',
): string | null {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return null;
  if (
    !expected || !actual
    || typeof expected !== 'object' || typeof actual !== 'object'
    || Array.isArray(expected) !== Array.isArray(actual)
  ) {
    return `${path}: ${JSON.stringify(expected)?.slice(0, 220)} -> ${JSON.stringify(actual)?.slice(0, 220)}`;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return `${path}: length ${expected.length} -> ${actual.length}`;
    }
    for (const [index, item] of expected.entries()) {
      const diff = firstDifference(item, actual[index], `${path}[${index}]`);
      if (diff) return diff;
    }
    return null;
  }
  const left = expected as Record<string, unknown>;
  const right = actual as Record<string, unknown>;
  for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
    const diff = firstDifference(left[key], right[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const captured = captureDentalGolden();
  if (process.argv.includes('--write')) {
    writeFileSync(DENTAL_GOLDEN_PATH, `${JSON.stringify(captured, null, 2)}\n`, 'utf8');
    console.log(`wrote ${captured.length} entries to ${DENTAL_GOLDEN_PATH}`);
    for (const entry of captured) {
      console.log(`  ${entry.fixture} ${entry.renderMode} ${entry.sha256}`);
    }
  } else {
    const golden = readDentalGolden();
    let failed = 0;
    for (const [index, entry] of captured.entries()) {
      const expected = golden[index];
      const same = expected?.sha256 === entry.sha256;
      console.log(`${same ? 'OK  ' : 'DIFF'} ${entry.fixture} ${entry.renderMode} ${entry.sha256}`);
      if (!same) {
        failed += 1;
        console.log(`     ${firstDifference(expected, entry) ?? '(hash only)'}`);
      }
    }
    process.exitCode = failed === 0 ? 0 : 1;
  }
}
