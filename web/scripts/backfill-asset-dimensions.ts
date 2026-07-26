import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

loadEnvConfig(process.cwd());

const PAGE_SIZE = 100;

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Supabase service credentials are required.');
  return { url, key };
}

async function main() {
  const { url, key } = credentials();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let offset = 0;
  let inspected = 0;
  let updated = 0;
  let skipped = 0;
  while (true) {
    const query = await supabase
      .from('asset_records')
      .select('id,storage_bucket,storage_key,media_type,width,height')
      .eq('media_type', 'image')
      .is('width', null)
      .is('height', null)
      .not('storage_bucket', 'is', null)
      .not('storage_key', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (query.error) throw new Error(`Dimension backfill query failed: ${query.error.message}`);
    const rows = query.data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      inspected += 1;
      const download = await supabase.storage
        .from(row.storage_bucket!)
        .download(row.storage_key!);
      if (download.error || !download.data) {
        skipped += 1;
        continue;
      }
      const metadata = await sharp(Buffer.from(await download.data.arrayBuffer())).metadata();
      if (!metadata.width || !metadata.height) {
        skipped += 1;
        continue;
      }
      const result = await supabase.rpc('set_asset_raster_dimensions_once', {
        p_asset_id: row.id,
        p_width: metadata.width,
        p_height: metadata.height,
      });
      if (result.error) throw new Error(`Dimension backfill update failed: ${result.error.message}`);
      if (result.data === true) updated += 1;
    }
    if (rows.length < PAGE_SIZE) break;
    offset += rows.length;
  }
  process.stdout.write(`${JSON.stringify({ inspected, updated, skipped }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
