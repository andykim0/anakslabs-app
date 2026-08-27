/**
 * THE HTML BYTE GATE.
 *
 * The config golden proves the compiled SiteConfig did not move. It does not prove the RENDERER
 * did not move — a stylesheet constant appended unconditionally, or an attribute emitted on a path
 * that was supposed to stay untouched, passes the config golden and still changes every byte a
 * practice receives. This captures the rendered server HTML instead.
 *
 * INSTRUMENT, stated plainly: this renders the real component tree the preview route renders
 * (`TenantPageContent`, the same one at `src/app/preview/[token]/[[...path]]/page.tsx`) through
 * `react-dom/server.edge`, over the real compiled config from `prepareUsMedicalPreview`. It is the
 * real renderer over a real compile. It is NOT an HTTP fetch of the route, so the route's own
 * wrapper chrome — the preview notice aside, the chrome-offset script, the audit panel — is out of
 * frame. Nothing in this change touches that wrapper, but the gate does not cover it either.
 *
 * Usage:
 *   tsx scripts/capture-clinic-html-baseline.ts --write --out /tmp/base.json   (capture)
 *   tsx scripts/capture-clinic-html-baseline.ts --against /tmp/base.json       (verify)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import { prepareUsMedicalPreview } from '@/lib/us-demo/admin-workflow';
import {
  outreachSafeExperienceFromArtifact,
  previewFullExperienceFromArtifact,
} from '@/lib/us-demo/full-preview';
import { prospectPublicSourceBlocks } from '@/lib/us-demo/source-extraction';

/** All five checked-in fixtures, across both directories, × both render modes. */
const FIXTURES = [
  ['cameods', 'us-demo-artifacts'],
  ['dental360', 'us-demo-artifacts'],
  ['iddental', 'us-demo-artifacts'],
  ['larkfield-derm', 'non-dental-specimens'],
  ['northbank-ortho', 'non-dental-specimens'],
] as const;

const RENDER_MODES = ['outreach-safe', 'preview-full'] as const;

interface HtmlEntry {
  fixture: string;
  renderMode: string;
  pageSlug: string;
  bytes: number;
  sha256: string;
}

function readArtifact(name: string, dir: string): CrawlArtifactPayload {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `scripts/fixtures/${dir}/t0-${name}.json`), 'utf8'),
  ) as CrawlArtifactPayload;
}

export function captureClinicHtml(): HtmlEntry[] {
  const entries: HtmlEntry[] = [];
  for (const [fixture, dir] of FIXTURES) {
    const artifact = readArtifact(fixture, dir);
    for (const renderMode of RENDER_MODES) {
      const prepared = prepareUsMedicalPreview({ artifact, renderMode });
      const blocks = prospectPublicSourceBlocks(artifact);
      const experience = renderMode === 'preview-full'
        ? previewFullExperienceFromArtifact({ artifact, blocks })
        : outreachSafeExperienceFromArtifact({ artifact, blocks });
      for (const page of prepared.config.pages) {
        const html = renderToStaticMarkup(
          createElement(TenantPageContent, {
            config: prepared.config,
            pageSlug: page.slug,
            interactive: renderMode === 'preview-full',
            animate: true,
            hrefForSlug: (slug: string) => (slug ? `/preview/T/${slug}` : '/preview/T'),
            clinicExperience: experience,
          }),
        );
        entries.push({
          fixture,
          renderMode,
          pageSlug: page.slug,
          bytes: Buffer.byteLength(html, 'utf8'),
          sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
        });
      }
    }
  }
  return entries;
}

function main(): void {
  const argv = process.argv;
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const captured = captureClinicHtml();
  const out = flag('--out');
  if (argv.includes('--write') && out) {
    writeFileSync(out, `${JSON.stringify(captured, null, 2)}\n`);
    console.log(`captured ${captured.length} rendered pages -> ${out}`);
    return;
  }
  const against = flag('--against');
  if (!against) throw new Error('pass --write --out <file> or --against <file>');
  const expected = JSON.parse(readFileSync(against, 'utf8')) as HtmlEntry[];
  if (expected.length !== captured.length) {
    console.error(`ENTRY COUNT MOVED: ${expected.length} -> ${captured.length}`);
    process.exitCode = 1;
    return;
  }
  let moved = 0;
  for (const [index, want] of expected.entries()) {
    const got = captured[index];
    const key = `${want.fixture} ${want.renderMode} /${want.pageSlug}`;
    if (want.sha256 !== got.sha256) {
      moved += 1;
      console.error(`MOVED ${key}: ${want.bytes}B -> ${got.bytes}B`);
    }
  }
  console.log(
    moved === 0
      ? `BYTE-IDENTICAL across ${captured.length} rendered pages `
        + `(${FIXTURES.length} fixtures x ${RENDER_MODES.length} render modes)`
      : `${moved} of ${captured.length} rendered pages moved`,
  );
  if (moved > 0) process.exitCode = 1;
}

if (process.argv[1]?.includes('capture-clinic-html-baseline')) main();
