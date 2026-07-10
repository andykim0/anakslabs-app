/**
 * [v3 Phase 6] GEO 규칙 — 생성형 AI(ChatGPT·Perplexity 등)가 인용할 수 있는가.
 * 라벨 사전(상수) — 상태 서술만.
 */
import type { ScanRule } from '../rules';

/** 한국 전화번호(02-xxx, 0xx-xxx, 010-xxxx) 텍스트 패턴 */
const PHONE_RE = /0\d{1,2}[-.\s)]?\d{3,4}[-.\s]?\d{4}/;
/** 사업자등록번호 000-00-00000 */
const BIZ_RE = /\d{3}-\d{2}-\d{5}/;
/** 한국 주소 시그널 */
const ADDR_RE = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n<]{0,40}(로|길|동|가|읍|면)\s?\d/;

export const GEO_RULES: ScanRule[] = [
  {
    code: 'geo_no_text',
    pillar: 'geo',
    severity: 'critical',
    weight: 20,
    label: 'AI가 읽을 본문 텍스트가 거의 없습니다',
    detail: '보이는 텍스트가 200자 미만입니다. JS로만 그려지는 페이지는 AI가 내용을 읽지 못한 채 지나갑니다.',
    failed: (ctx) => ctx.visibleText.replace(/\s+/g, '').length < 200,
  },
  {
    code: 'geo_low_text_ratio',
    pillar: 'geo',
    severity: 'warn',
    weight: 10,
    label: '마크업 대비 본문 비율이 낮습니다',
    detail: '코드 대비 실제 텍스트가 5% 미만이라 AI가 핵심 내용을 찾는 데 불리한 구조입니다.',
    failed: (ctx) => {
      if (ctx.rawHtml.length === 0) return true;
      const ratio = ctx.visibleText.length / ctx.rawHtml.length;
      return ratio < 0.05 && ctx.visibleText.replace(/\s+/g, '').length >= 200;
    },
  },
  {
    code: 'geo_llms_txt',
    pillar: 'geo',
    severity: 'info',
    weight: 10,
    label: 'llms.txt가 없습니다',
    detail: 'AI 크롤러용 안내 파일(llms.txt)이 없어 사이트 요약·핵심 페이지를 AI에 직접 전달하지 못합니다.',
    failed: (ctx) => !ctx.llmsTxtOk,
  },
  {
    code: 'geo_business_info',
    pillar: 'geo',
    severity: 'warn',
    weight: 15,
    label: '명시적인 연락처·주소 정보가 없습니다',
    detail: '전화번호·주소가 텍스트로 없어 AI가 "여기 연락처가 뭐야?"에 답할 근거가 없습니다.',
    failed: (ctx) =>
      !PHONE_RE.test(ctx.visibleText) && !ADDR_RE.test(ctx.visibleText) && !BIZ_RE.test(ctx.visibleText),
  },
  {
    code: 'geo_dates',
    pillar: 'geo',
    severity: 'warn',
    weight: 10,
    label: '날짜·최신성 신호가 없습니다',
    detail: '작성/수정 시점 표기가 없어 AI가 정보의 신선도를 판단할 수 없습니다.',
    failed: (ctx) =>
      !ctx.root.querySelector('time, meta[property="article:published_time"], meta[property="article:modified_time"]'),
  },
  {
    code: 'geo_lang',
    pillar: 'geo',
    severity: 'critical',
    weight: 15,
    label: '언어 선언(lang)이 없습니다',
    detail: '<html lang> 속성이 없어 어떤 언어의 문서인지 기계가 추측해야 하는 상태입니다.',
    failed: (ctx) => !(ctx.root.querySelector('html')?.getAttribute('lang') ?? '').trim(),
  },
  {
    code: 'geo_author',
    pillar: 'geo',
    severity: 'info',
    weight: 10,
    label: '작성자·주체 정보가 없습니다',
    detail: '누가 운영하는 콘텐츠인지 메타 표기가 없어 AI 인용 시 출처 신뢰도가 낮게 평가됩니다.',
    failed: (ctx) =>
      !ctx.root.querySelector('meta[name="author"], [rel="author"]') && !BIZ_RE.test(ctx.visibleText),
  },
  {
    code: 'geo_empty_page',
    pillar: 'geo',
    severity: 'critical',
    weight: 10,
    label: '페이지가 사실상 비어 있습니다',
    detail: '본문 요소가 거의 없어 인용할 콘텐츠 자체가 없는 상태입니다.',
    failed: (ctx) => ctx.root.querySelectorAll('p, li, h1, h2, h3, td, dd').length < 3,
  },
];
