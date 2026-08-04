import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Module from 'node:module';
import path from 'node:path';

const inputFileEnv = process.env.REBUILD_PUBLISH_CONFIGS;
const outputFileEnv = process.env.REBUILD_PUBLISH_REPORT;
const baselineReportFile = process.env.REBUILD_PUBLISH_BASELINE_REPORT;
if (!inputFileEnv || !outputFileEnv) {
  throw new Error('REBUILD_PUBLISH_CONFIGS and REBUILD_PUBLISH_REPORT are required.');
}
const inputFile: string = inputFileEnv;
const outputFile: string = outputFileEnv;

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleInternals = Module as unknown as { _load: ModuleLoader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function loadForServerDriver(
  request: string,
  parent: unknown,
  isMain: boolean,
): unknown {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, parent, isMain);
};

interface CorpusConfigRow {
  siteId: string;
  compileStatus: 'success' | 'failure';
  config?: unknown;
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function main(): Promise<void> {
  const [{ preflightScan }, { checkPublish }] = await Promise.all([
    import('@/lib/scan/preflight'),
    import('@/lib/publish/preflight'),
  ]);
  const rows = JSON.parse(await readFile(inputFile, 'utf8')) as CorpusConfigRow[];
  const blockerCodes: Record<string, number> = {};
  const issueCodes: Record<string, number> = {};
  const sites: Array<{
    siteId: string;
    pageCount: number;
    publishable: boolean;
    policyPublishable: boolean;
    blockers: Record<string, number>;
    issues: string[];
    scores: { seo: number; aeo: number; geo: number; total: number };
  }> = [];

  for (const row of rows) {
    if (row.compileStatus !== 'success' || !row.config) continue;
    const config = row.config as Parameters<typeof preflightScan>[0];
    const scan = preflightScan(config, {
      tier: 'basic',
      siteUrl: `https://${row.siteId}.audit.invalid`,
    });
    const publish = checkPublish(config, 'basic', {
      scan: { total: scan.scores.total, grade: scan.grade },
      artifact: scan.publishAudit,
    });
    const siteBlockers: Record<string, number> = {};
    for (const blocker of scan.publishAudit.blockers) {
      increment(blockerCodes, blocker.code);
      increment(siteBlockers, blocker.code);
    }
    for (const issue of scan.issues) increment(issueCodes, issue.code);
    sites.push({
      siteId: row.siteId,
      pageCount: config.pages.length,
      publishable: scan.publishAudit.blockers.length === 0,
      policyPublishable: publish.ok,
      blockers: siteBlockers,
      issues: scan.issues.map((issue) => issue.code).sort(),
      scores: scan.scores,
    });
  }

  const baselineSites = baselineReportFile
    ? (JSON.parse(await readFile(baselineReportFile, 'utf8')) as {
        sites?: Array<{
          siteId: string;
          scores: { seo: number; aeo: number; geo: number; total: number };
        }>;
      }).sites ?? []
    : [];
  const baselineBySite = new Map(baselineSites.map((site) => [site.siteId, site.scores]));
  const measuredSites = sites.map((site) => {
    const baseline = baselineBySite.get(site.siteId);
    return {
      ...site,
      ...(baseline
        ? {
            scoreDelta: {
              seo: site.scores.seo - baseline.seo,
              aeo: site.scores.aeo - baseline.aeo,
              geo: site.scores.geo - baseline.geo,
              total: site.scores.total - baseline.total,
            },
          }
        : {}),
    };
  });
  const report = {
    siteCount: sites.length,
    pageCount: sites.reduce((sum, site) => sum + site.pageCount, 0),
    publishableSites: sites.filter((site) => site.publishable).length,
    blockedSites: sites.filter((site) => !site.publishable).length,
    policyPublishableSites: sites.filter((site) => site.policyPublishable).length,
    blockerCodes,
    issueCodes,
    averageScores: {
      seo: mean(sites.map((site) => site.scores.seo)),
      aeo: mean(sites.map((site) => site.scores.aeo)),
      geo: mean(sites.map((site) => site.scores.geo)),
      total: mean(sites.map((site) => site.scores.total)),
    },
    sites: measuredSites,
  };
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ...report,
    sites: undefined,
  }, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
