import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('고객 자산 증빙 저장 배선', () => {
  const route = source('src/app/api/uploads/route.ts');
  const storage = source('src/lib/data/supabase/storage.ts');
  const registry = source('src/lib/uploads/asset-registry.ts');
  const migration = source('../supabase/migrations/0009_motion_asset_provenance.sql');

  test('일반 업로드 URL 계약을 유지하고 before-after에서만 assetId를 추가한다', () => {
    assert.match(route, /beforeAfterMode = formText\(form, 'mode'\) === 'before-after'/);
    assert.match(route, /return NextResponse\.json\(\{ url \}, \{ status: 201 \}\)/);
    assert.match(route, /assetId: asset\.id/);
    assert.match(route, /BEFORE_AFTER_RASTER_ONLY/);
    assert.match(route, /MEDICAL_BEFORE_AFTER_DISABLED/);
    assert.match(route, /legalReviewRequired: true/);
    assert.ok(
      route.indexOf("'MEDICAL_BEFORE_AFTER_DISABLED'") < route.indexOf('file.arrayBuffer()'),
      '의료 맥락은 파일 읽기·저장 전에 즉시 차단해야 한다',
    );
  });

  test('기존 storage string API는 detailed object path API 위에 호환 유지된다', () => {
    assert.match(storage, /export async function uploadClientAssetDetailed/);
    assert.match(storage, /return \{ objectPath: path, url:/);
    assert.match(storage, /return \(await uploadClientAssetDetailed\(input\)\)\.url/);
  });

  test('DB와 mock 모두 source/AI 플래그를 서버에서 고정하고 URL 조회 API가 없다', () => {
    assert.match(registry, /source: 'customer-upload'/);
    assert.match(registry, /ai_generated: false/);
    assert.match(registry, /generative_edited: false/);
    assert.doesNotMatch(registry, /getByPublicUrl|eq\('public_url'/);
    assert.match(migration, /check \(source = 'customer-upload'\)/);
    assert.match(migration, /check \(ai_generated = false\)/);
    assert.match(migration, /check \(generative_edited = false\)/);
  });

  test('RLS는 client_id=auth.uid이고 site/client 결합은 DB trigger로도 강제한다', () => {
    assert.match(migration, /using \(client_id = auth\.uid\(\)\)/);
    assert.match(migration, /guard_motion_asset_site_owner/);
    assert.match(migration, /s\.id = new\.site_id[\s\S]*s\.client_id = new\.client_id/);
    assert.match(migration, /grant select on table public\.motion_asset_provenance to authenticated/);
  });
});
