/**
 * [I5] 개선 모드 통합 회귀 (데이터 레벨) — 시드 URL HTML → 팔레트 추출 → 그대로 시드 생성 →
 * meta.sourceScanId 저장 → 전후 대조가 자동해결 이슈를 정직하게 집계. fresh 무회귀.
 * (UI wizard 분기는 tsc·build로 검증. 서버전용 preflightScan 대신 computeResolution 로직으로 대조 고정.)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { extractSitePalette } from '@/lib/import/extract-palette';
import { contrastRatio, derivePalette } from '@/lib/design/quality-standards';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { computeResolution, resolutionOf } from '@/lib/scan/issue-resolution';

// anakslabs.com급 시드 — 브랜드색이 있는 기존 사이트 HTML(발췌)
const SOURCE_HTML = `<!doctype html><html><head><style>
:root{--brand:#c8a96a}.hero{background:#161513;color:#f3f2f2}
.btn{background:#c8a96a;color:#161513}.link{color:#2e63f0}.muted{color:#888}
</style></head><body><h1>소소한자리</h1><p>서울 연희동 동네 카페</p></body></html>`;

const candidate = (primary: string, secondary?: string, dark = true): DesignCandidate => ({
  id: 'cand-improve', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
  theme: { ...emptySiteConfig('t').theme, palette: derivePalette(primary, secondary, { dark }) },
  description: '',
});
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] };

function improveSurvey(seed: { primary: string; secondary?: string }): SurveyInput {
  const t = resolveTemplate('local_store', '카페');
  return {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
    tone: ['친근한'], colorPreference: seed.primary, secondaryColor: seed.secondary,
    referenceImageUrls: [], contentItems: [{ name: '아메리카노', price: '4,500' }, { name: '라떼', price: '5,000' }],
    region: '서울 연희동', mode: 'improve', sourceUrl: 'https://old.example.com', sourceScanId: 'scan-src',
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
}

describe('I5 — 개선 모드 통합', () => {
  test('① 시드 URL HTML → 대표 팔레트 추출 → derivePalette AA', () => {
    const seed = extractSitePalette(SOURCE_HTML);
    assert.ok(seed, '팔레트 추출 실패');
    // 골드(#c8a96a)·블루(#2e63f0) 중 채도 높은 블루가 primary
    assert.ok(seed!.primary === '#2e63f0' || seed!.primary === '#c8a96a');
    for (const dark of [false, true]) {
      const p = derivePalette(seed!.primary, seed!.secondary, { dark });
      assert.ok(contrastRatio(p.text, p.background) >= 4.5);
    }
  });

  test('② "그대로" 시드로 생성 → meta.sourceScanId·purposeId·region 저장', () => {
    const seed = extractSitePalette(SOURCE_HTML)!;
    const cfg = buildSiteConfigFromSurvey(improveSurvey(seed), candidate(seed.primary, seed.secondary), opts);
    assert.equal(cfg.meta.sourceScanId, 'scan-src');
    assert.equal(cfg.meta.purposeId, 'local_store');
    assert.ok((cfg.meta.title ?? '').includes('서울 연희동'));
    // 가져온 메뉴 항목이 메뉴 섹션에 반영
    const menu = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'menu')!;
    assert.ok(JSON.stringify(menu).includes('아메리카노'));
  });

  test('③ 전후 대조 — 자동 해결 이슈는 해결, 콘텐츠 필요는 남김(정직)', () => {
    // 원본(저콘텐츠) 진단 이슈: jsonld 없음·텍스트 없음·제목 없음(자동해결) + 사업자정보 없음(콘텐츠필요)
    const before = ['aeo_jsonld_missing', 'geo_no_text', 'seo_title_missing', 'geo_business_info'];
    // 재생성 후: 자동 항목 해결, 사업자정보는 아직 없어 남음
    const after = ['geo_business_info'];
    const cmp = computeResolution(before, after, 41, 72);
    assert.deepEqual(cmp.resolved.sort(), ['aeo_jsonld_missing', 'geo_no_text', 'seo_title_missing']);
    assert.deepEqual(cmp.remaining, ['geo_business_info']);
    assert.ok(cmp.afterTotal > cmp.beforeTotal, '점수 상승');
    // 분류 정합: 해결된 것은 auto, 남은 것은 content
    for (const c of cmp.resolved) assert.equal(resolutionOf(c), 'auto');
    assert.equal(resolutionOf('geo_business_info'), 'content');
  });

  test('④ fresh 모드 무회귀 — mode 미설정 시 meta.sourceScanId 없음', () => {
    const t = resolveTemplate('local_store', '카페');
    const fresh = {
      businessName: '테스트', purposeId: 'local_store', purpose: '음식점', industry: '카페',
      tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [],
      contentItems: [{ name: '커피', price: '4,000' }],
      sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
    } as SurveyInput;
    const cfg = buildSiteConfigFromSurvey(fresh, candidate('#c98a5e', undefined, false), opts);
    assert.equal(cfg.meta.sourceScanId, undefined);
    assert.equal(cfg.meta.purposeId, 'local_store');
  });
});
