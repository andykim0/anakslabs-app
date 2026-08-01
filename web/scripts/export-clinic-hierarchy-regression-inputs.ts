import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';
import type { SiteConfig } from '@/lib/types/site';

const US_ARTIFACT = process.env.CLINIC_HIERARCHY_US_ARTIFACT
  ?? '/private/tmp/clinic-B-artifact.json';
const KO_CONFIG = process.env.CLINIC_HIERARCHY_KO_CONFIG
  ?? '/private/tmp/engine-merge/final-ko/site-config.json';
const OUTPUT = process.env.CLINIC_HIERARCHY_REGRESSION_INPUT
  ?? '/private/tmp/clinic-hierarchy/regression-input.json';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function main(): Promise<void> {
  const artifact = JSON.parse(await readFile(US_ARTIFACT, 'utf8')) as CrawlArtifactPayload;
  const ko = JSON.parse(await readFile(KO_CONFIG, 'utf8')) as SiteConfig;
  const us = (['outreach-safe', 'preview-full'] as const).map((renderMode) => {
    const output = compileUsMedicalDemo(artifact, { renderMode });
    return {
      renderMode,
      outputSha256: sha256(output),
      configSha256: sha256(output.config),
      manifestSha256: sha256(output.sourceManifest),
      config: output.config,
    };
  });
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify({ version: 1, us, ko }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    output: OUTPUT,
    us: us.map((entry) => ({
      renderMode: entry.renderMode,
      outputSha256: entry.outputSha256,
      configSha256: entry.configSha256,
      manifestSha256: entry.manifestSha256,
      pages: entry.config.pages.length,
    })),
    koPages: ko.pages.length,
    koConfigSha256: sha256(ko),
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
