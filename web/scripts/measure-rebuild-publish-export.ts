import Module from 'node:module';

const siteIdEnv = process.env.REBUILD_PUBLISH_SITE_ID;
if (!siteIdEnv) throw new Error('REBUILD_PUBLISH_SITE_ID is required.');
const siteId: string = siteIdEnv;

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

async function main(): Promise<void> {
  const [{ getDataServices }, { buildExportZip }] = await Promise.all([
    import('@/lib/data'),
    import('@/lib/export/exporter'),
  ]);
  const site = await getDataServices().sites.getById(siteId);
  if (!site?.draftConfig) throw new Error('The measured site has no draft config.');
  const result = await buildExportZip({
    ...site,
    siteConfig: site.draftConfig,
  }, {
    selfHostFonts: false,
    tier: 'basic',
  });
  process.stdout.write(`${JSON.stringify({
    siteId,
    bytes: result.buffer.byteLength,
    fileCount: result.files.length,
    connectorItemCount: (result.buffer.toString('latin1').match(/data-connector-item/gu) ?? []).length,
    warnings: result.warnings,
  }, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
