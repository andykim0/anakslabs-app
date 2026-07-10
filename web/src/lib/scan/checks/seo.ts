/**
 * [v3 Phase 6] SEO 규칙 — 검색엔진(네이버·구글)이 페이지를 읽고 이해할 수 있는가.
 * 라벨 사전(상수) — 상태 서술만, 순위 보장 표현 금지.
 */
import type { ScanRule } from '../rules';

function metaContent(root: import('node-html-parser').HTMLElement, selector: string): string {
  return root.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
}

export const SEO_RULES: ScanRule[] = [
  {
    code: 'seo_title_missing',
    pillar: 'seo',
    severity: 'critical',
    weight: 12,
    label: '페이지 제목(title)이 없습니다',
    detail: '검색 결과에 표시될 제목이 없어 검색엔진이 페이지 주제를 파악할 수 없는 상태입니다.',
    failed: (ctx) => !(ctx.root.querySelector('title')?.text ?? '').trim(),
  },
  {
    code: 'seo_title_length',
    pillar: 'seo',
    severity: 'warn',
    weight: 5,
    label: '페이지 제목 길이가 권장 범위 밖입니다',
    detail: '제목이 10~60자 범위를 벗어나 검색 결과에서 잘리거나 정보가 부족하게 표시됩니다.',
    failed: (ctx) => {
      const t = (ctx.root.querySelector('title')?.text ?? '').trim();
      return t.length > 0 && (t.length < 10 || t.length > 60);
    },
  },
  {
    code: 'seo_meta_description',
    pillar: 'seo',
    severity: 'critical',
    weight: 10,
    label: '메타 설명(description)이 없습니다',
    detail: '검색 결과 요약문이 없어 검색엔진이 임의 텍스트를 발췌해 보여주는 상태입니다.',
    failed: (ctx) => !metaContent(ctx.root, 'meta[name="description"]'),
  },
  {
    code: 'seo_h1',
    pillar: 'seo',
    severity: 'critical',
    weight: 10,
    label: '대표 제목(H1) 구조에 문제가 있습니다',
    detail: 'H1이 없거나 여러 개라 페이지의 핵심 주제를 판별하기 어려운 구조입니다.',
    failed: (ctx) => ctx.root.querySelectorAll('h1').length !== 1,
  },
  {
    code: 'seo_canonical',
    pillar: 'seo',
    severity: 'warn',
    weight: 6,
    label: '표준 URL(canonical)이 지정되지 않았습니다',
    detail: '같은 내용의 주소가 여러 개일 때 검색엔진이 어느 주소를 대표로 볼지 알 수 없습니다.',
    failed: (ctx) => !ctx.root.querySelector('link[rel="canonical"]'),
  },
  {
    code: 'seo_og',
    pillar: 'seo',
    severity: 'warn',
    weight: 8,
    label: '소셜 공유 미리보기(OG 태그)가 없습니다',
    detail: '카카오톡·메신저 공유 시 제목/이미지 미리보기가 비어 보이는 상태입니다.',
    failed: (ctx) => !metaContent(ctx.root, 'meta[property="og:title"]') || !metaContent(ctx.root, 'meta[property="og:image"]'),
  },
  {
    code: 'seo_img_alt',
    pillar: 'seo',
    severity: 'warn',
    weight: 8,
    label: '대체 텍스트(alt) 없는 이미지가 많습니다',
    detail: '이미지의 절반 이상에 alt가 없어 검색엔진·스크린리더가 내용을 읽을 수 없습니다.',
    failed: (ctx) => {
      const imgs = ctx.root.querySelectorAll('img');
      if (imgs.length === 0) return false;
      const withAlt = imgs.filter((img) => (img.getAttribute('alt') ?? '').trim().length > 0).length;
      return withAlt / imgs.length < 0.5;
    },
  },
  {
    code: 'seo_https',
    pillar: 'seo',
    severity: 'critical',
    weight: 12,
    label: 'HTTPS가 아닙니다',
    detail: '암호화되지 않은 연결(http)이라 브라우저가 "주의 요함"으로 표시하는 상태입니다.',
    failed: (ctx) => ctx.url.protocol !== 'https:',
  },
  {
    code: 'seo_viewport',
    pillar: 'seo',
    severity: 'critical',
    weight: 8,
    label: '모바일 뷰포트 설정이 없습니다',
    detail: 'viewport 메타가 없어 모바일에서 데스크톱 화면이 축소돼 보이는 상태입니다.',
    failed: (ctx) => !ctx.root.querySelector('meta[name="viewport"]'),
  },
  {
    code: 'seo_robots_txt',
    pillar: 'seo',
    severity: 'warn',
    weight: 6,
    label: 'robots.txt가 없습니다',
    detail: '크롤러 안내 파일이 없어 수집 범위를 제어할 수 없는 상태입니다.',
    failed: (ctx) => !ctx.robotsTxtOk,
  },
  {
    code: 'seo_sitemap',
    pillar: 'seo',
    severity: 'warn',
    weight: 6,
    label: 'sitemap.xml이 없습니다',
    detail: '사이트 구조 안내 파일이 없어 검색엔진이 페이지를 빠짐없이 찾기 어렵습니다.',
    failed: (ctx) => !ctx.sitemapOk,
  },
  {
    code: 'seo_speed_slow',
    pillar: 'seo',
    severity: 'warn',
    weight: 5,
    label: '서버 응답이 느립니다 (1.5초 초과)',
    detail: '첫 응답까지 1.5초가 넘어 사용자와 크롤러 모두 대기하는 상태입니다.',
    failed: (ctx) => ctx.ttfbMs > 1500,
  },
  {
    code: 'seo_speed_very_slow',
    pillar: 'seo',
    severity: 'critical',
    weight: 5,
    label: '서버 응답이 매우 느립니다 (3초 초과)',
    detail: '첫 응답까지 3초가 넘습니다. 방문자 이탈이 커지는 수준입니다.',
    failed: (ctx) => ctx.ttfbMs > 3000,
  },
  {
    code: 'seo_favicon',
    pillar: 'seo',
    severity: 'info',
    weight: 4,
    label: '파비콘이 지정되지 않았습니다',
    detail: '브라우저 탭·즐겨찾기 아이콘이 비어 있는 상태입니다.',
    failed: (ctx) => !ctx.root.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'),
  },
];
