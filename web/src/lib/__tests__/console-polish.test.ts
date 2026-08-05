/**
 * CONSOLE-POLISH — 파운더 콘솔 정리 5건의 회귀 가드.
 *
 *  1. 고객 대시보드는 사이트 목록/카운트 카드를 거치지 않고 유일 사이트로 직행한다.
 *  2. 관리자 셸은 좁은 화면에서 고정 사이드바를 접고 드로어로 낸다(내비 선언은 한 곳).
 *  3. 관리자 개요는 ManualCollectionPanel을 마운트하지 않는다(백엔드 필드는 불변).
 *  4. 콘솔 영문 라벨에 기계번역 파손물이 남지 않는다.
 *  5. mock 로그인 'premium'(Demo: clinic owner)은 미국 치과 워크스페이스로 들어간다.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildSeed, SUMMIT_DENTAL_SITE_ID } from '@/lib/data/mock/seed';
import { FONT_OPTIONS } from '@/components/editor/fonts';
import { OPERATOR_PRODUCT_LOCALE } from '@/lib/operator-model/policy';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/**
 * guards.ts는 데이터 계층(server-only)을 끌고 오므로 값을 소스에서 읽는다.
 * 리터럴을 되돌리면 이 가드가 그대로 깨진다.
 */
function mockPremiumClientId(): string {
  const guards = read('src/app/api/_lib/guards.ts');
  const match = /export const MOCK_CLIENT_IDS = \{\s*premium: '([^']+)'/u.exec(guards);
  assert.ok(match, 'MOCK_CLIENT_IDS.premium literal not found in guards.ts');
  return match[1];
}

/**
 * 실제로 관찰된 기계번역 파손 어휘. 한국어 수량사·조사가 영어 단어로 잘못 번역되어
 * 숫자 뒤에 그대로 붙은 흔적들이다. 새 표면에 다시 새면 이 가드가 잡는다.
 */
const GARBLED_PHRASES = [
  'The dog is in use',
  'I found a dog',
  'Your dog will receive',
  'error in gun',
  'There is something.',
  "There's nothing left",
  'number of people',
  'Wait for the gun',
  'time lapse',
  'No sense of ledger order',
  'Ledger Sequencing',
  'Fritendad',
  'Goun Dotum',
  'Fine background',
  'Ming Dynasty',
  'Dignity Capital',
];

/** 콘솔 영문이 사는 표면. 에디터는 폰트 셀렉트(파일 단위)만 본다. */
const CONSOLE_SOURCES = [
  'src/components/admin/admin-shell.tsx',
  'src/components/admin/overview-dashboard.tsx',
  'src/components/admin/clients-table.tsx',
  'src/components/admin/content-queue.tsx',
  'src/components/admin/edit-queue.tsx',
  'src/components/admin/video-queue.tsx',
  'src/components/admin/qa-queue.tsx',
  'src/components/admin/infra-monitor.tsx',
  'src/components/admin/manual-collection-panel.tsx',
  'src/components/editor/fonts.ts',
];

describe('CONSOLE-POLISH — customer dashboard goes straight to the only site', () => {
  test('the dashboard home redirects to the sole site instead of listing it', () => {
    const home = read('src/app/(dashboard)/dashboard/page.tsx');
    assert.match(home, /const \[onlySite\] = sites;/u);
    assert.match(home, /if \(onlySite\) redirect\(`\/dashboard\/sites\/\$\{onlySite\.id\}`\)/u);
    // 카운트 카드와 목록 그리드는 사라졌고 운영자 준비중 EmptyState는 남는다.
    assert.doesNotMatch(home, /\{sites\.length\} items/u);
    assert.doesNotMatch(home, /<SiteCard/u);
    assert.match(home, /Your Anaks Labs operator is preparing the site for this workspace\./u);
  });

  test('the site detail no longer offers a back link into a list that no longer exists', () => {
    const detail = read('src/components/dashboard/site-detail.tsx');
    // 헤더의 "← my site" 상위 목록 링크는 사라졌다 (남으면 /dashboard가 이 페이지로 되돌려 루프가 된다).
    assert.doesNotMatch(detail, /<ArrowLeft/u);
    assert.doesNotMatch(detail, /Return to My Site List/u);
    // 404 안내의 복귀 링크는 남는다 — 사이트가 없는 계정도 갈 곳이 있어야 한다.
    assert.match(detail, /href="\/dashboard"[\s\S]{0,160}Go to my site/u);
  });
});

describe('CONSOLE-POLISH — admin shell survives a 375px viewport', () => {
  test('the fixed sidebar and its offset are both gated behind md', () => {
    const shell = read('src/components/admin/admin-shell.tsx');
    // 좁은 화면에서 사이드바를 감추고, 본문 오프셋도 같은 분기점에서만 준다.
    assert.match(shell, /fixed inset-y-0 left-0 z-30 hidden w-52 flex-col[^"]*md:flex/u);
    assert.match(shell, /md:ml-52/u);
    assert.doesNotMatch(shell, /"ml-52|\sml-52\s/u);
    // 드로어를 여는 진입점이 있어야 좁은 화면에서 내비가 도달 가능하다.
    assert.match(shell, /aria-label="Open administrator menu"/u);
    assert.match(shell, /md:hidden/u);
  });

  test('the drawer reuses the single navigation declaration', () => {
    const shell = read('src/components/admin/admin-shell.tsx');
    assert.equal(shell.split('const NAV_ITEMS = [').length - 1, 1);
    // 사이드바와 드로어가 같은 목록 컴포넌트를 소비한다(복제 금지).
    assert.equal(shell.split('NAV_ITEMS.map(').length - 1, 1);
    assert.equal(shell.split('{sidebarContent}').length - 1, 2);
  });

  test('the light app chrome contract on the shell root is untouched', () => {
    const shell = read('src/components/admin/admin-shell.tsx');
    assert.match(shell, /bg-\[#F6F7F9\].*text-\[#141A3A\]/u);
  });
});

describe('CONSOLE-POLISH — manual collection ledger is off the overview', () => {
  test('the overview does not mount the panel while the panel and its data survive', () => {
    const overview = read('src/components/admin/overview-dashboard.tsx');
    assert.doesNotMatch(overview, /ManualCollectionPanel/u);
    // 백엔드 계약(필드·컴포넌트 파일)은 그대로 있어야 한다.
    assert.match(read('src/components/admin/manual-collection-panel.tsx'), /ManualCollectionPanel/u);
    assert.match(read('src/components/admin/api.ts'), /manualCollections: AdminManualCollectionRow\[\]/u);
    assert.match(read('src/app/api/admin/overview/route.ts'), /manualCollections: manualRecords/u);
  });
});

describe('CONSOLE-POLISH — console English carries no machine-translation wreckage', () => {
  test('no console surface repeats a known garbled phrase', () => {
    for (const path of CONSOLE_SOURCES) {
      const source = read(path);
      for (const phrase of GARBLED_PHRASES) {
        assert.ok(
          !source.includes(phrase),
          `${path}: broken machine translation "${phrase}" is back`,
        );
      }
    }
  });

  test('no console surface glues a word onto an interpolated value', () => {
    // `{formatNumber(n)}records` 형태가 파손의 구조적 표식이다.
    // 단위 한 글자(`{formatNumber(h)}h elapsed`)는 정상 영문이라 제외한다.
    const glued = /\)\}[A-Za-z]{2,}/u;
    for (const path of CONSOLE_SOURCES) {
      const source = read(path);
      const hit = source.split('\n').find((line) => glued.test(line));
      assert.equal(hit, undefined, `${path}: interpolated value glued to a word — ${hit}`);
    }
  });

  test('every curated font label starts with the real family name', () => {
    for (const option of FONT_OPTIONS) {
      assert.ok(
        option.label.startsWith(option.family),
        `font label "${option.label}" must name the family "${option.family}"`,
      );
    }
    // 실제로 깨져 있던 다섯 개를 값으로 고정한다.
    const byFamily = new Map(FONT_OPTIONS.map((option) => [option.family, option.label]));
    assert.equal(byFamily.get('Pretendard'), 'Pretendard (modern sans)');
    assert.equal(byFamily.get('Song Myung'), 'Song Myung (serif)');
    assert.equal(byFamily.get('Gowun Batang'), 'Gowun Batang (soft serif)');
    assert.equal(byFamily.get('Hahmlet'), 'Hahmlet (editorial serif)');
    assert.equal(byFamily.get('Gowun Dodum'), 'Gowun Dodum (soft sans)');
  });
});

describe('CONSOLE-POLISH — the clinic-owner demo lands on a US dental practice', () => {
  test('mock login premium resolves to the US clinic workspace, not the KO restaurant', () => {
    const login = read('src/app/(auth)/login/page.tsx');
    // "Demo: clinic owner" 버튼이 여전히 premium 역할을 쓴다.
    assert.match(login, /role: 'premium',\s*\n\s*label: 'Demo: clinic owner',/u);

    const premiumId = mockPremiumClientId();
    const seed = buildSeed();
    const client = seed.clients.get(premiumId);
    assert.ok(client, `mock login premium must resolve to a seeded client (${premiumId})`);

    const owned = [...seed.sites.values()].filter((site) => site.clientId === client.id);
    // 한 클라이언트 = 한 사이트 (2개면 launch_site_unresolved 상시 경보)
    assert.equal(owned.length, 1, 'the clinic demo client must own exactly one site');

    const [site] = owned;
    assert.equal(site.id, SUMMIT_DENTAL_SITE_ID);
    assert.equal(site.status, 'live');
    assert.ok(site.siteConfig, 'the landing site must be published');
    assert.equal(site.siteConfig.meta.locale, OPERATOR_PRODUCT_LOCALE);
    assert.equal(site.siteConfig.meta.jurisdiction, 'US');

    const connectorIds = site.siteConfig.connectors?.items.map((item) => item.id) ?? [];
    assert.deepEqual(connectorIds, ['tel', 'booking']);
  });

  test('the KO legacy demo keeps its own client and live domain', () => {
    const seed = buildSeed();
    const hwarodam = [...seed.sites.values()].find(
      (site) => site.domain === 'hwarodam.anakslabs.com',
    );
    assert.ok(hwarodam);
    assert.equal(hwarodam.clientId, 'demo-premium');
    assert.notEqual(hwarodam.clientId, mockPremiumClientId());
  });
});
