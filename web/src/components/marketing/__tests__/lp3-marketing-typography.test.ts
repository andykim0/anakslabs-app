import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  DABOIM_TYPOGRAPHY,
  MARKETING_TYPOGRAPHY_VARS,
} from '@/lib/design/typography-scale';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const ROLE_NAMES = [
  'hero',
  'page-title',
  'section-title',
  'card-title',
  'body',
  'support',
  'eyebrow',
  'control',
] as const;

describe('LP$ L3 공개 마케팅 타이포 계약', () => {
  test('marketing layout이 단일 소스의 CSS 변수를 route group에만 주입한다', () => {
    const layout = source('src/app/(marketing)/layout.tsx');
    assert.match(layout, /MARKETING_TYPOGRAPHY_VARS/);
    assert.match(layout, /className="daboim-marketing /);
    assert.match(layout, /style=\{MARKETING_TYPOGRAPHY_VARS\}/);

    const vars = MARKETING_TYPOGRAPHY_VARS as Record<string, string | number>;
    for (const role of ROLE_NAMES) {
      const tokenKey = role.replaceAll('-', '');
      const sourceRole = Object.keys(DABOIM_TYPOGRAPHY.marketing).find(
        (candidate) => candidate.toLowerCase() === tokenKey,
      ) as keyof typeof DABOIM_TYPOGRAPHY.marketing | undefined;
      assert.ok(sourceRole, `${role}: source role missing`);
      assert.equal(
        vars[`--mkt-type-${role}-size`],
        DABOIM_TYPOGRAPHY.marketing[sourceRole].fontSize,
        `${role}: size variable missing`,
      );
      assert.equal(
        vars[`--mkt-type-${role}-leading`],
        DABOIM_TYPOGRAPHY.marketing[sourceRole].lineHeight,
        `${role}: leading variable missing`,
      );
    }
    assert.equal(DABOIM_TYPOGRAPHY.marketing.control.fontSize, '1rem');
  });

  test('semantic role CSS는 숫자를 재정의하지 않고 주입된 변수만 소비한다', () => {
    const css = source('src/app/globals.css');
    for (const role of ROLE_NAMES) {
      const block = css.match(new RegExp(`\\.daboim-marketing \\.mkt-type-${role} \\{([^}]+)\\}`));
      assert.ok(block, `mkt-type-${role} declaration missing`);
      assert.match(block[1], /font-size:\s*var\(--mkt-type-/);
      assert.match(block[1], /line-height:\s*var\(--mkt-type-/);
      assert.doesNotMatch(block[1], /(?:font-size|line-height):\s*(?:clamp\(|calc\(|[.\d]+(?:px|rem)?)/);
    }
  });

  test('공개 페이지 제목·본문과 공유 컴포넌트가 의미 역할을 사용한다', () => {
    const pagePaths = [
      'src/app/(marketing)/about/page.tsx',
      'src/app/(marketing)/cases/page.tsx',
      'src/app/(marketing)/faq/page.tsx',
      'src/app/(marketing)/features/page.tsx',
      'src/app/(marketing)/pricing/page.tsx',
      'src/app/(marketing)/privacy/page.tsx',
      'src/app/(marketing)/terms/page.tsx',
    ];
    for (const path of pagePaths) {
      const page = source(path);
      assert.match(page, /mkt-type-page-title/, `${path}: page title role missing`);
      assert.match(page, /mkt-type-(?:body|support)/, `${path}: reader copy role missing`);
    }

    const home = source('src/app/(marketing)/page.tsx');
    assert.match(home, /mkt-type-section-title/);
    assert.match(home, /mkt-type-body/);
    assert.match(source('src/components/marketing/ui.tsx'), /mkt-type-control/);
    assert.match(source('src/components/marketing/Faq.tsx'), /mkt-type-card-title/);
  });

  test('무료 진단 입력과 실행 버튼은 모바일에서도 16px control role을 쓴다', () => {
    const scanner = source('src/components/landing/LandingScanner.tsx');
    const input = scanner.match(/<input[\s\S]*?className="([^"]+)"/);
    const button = scanner.match(
      /<button\s+type="button"\s+onClick=\{\(\) => void startScan\(\)\}[\s\S]*?className="([^"]+)"[\s\S]*?내 사이트 무료 진단/,
    );
    assert.ok(input, 'scanner input missing');
    assert.match(input[1], /\bmkt-type-control\b/);
    assert.doesNotMatch(input[1], /\btext-(?:xs|sm|\[(?:\d|clamp|calc)[^\]]*\])/);
    assert.ok(button, 'scanner submit button missing');
    assert.match(button[1], /\bmkt-type-control\b/);
    assert.doesNotMatch(button[1], /\btext-(?:xs|sm|\[(?:\d|clamp|calc)[^\]]*\])/);
  });
});
