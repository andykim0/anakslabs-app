/**
 * Refresh the three committed US demo artifacts through the real designated crawl.
 *
 * No policy is overridden: robots is honoured, the one-request-per-second floor and the
 * identifiable UA come from the crawler itself, and maxPages stays at DESIGNATED_CRAWL_POLICY's
 * twenty. The only reason to re-run this is a contract change that the artifacts have to carry —
 * the palette candidate list was the first.
 *
 * Usage: tsx scripts/recrawl-us-demo-fixtures.ts [--prefix t0] [--dir scripts/fixtures/us-demo-artifacts]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crawlDesignatedSite } from '@/lib/crawl/crawler-core';
import { assertPublicHttpUrl } from '@/lib/scan/ssrf';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';

/** The exact seed URLs the committed base-*.json artifacts were crawled from. */
const SEEDS = {
  dental360: 'https://dental360grp.com/',
  cameods: 'https://cameods.com/oral-surgeon-chicago-il-locations/west-loop-location/',
  iddental: 'https://iddentalimplant.com',
} as const;

function arg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const dir = resolve(arg('--dir', 'scripts/fixtures/us-demo-artifacts'));
const prefix = arg('--prefix', 't0');

async function main(): Promise<void> {
  for (const [name, url] of Object.entries(SEEDS)) {
    // The production wrapper in crawler.ts is `server-only`; it supplies exactly this validator
    // on top of the same core, so passing it here runs the designated crawl unchanged.
    const artifact = await crawlDesignatedSite({
      url,
      scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID,
    }, { validateUrl: assertPublicHttpUrl });
    const file = `${dir}/${prefix}-${name}.json`;
    writeFileSync(file, JSON.stringify(artifact));
    const projection = artifact.clinicPaletteProjection;
    console.log(
      `${name.padEnd(11)} pages=${artifact.pages.length} stopped=${artifact.stoppedReason}`
      + ` robotsAllowed=${artifact.robots.crawlerAllowed}`
      + ` kind=${projection?.kind ?? 'none'} preset=${projection?.accentPreset ?? 'none'}`
      + ` candidates=${(projection?.rawCandidates ?? []).map((c) => `${c.origin}:${c.hex}`).join(',') || 'none'}`,
    );
    console.log(`             → ${file}`);
  }
}

void main();
