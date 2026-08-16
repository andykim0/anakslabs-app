/**
 * Refresh the two invented non-dental artifacts through the real designated crawl.
 *
 * Serve the sources first:
 *   node scripts/fixtures/non-dental-specimens/serve.mjs scripts/fixtures/non-dental-specimens/site-ortho 8791 &
 *   node scripts/fixtures/non-dental-specimens/serve.mjs scripts/fixtures/non-dental-specimens/site-derm 8792 &
 *
 * No policy is overridden. The only substitution is the SSRF validator, which rejects loopback
 * because it guards against a user-supplied URL reaching an internal network; both ends here are
 * ours. Robots, the one-request-per-second floor, the identifiable UA and maxPages are the
 * shipped values.
 *
 * Usage: tsx scripts/recrawl-non-dental-specimens.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crawlDesignatedSite } from '@/lib/crawl/crawler-core';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';

const SEEDS = {
  'northbank-ortho': 'http://127.0.0.1:8791/',
  'larkfield-derm': 'http://127.0.0.1:8792/',
} as const;

const DIR = resolve('scripts/fixtures/non-dental-specimens');

async function main(): Promise<void> {
  for (const [name, url] of Object.entries(SEEDS)) {
    const artifact = await crawlDesignatedSite(
      { url, scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID },
      { validateUrl: async (raw: string) => new URL(raw) },
    );
    const file = `${DIR}/t0-${name}.json`;
    writeFileSync(file, JSON.stringify(artifact));
    console.log(
      `${name.padEnd(16)} pages=${artifact.pages.length}`
      + ` stopped=${artifact.stoppedReason ?? 'none'}`
      + ` robotsAllowed=${artifact.robots.crawlerAllowed}`
      + ` brand=${artifact.clinicPaletteProjection?.rawCandidates?.[0]?.hex ?? 'none'}`,
    );
    console.log(`                 → ${file}`);
  }
}

void main();
