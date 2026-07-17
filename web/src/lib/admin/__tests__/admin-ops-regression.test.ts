import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { formatDate, formatDateTime } from '@/components/admin/format';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function sourceFiles(path: string): string[] {
  const absolute = join(process.cwd(), path);
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute).flatMap((entry) => sourceFiles(join(path, entry)));
}

const ADMIN_PAGE_ROOT = 'src/app/(admin)/admin';

const ADMIN_PAGES = [
  `${ADMIN_PAGE_ROOT}/page.tsx`,
  `${ADMIN_PAGE_ROOT}/video-queue/page.tsx`,
  `${ADMIN_PAGE_ROOT}/subscriptions/page.tsx`,
  `${ADMIN_PAGE_ROOT}/edit-queue/page.tsx`,
] as const;

const GUARDED_ROUTES = [
  {
    path: 'src/app/api/admin/video-queue/route.ts',
    markers: ['getDataServices()', 'getHeroVideoFulfillmentRepository()'],
  },
  {
    path: 'src/app/api/admin/video-queue/[siteId]/complete/route.ts',
    markers: [
      'await parseBody(',
      'assetProvenanceConfig()',
      'getDataServices()',
      'getHeroVideoFulfillmentRepository()',
      'await resolveOwnedAssetRecords(',
      'await repository.complete(',
    ],
  },
  {
    path: 'src/app/api/admin/subscriptions/route.ts',
    markers: [
      'getDataServices()',
      'getMonthlyReportsRepository()',
      'listSiteSubscriptionsForAdmin(now)',
    ],
  },
  {
    path: 'src/app/api/admin/reports/retry/route.ts',
    markers: ['await parseBody(', 'await retryMonthlyReport('],
  },
  {
    path: 'src/app/api/admin/edit-queue/route.ts',
    markers: [
      'getAdminEditQueueRepository()',
      'getDataServices()',
      'repository.listNonterminal()',
    ],
  },
  {
    path: 'src/app/api/admin/edit-queue/[id]/complete/route.ts',
    markers: ['await parseBody(', 'await params', 'getAdminEditQueueRepository().complete('],
  },
  {
    path: 'src/app/api/admin/overview/route.ts',
    markers: ['getDataServices()', 'getManualCollectionsRepository().listAll()', 'buildAdminOpsRevenueMetrics(paymentList,'],
  },
  {
    path: 'src/app/api/admin/payments/manual/route.ts',
    markers: ['await parseBody(', 'getDataServices()', 'getManualCollectionsRepository().record('],
  },
  {
    path: 'src/app/api/admin/payments/manual/[entryId]/reverse/route.ts',
    markers: ['await parseBody(', 'await params', 'getManualCollectionsRepository().reverse('],
  },
] as const;

function assertGuardBeforeOperationalCalls(input: {
  path: string;
  markers: readonly string[];
}): void {
  assert.equal(existsSync(join(process.cwd(), input.path)), true, `${input.path} must exist`);
  const source = read(input.path);
  const handlerStart = source.search(/export const (?:GET|POST)\s*=/);
  assert.notEqual(handlerStart, -1, `${input.path} must export a route handler`);
  const handler = source.slice(handlerStart);
  const guardAt = handler.indexOf('await requireAdminOr403()');
  const denialAt = handler.indexOf('if (forbidden) return forbidden');
  assert.ok(guardAt >= 0, `${input.path} must call requireAdminOr403`);
  assert.ok(denialAt > guardAt, `${input.path} must return the forbidden response immediately`);

  for (const marker of input.markers) {
    const operationAt = handler.indexOf(marker);
    assert.ok(operationAt >= 0, `${input.path} is missing audited operation: ${marker}`);
    assert.ok(
      denialAt < operationAt,
      `${input.path} must reject non-admins before operational call: ${marker}`,
    );
  }
}

describe('ADM5 admin operations construction invariants', () => {
  test('every ADM page is under the one guarded admin layout', () => {
    const layoutPath = `${ADMIN_PAGE_ROOT}/layout.tsx`;
    assert.equal(existsSync(join(process.cwd(), layoutPath)), true);
    const layout = read(layoutPath);
    const adminCheckAt = layout.indexOf('const admin = await isAdmin()');
    const redirectAt = layout.indexOf("if (!admin) redirect('/login')");
    assert.ok(adminCheckAt >= 0, 'the shared admin layout must resolve server-side admin status');
    assert.ok(redirectAt > adminCheckAt, 'non-admins must be redirected before rendering children');
    assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);

    for (const page of ADMIN_PAGES) {
      assert.equal(existsSync(join(process.cwd(), page)), true, `${page} must exist`);
      const publicPath = page
        .replace(`${ADMIN_PAGE_ROOT}/`, 'src/app/admin/')
        .replace(`${ADMIN_PAGE_ROOT}`, 'src/app/admin');
      assert.equal(
        existsSync(join(process.cwd(), publicPath)),
        false,
        `${page} must not have an unguarded duplicate outside the route group`,
      );
    }
  });

  test('every ADM read and approved mutation is admin-guarded before data access', () => {
    for (const route of GUARDED_ROUTES) assertGuardBeforeOperationalCalls(route);
  });

  test('the shared admin navigation exposes every operations queue and status board', () => {
    const shell = read('src/components/admin/admin-shell.tsx');
    for (const item of [
      { href: '/admin/video-queue', label: '영상 이행' },
      { href: '/admin/subscriptions', label: '구독·리포트' },
      { href: '/admin/edit-queue', label: '수정 대행' },
    ]) {
      const declaration = `{ href: '${item.href}', label: '${item.label}'`;
      assert.equal(
        shell.split(declaration).length - 1,
        1,
        `${item.href} must appear exactly once in the shared admin navigation`,
      );
    }
  });

  test('admin surfaces derive current product prices and launch quantity from pricing.ts', () => {
    const files = [
      'src/app/(admin)',
      'src/app/api/admin',
      'src/components/admin',
      'src/lib/admin',
    ]
      .flatMap(sourceFiles)
      .filter((path) => /\.tsx?$/.test(path) && !path.includes('/__tests__/'));
    const hardcodedProductPrice =
      /(?:590_?000|390_?000|200_?000|29_?900|19_?900|590,000|390,000|200,000|29,900|19,900|59만원|39만원|20만원)/;

    for (const file of files) {
      assert.doesNotMatch(
        read(file),
        hardcodedProductPrice,
        `${file}: current product prices must be derived from PRICING`,
      );
    }

    const metrics = read('src/lib/admin/ops-metrics.ts');
    for (const source of [
      'PRICING.base.launch',
      'PRICING.base.list',
      'PRICING.videoHeroAddon',
      'LAUNCH_OFFER.limitCount',
    ]) {
      assert.ok(metrics.includes(source), `revenue metrics must consume ${source}`);
    }
    assert.ok(
      read('src/app/api/admin/subscriptions/route.ts').includes('PRICING.subscription.monthly'),
      'subscription MRR must consume PRICING.subscription.monthly',
    );
    assert.doesNotMatch(
      metrics,
      /(?:^|[^\w-])50(?:[^\w-]|$)/,
      'the launch limit must come from LAUNCH_OFFER instead of a local 50 literal',
    );
  });

  test('remote admin timestamps are rendered in explicit KST, not the browser timezone', () => {
    assert.equal(formatDate('2026-07-17T00:30:00.000Z'), '2026.07.17');
    assert.equal(formatDateTime('2026-07-17T00:30:00.000Z'), '2026.07.17 09:30 KST');
  });
});
