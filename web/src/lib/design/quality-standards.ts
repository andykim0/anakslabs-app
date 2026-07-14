/**
 * [quality-system] $200 vs $10,000를 가르는 품질 표준 — 코드로 강제.
 *
 * 규칙은 문서가 아니라 코드다: 8요소를 enforcement 모드로 분류하고, hard-code/validator는
 * 이 파일의 순수 함수가, generation-data는 DESIGN_POVS/기존 design-knowledge가, qa-audit는
 * qaAuditChecklist()가 담당한다(QA 화면과 규칙이 어긋날 수 없는 단일 소스).
 *
 * [프롬프트-실제 코드 조정] ① FONT_PAIRINGS는 신규 생성 금지 — 기존 lib/ai/design-knowledge-data.ts를
 * 단일 소스로 재사용(POV.allowedPairings가 기존 id 참조). ② design-candidates에 정적 후보 목록이
 * 없어 povId를 후보에 심는 대신, 기존 StyleDirection → POV 매핑(povForStyle, 완전성 테스트로 강제)으로
 * 유도. ③ CandidateStyle(photo|3d_render|illustration)은 POV와 직교(렌더 방식) — buildImagePrompt 파라미터로만 사용.
 */
import type { CandidateStyle } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import { FONT_PAIRINGS, STYLE_DIRECTIONS } from '@/lib/ai/design-knowledge-data';
import {
  ambientSubjectFor,
  productSafetyDirective,
  resolveIndustrySubjectSafety,
} from '@/lib/design/image-subjects';

export type EnforcementMode = 'hard-code' | 'generation-data' | 'validator' | 'qa-audit';

export interface QualityStandard {
  id: string;
  title: string;
  description: string;
  enforcement: EnforcementMode[];
  /** 실존 모듈 경로(테스트로 존재 강제) */
  implementedBy: string[];
}

/** 8요소 — description·enforcement는 확정값(개명·수치 변경 금지) */
export const QUALITY_STANDARDS: QualityStandard[] = [
  {
    id: 'point-of-view',
    title: '명확한 관점',
    description:
      '명확한 관점 — 브루탈리즘, 에디토리얼, 다크 럭셔리 등 특정 디자인 방향을 흔들림 없이 밀고 나가는 것. 저가 사이트는 범용적이고, 고가 사이트는 취향이 있다.',
    enforcement: ['generation-data', 'qa-audit'],
    implementedBy: ['src/lib/design/quality-standards.ts', 'src/lib/ai/design-knowledge-data.ts'],
  },
  {
    id: 'typography',
    title: '기능하는 타이포그래피',
    description:
      '기능하는 타이포그래피 — Inter나 Roboto가 아닌, 디스플레이체와 본문체를 짝지어 사용하고 크기와 굵기로 위계를 만든다.',
    enforcement: ['hard-code', 'validator'],
    implementedBy: ['src/lib/design/quality-standards.ts', 'src/components/editor/fonts.ts'],
    // [motion 3단계 재해석] validateFontPairing(pairingId)은 생성 경로 전용 — SiteTheme엔 pairingId
    // 필드가 없다. 에디터는 FONT_OPTIONS(components/editor/fonts.ts) 큐레이션 리스트로 자유 조합을
    // 구조적으로 차단하고, ThemeInspector가 "heading==body(디스플레이/본문 미분리)" 경고로 등가 강제한다.
  },
  {
    id: 'color-restraint',
    title: '절제된 색상 시스템',
    description:
      '절제된 색상 시스템 — 3~5가지 색상만 일관되게 사용. 무지개색이 아니라 절제를 통해 프리미엄을 표현한다.',
    enforcement: ['hard-code', 'validator'],
    implementedBy: ['src/lib/design/quality-standards.ts'],
    // [motion 3단계 재해석] validatePalette의 "≤5색"은 SiteTheme의 6슬롯 팔레트 토큰 계약이
    // 구조적으로 대체한다(자유 색 추가 불가). 발행 게이트(preflight)는 5토큰+본문 AA(4.5:1)를 검사하고,
    // 에디터는 동일 함수(contrastRatio·임계 4.5)로 편집시점 경고를 표면화한다(편집=경고, 발행=차단).
  },
  {
    id: 'hierarchy',
    title: '여백이 살아있는 위계',
    description:
      '여백이 살아있는 위계 — 여백, 크기, 대비로 시선을 자연스럽게 유도하며 주/보조/3차 정보의 구분이 명확하다.',
    enforcement: ['generation-data', 'qa-audit'],
    implementedBy: ['src/lib/design/quality-standards.ts', 'src/lib/ai/design-knowledge-data.ts'],
  },
  {
    id: 'intentional-imagery',
    title: '의도가 담긴 이미지',
    description:
      '의도가 담긴 이미지 — 흔한 Unsplash 사진이 아닌 커스텀 촬영, 아트 디렉션에 맞는 생성 이미지, 혹은 엄선된 큐레이션.',
    // [F3 #2a] 이미지 소스 우선순위: 사용자 실사(storePhotoUrls) > AI 생성 > 큐레이션.
    // 고객이 올린 실제 사진은 슬롯이 있는 한 반드시 1회 이상 사용하고 부족분만 AI로 채운다.
    // 구현: src/lib/data/image-pool.ts (buildImagePool) — mock/supabase AiService가 소비.
    enforcement: ['generation-data', 'validator', 'qa-audit'],
    implementedBy: ['src/lib/design/quality-standards.ts', 'src/lib/ai/gemini-image.ts', 'src/lib/data/image-pool.ts'],
  },
  {
    id: 'whispered-motion',
    title: '속삭이는 듯한 모션',
    description:
      '속삭이는 듯한 모션 — 마이크로 인터랙션과 스크롤 효과가 손으로 다듬은 듯 자연스러움.',
    enforcement: ['hard-code'],
    // 참조만 — 재구현 금지 (모션 시스템 단일 소스는 lib/motion/*)
    implementedBy: ['src/lib/motion'],
  },
  {
    id: 'mobile-first',
    title: '모바일 전용 설계',
    description:
      '모바일 전용 설계 — 데스크톱을 축소한 게 아니라 모바일만을 위해 별도로 설계. 저가 사이트가 가장 많이 무너지는 지점.',
    enforcement: ['validator', 'qa-audit'],
    implementedBy: ['src/lib/design/quality-standards.ts', 'src/components/site-renderer'],
  },
  {
    id: 'invisible-luxury',
    title: '보이지 않는 고급스러움',
    description:
      '보이지 않는 고급스러움 — 2초 이내 로딩, WCAG AA 대비, 키보드 내비게이션, 시맨틱 HTML, 제대로 된 메타 태그.',
    enforcement: ['hard-code', 'validator'],
    implementedBy: ['src/lib/design/quality-standards.ts', 'src/lib/seo'],
  },
];

// ---------- 디자인 관점(POV) ----------

export type PovId = 'editorial' | 'dark-luxury' | 'warm-artisan' | 'swiss-minimal' | 'soft-organic' | 'bold-brutalist';

/**
 * [Q5] POV 개성 키트 — 생성 시 POV가 결정하는 장식·리듬 축(LLM 선택 아님).
 * 소비: section-rhythm(배경 리듬·악센트 밴드), site-templates 빌더(가격 타이포·구분선·이미지 라운딩·인용).
 */
export interface PovKit {
  /** 배경 리듬 사이클 — 'background'/'surface' 교대 패턴. 사이클 내 최대 런 2(3연속 금지 보장) */
  rhythm: readonly ('background' | 'surface')[];
  /** 악센트 밴드 색 원천 — 'primary'=팔레트 primary 밴드, 'dark'=배경 반전(팔레트 text 토큰) 밴드 */
  bandSource: 'primary' | 'dark';
  /**
   * [D2] 홈에 강조 밴드를 방출할지 — 드라마틱 POV(다크 럭셔리·볼드 브루탈리즘)만 true.
   * 일반 업종 POV(에디토리얼·아티산·스위스·소프트)는 false = 라이트 연속(밴드 없음, 카드·여백·구분선으로
   * 섹션 구분). 강한 다크 밴드가 히어로를 'PPT 슬라이드처럼' 조각내는 역효과를 제거한다(②).
   */
  bandOnHome: boolean;
  /** 밴드 우선 배치 섹션 타입(앞선 것 우선). 매칭 없으면 중후반 섹션 폴백 */
  bandPreference: readonly SectionType[];
  /** 구분선 두께(px) */
  dividerThickness: number;
  /** 메뉴 가격 타이포 배율(1 = 기본) — 오버사이즈 가격은 POV가 결정 */
  priceScale: number;
  /** 이미지 요소 라운딩(px) — 카드·버튼은 theme.radius 유지, 이미지만 POV 개성 */
  imageRadius: number;
  /** 인용(후기) 본문 이탤릭 여부 */
  quoteItalic: boolean;
}

export interface DesignPov {
  id: PovId;
  mood: string;
  /** [T2] 이미지·영상 프롬프트용 영어 무드(한글 각인 방지 — 프롬프트엔 이것만 사용) */
  promptMood: string;
  /** 어울리는 업종 */
  bestFor: string[];
  /** 금지 표현 */
  avoid: string[];
  /** 허용 폰트 페어링 — 기존 FONT_PAIRINGS id만(신규 레지스트리 금지) */
  allowedPairings: string[];
  /** [Q5] 개성 키트 — 배경 리듬·장식 축 */
  kit: PovKit;
}

export const DESIGN_POVS: DesignPov[] = [
  {
    id: 'editorial',
    mood: '잡지 에디토리얼 — 큰 세리프 헤드라인, 넉넉한 여백, 그리드 위 절제된 리듬',
    promptMood: 'refined editorial magazine composition, large serif headline space, generous whitespace, restrained grid rhythm',
    bestFor: ['갤러리', '스튜디오', '브랜드', '출판·미디어', '헤리티지'],
    avoid: ['형광색', '과한 그림자', '스톡 사진 남발'],
    allowedPairings: ['hahmlet-editorial', 'playfair-classic', 'garamond-counsel', 'bodoni-mode'],
    kit: {
      rhythm: ['background', 'surface'],
      bandSource: 'dark',
      bandOnHome: false,
      bandPreference: ['cta', 'testimonials', 'about'],
      dividerThickness: 1,
      priceScale: 1,
      imageRadius: 2,
      quoteItalic: true,
    },
  },
  {
    id: 'dark-luxury',
    mood: '다크 럭셔리 — 어두운 배경에 금빛 포인트, 고요하고 묵직한 고급감',
    promptMood: 'dark luxury mood, deep shadows with a warm gold accent light, quiet and weighty premium feel',
    bestFor: ['파인다이닝', '호텔', '주얼리', '프리미엄 서비스'],
    avoid: ['밝은 파스텔', '만화체', '무지개 팔레트'],
    allowedPairings: ['cormorant-luxe', 'cinzel-estate', 'bodoni-mode', 'playfair-classic'],
    kit: {
      rhythm: ['background', 'background', 'surface'],
      bandSource: 'primary',
      bandOnHome: true,
      bandPreference: ['cta', 'testimonials', 'menu'],
      dividerThickness: 1,
      priceScale: 1.15,
      imageRadius: 4,
      quoteItalic: true,
    },
  },
  {
    id: 'warm-artisan',
    mood: '따뜻한 아티산 — 손맛 있는 질감, 크림·테라코타 톤, 아날로그 감성',
    promptMood: 'warm artisan feel, handcrafted textures, cream and terracotta tones, analog warmth',
    bestFor: ['카페', '베이커리', '공방', '리테일'],
    avoid: ['차가운 형광 그라데이션', '기계적 대칭'],
    allowedPairings: ['gowun-batang-literary', 'lora-wellness', 'caveat-handmade', 'abril-retro'],
    kit: {
      rhythm: ['background', 'surface'],
      bandSource: 'primary',
      bandOnHome: false,
      bandPreference: ['cta', 'testimonials', 'about'],
      dividerThickness: 2,
      priceScale: 1.1,
      imageRadius: 14,
      quoteItalic: false,
    },
  },
  {
    id: 'swiss-minimal',
    mood: '스위스 미니멀 — 기하학 산스, 강한 그리드, 여백과 정렬로 말하는 정제미',
    promptMood: 'swiss minimal precision, geometric sans order, strong grid, calm negative space',
    bestFor: ['회사·브랜드', '테크', '컨설팅', '포트폴리오'],
    avoid: ['장식체', '질감 오버레이', '과한 색'],
    allowedPairings: ['space-grotesk-tech', 'outfit-geometric', 'ibm-plex-trust'],
    kit: {
      rhythm: ['background', 'background', 'surface'],
      bandSource: 'dark',
      bandOnHome: false,
      bandPreference: ['cta', 'cases', 'pricing'],
      dividerThickness: 2,
      priceScale: 1,
      imageRadius: 0,
      quoteItalic: false,
    },
  },
  {
    id: 'soft-organic',
    mood: '소프트 오가닉 — 둥근 형태, 부드러운 그림자, 자연·웰니스 톤',
    promptMood: 'soft organic forms, rounded shapes, gentle shadows, natural wellness tones',
    bestFor: ['웰니스', '뷰티', '요가·필라테스', '식물·플라워'],
    avoid: ['날카로운 각', '고대비 네온', '브루탈 타입'],
    allowedPairings: ['lora-wellness', 'gowun-batang-literary', 'fredoka-playful'],
    kit: {
      rhythm: ['background', 'surface', 'surface'],
      bandSource: 'primary',
      bandOnHome: false,
      bandPreference: ['cta', 'testimonials', 'faq'],
      dividerThickness: 1,
      priceScale: 1.05,
      imageRadius: 24,
      quoteItalic: false,
    },
  },
  {
    id: 'bold-brutalist',
    mood: '볼드 브루탈리즘 — 굵은 임팩트 타입, 강한 대비, 원색 블록의 에너지',
    promptMood: 'bold brutalist energy, heavy impact type space, strong contrast, saturated color blocks',
    bestFor: ['피트니스', '이벤트', '스트리트 브랜드', '스포츠'],
    avoid: ['섬세한 세리프', '파스텔', '옅은 대비'],
    allowedPairings: ['bebas-impact', 'syne-avantgarde', 'barlow-athletic', 'space-grotesk-tech'],
    kit: {
      rhythm: ['background', 'surface'],
      bandSource: 'dark',
      bandOnHome: true,
      bandPreference: ['cta', 'cases', 'testimonials'],
      dividerThickness: 4,
      priceScale: 1.3,
      imageRadius: 0,
      quoteItalic: false,
    },
  },
];

const POV_IDS = new Set<string>(DESIGN_POVS.map((p) => p.id));
export function isPovId(id: string): id is PovId {
  return POV_IDS.has(id);
}
export function findPov(id: PovId): DesignPov {
  const p = DESIGN_POVS.find((x) => x.id === id);
  if (!p) throw new Error(`알 수 없는 POV: ${id}`);
  return p;
}

/**
 * 기존 StyleDirection id → POV. 완전성은 테스트가 강제한다(모든 STYLE_DIRECTIONS id가
 * 여기 명시돼야 함 — 새 스타일 추가 후 매핑 누락 시 테스트 실패).
 */
const POV_BY_STYLE: Record<string, PovId> = {
  'dark-luxury': 'dark-luxury',
  'premium-3d-product': 'dark-luxury',
  'minimal-swiss': 'swiss-minimal',
  'glass-modern': 'swiss-minimal',
  'editorial-magazine': 'editorial',
  'heritage-korean': 'editorial',
  'soft-clay-3d': 'soft-organic',
  'organic-natural': 'soft-organic',
  'botanical-illust': 'soft-organic',
  'warm-cozy': 'warm-artisan',
  'retro-analog': 'warm-artisan',
  'flat-friendly-illust': 'warm-artisan',
  'bold-energy': 'bold-brutalist',
};

/** StyleDirection id → POV (미매핑이면 안전 폴백; 완전성은 테스트가 보장) */
export function povForStyle(styleId: string): PovId {
  return POV_BY_STYLE[styleId] ?? 'swiss-minimal';
}
/** 명시 매핑 존재 여부 — 완전성 테스트용 */
export function hasPovMapping(styleId: string): boolean {
  return Object.prototype.hasOwnProperty.call(POV_BY_STYLE, styleId);
}

// ---------- 타이포·스페이싱 스케일 ----------

/** 1.25 모듈러 스케일(base 16) — 헤딩 위계 상수 */
export const FONT_SCALE_RATIO = 1.25;
export const FONT_SCALE = [16, 20, 25, 31, 39, 49, 61] as const;

/** 스페이싱 토큰 (확정값) */
export const SPACING_SCALE = [4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

/** 기존 FONT_PAIRINGS id 집합 — 폰트는 pairingId로만 설정 가능(자유 조합 차단) */
const PAIRING_IDS = new Set<string>(FONT_PAIRINGS.map((f) => f.id));
export function validateFontPairing(pairingId: string): boolean {
  return PAIRING_IDS.has(pairingId);
}

// ---------- 색상 검증 ----------

/** WCAG 상대 휘도 (0~1). 유효하지 않은 hex는 0(가장 어두움). */
export function relLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const srgb = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/**
 * [motion 3단계] 다크 배경 판정 — spotlight(커서 추적 빛)는 다크 무드 섹션에만 방출(darkSectionOnly).
 * 임계 0.15 ≈ #6b6b6b보다 어두우면 다크. resolveMotionPlan이 이 함수로 대상 섹션을 거른다.
 */
export function isDarkColor(hex: string, threshold = 0.15): boolean {
  return relLuminance(hex) < threshold;
}

/** WCAG 대비비 (1~21). 흰-검 = 21 */
export function contrastRatio(fg: string, bg: string): number {
  const a = relLuminance(fg);
  const b = relLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 팔레트 검증 — 브랜드 3 + 중립 2 = 최대 5색, 본문 텍스트 AA(4.5:1).
 * textBg 주면 본문 대비까지 검사(미달 시 저장 거부).
 */
export function validatePalette(
  colors: string[],
  textBg?: { text: string; background: string },
): { ok: boolean; error?: string } {
  const distinct = [...new Set(colors.map((c) => c.trim().toLowerCase()))];
  if (distinct.length > 5) {
    return { ok: false, error: `색상 ${distinct.length}개 (최대 5색: 브랜드 3 + 중립 2)` };
  }
  if (textBg) {
    const r = contrastRatio(textBg.text, textBg.background);
    if (r < 4.5) return { ok: false, error: `본문 대비 ${r.toFixed(2)}:1 (WCAG AA 4.5:1 미달)` };
  }
  return { ok: true };
}

// ---------- 이미지 프롬프트 조립 ----------

/** 스톡 이미지 도메인 차단 (커스텀/생성 이미지 원칙) */
export function hasStockImageDomain(url: string): boolean {
  return /(?:unsplash|pexels|pixabay)\.com/i.test(url);
}

/**
 * [T2] 문자 렌더 전면 금지 지시 — 이미지 모델은 (특히 한글) 타이포를 그리지 못한다("나의쇼볭말" 아티팩트).
 * 글자가 필요한 디자인은 이미지에 굽지 않고 HTML 오버레이로 얹는다(시스템 원칙).
 * 모든 이미지·영상 프롬프트 빌더가 자동 부착(호출부가 잊을 수 없게).
 */
export const NO_TEXT_DIRECTIVE =
  'no text, no letters, no words, no typography, no signage, no logos, no watermarks';

/**
 * [T2] 프롬프트에서 한글(음절·자모)을 제거하는 최종 안전망 — 빌더가 영어로 조립하지만
 * Claude가 다듬은 장면(refinedScene) 등 외부 유입 텍스트에 한글이 섞여도 각인 위험을 차단.
 * 빈 괄호·중복 공백 등 제거 후 잔여물을 정리한다.
 */
export function stripHangul(s: string): string {
  return s
    .replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s*—\s*(?=[.,)]|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,)])/g, '$1')
    .trim();
}

/**
 * [T2] 업종(한글 자유 텍스트) → 영어 배경 맥락 디스크립터
 * (describeColor 패턴 — 키워드 매핑, 결정적).
 *
 * 이 값은 피사체가 아니다. buildImagePrompt는 양의 피사체를 MOOD_SUBJECTS에서만 고르고,
 * 업종 디스크립터는 공간을 이해하기 위한 보조 맥락으로만 사용한다.
 */
const INDUSTRY_DESCRIPTORS: { re: RegExp; en: string }[] = [
  { re: /카페|커피|베이커리|빵|디저트/, en: 'cozy cafe and bakery' },
  { re: /파인다이닝|오마카세|레스토랑|한식|식당|음식|주점|바\b/, en: 'restaurant dining' },
  { re: /미용|헤어|네일|뷰티|피부|에스테틱|왁싱/, en: 'beauty salon' },
  { re: /병원|의원|치과|한의원|클리닉/, en: 'medical clinic' },
  { re: /법무|법률|변호|회계|세무|노무|특허/, en: 'professional law and consulting office' },
  { re: /학원|교육|수학|영어|과외|클래스|강의/, en: 'education academy' },
  { re: /피트니스|헬스|요가|필라테스|짐\b|운동/, en: 'fitness studio' },
  { re: /꽃|플라워|식물|가드닝/, en: 'flower and plant shop' },
  { re: /테크|스타트업|앱|소프트|플랫폼|saas|ai|아이티|개발/i, en: 'tech product studio' },
  { re: /키즈|아동|유아|어린이|장난감/, en: 'kids studio' },
  { re: /공방|수공예|핸드메이드|도자|가죽|목공/, en: 'craft workshop' },
  { re: /패션|의류|옷|편집숍|쇼핑|스토어|리테일|브랜드/, en: 'retail brand' },
  { re: /사진|스튜디오|촬영/, en: 'photography studio' },
  { re: /세탁|청소|수리|생활/, en: 'local service shop' },
  { re: /호텔|숙박|펜션|게스트/, en: 'boutique stay' },
];
export function industryDescriptor(industry: string | undefined): string {
  const s = (industry ?? '').toLowerCase();
  for (const { re, en } of INDUSTRY_DESCRIPTORS) {
    if (re.test(s)) return en;
  }
  return 'local business';
}

/**
 * 자유 입력 section을 프롬프트에 그대로 넣지 않기 위한 역할 화이트리스트.
 * "signature product closeup" 같은 외부 문자열은 분류에만 쓰이고 출력에는 절대 포함되지 않는다.
 */
export function imageRoleForSection(section: string | undefined): string {
  const value = (section ?? '').toLowerCase();
  if (/hero|landing|히어로|메인/.test(value)) return 'hero ambient backdrop';
  if (/about|story|brand|소개|이야기/.test(value)) return 'brand-story ambient backdrop';
  if (/gallery|portfolio|cases|갤러리|포트폴리오|사례/.test(value)) return 'editorial gallery backdrop';
  if (/contact|location|map|문의|위치|오시는/.test(value)) return 'welcoming contact backdrop';
  return 'supporting ambient backdrop';
}

/** hex → HSL (h:0-360, s:0-1, l:0-1). 유효하지 않으면 null */
/** [I3] hex(#rrggbb) → HSL(h 0-360, s·l 0-1). 무효면 null. 채도 기반 대표색 추출에 재사용(export) */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hueName(h: number): string {
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'amber';
  if (h < 95) return 'chartreuse';
  if (h < 150) return 'green';
  if (h < 185) return 'teal';
  if (h < 205) return 'cyan';
  if (h < 285) return 'indigo';
  if (h < 320) return 'violet';
  return 'magenta';
}

/**
 * hex → 색상 기술어 (프롬프트용). 이미지 모델이 hex 문자열("#141A3A")을 표면에 텍스트로 각인하므로
 * 색 이름으로 치환한다(실증된 아티팩트 원인 제거). 간단한 hue/lightness 분류.
 * 예: #141A3A→"deep navy", #2D63F0→"vivid cobalt blue", #F6F7F9→"cool white".
 */
export function describeColor(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return 'neutral tone';
  const { h, s, l } = hsl;
  // 극단 명도 = near-white/near-black (근백색은 미세 채도가 남아도 흰색으로 — 파랑 분기 오분류 방지)
  if (l > 0.9 && s < 0.35) return 'cool white';
  if (l < 0.06) return 'near-black';
  // 저채도 = 중성(명도로 이름)
  if (s < 0.12) {
    if (l > 0.68) return 'light cool gray';
    if (l > 0.4) return 'slate gray';
    if (l > 0.16) return 'charcoal';
    return 'near-black';
  }
  // 파랑 계열(브랜드 핵심) 세분화
  if (h >= 205 && h < 255) {
    if (l < 0.24) return 'deep navy';
    if (l < 0.42) return 'dark blue';
    return s > 0.55 ? 'vivid cobalt blue' : 'cool blue';
  }
  const light = l < 0.24 ? 'deep' : l < 0.42 ? 'dark' : l < 0.66 ? 'rich' : l < 0.82 ? 'soft' : 'pale';
  const vivid = s > 0.62 ? 'vivid ' : '';
  return `${light} ${vivid}${hueName(h)}`.replace(/\s+/g, ' ').trim();
}

/** HSL(h:0-360, s:0-1, l:0-1) → #rrggbb */
export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export interface DerivedPalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
}

/**
 * [F3 #6] 메인 1색(+보조 1색) → 6토큰 팔레트 파생(결정적).
 * 고객이 색을 '고르면' 시스템이 규칙에 맞는 팔레트를 만든다(LLM 색 생성 아님).
 * - primary = 메인색 그대로. accent = 보조색(있으면) 또는 메인의 명도 시프트 변형.
 * - background/surface/text/muted = 메인 hue를 아주 옅게 머금은 중립(다크/라이트).
 * - 말미에 본문 text/background 대비 AA(4.5:1)를 보장하도록 text 명도를 극단화(발행 게이트 통과).
 * 5색 절제(브랜드3+중립2)는 SiteTheme 6토큰 고정계약이 구조적으로 강제.
 */
export function derivePalette(primary: string, secondary?: string, opts?: { dark?: boolean }): DerivedPalette {
  const p = hexToHsl(primary) ?? { h: 220, s: 0.5, l: 0.5 };
  const dark = opts?.dark ?? false;
  const accent =
    secondary && hexToHsl(secondary)
      ? secondary
      : hslToHex(p.h, Math.min(1, p.s * 0.9), dark ? Math.min(0.72, p.l + 0.12) : Math.max(0.24, p.l - 0.12));
  const hue = p.h;
  let background: string;
  let surface: string;
  let text: string;
  let muted: string;
  if (dark) {
    background = hslToHex(hue, 0.06, 0.08);
    surface = hslToHex(hue, 0.06, 0.14);
    text = hslToHex(hue, 0.04, 0.95);
    muted = hslToHex(hue, 0.05, 0.62);
  } else {
    background = hslToHex(hue, 0.05, 0.985);
    surface = hslToHex(hue, 0.05, 0.955);
    text = hslToHex(hue, 0.08, 0.14);
    muted = hslToHex(hue, 0.06, 0.44);
  }
  // AA 보정 — 본문 대비 4.5:1 보장 (미달 시 text 명도를 배경 반대 방향으로 극단화)
  let guard = 0;
  while (contrastRatio(text, background) < 4.5 && guard < 10) {
    const th = hexToHsl(text) ?? { h: hue, s: 0.05, l: dark ? 0.95 : 0.14 };
    text = hslToHex(th.h, th.s, dark ? Math.min(1, th.l + 0.05) : Math.max(0, th.l - 0.05));
    guard += 1;
  }
  return { background, surface, text, muted, primary, accent };
}

/**
 * gemini-image 프롬프트 조립 — POV 무드 + 업종 + (선택)팔레트/렌더방식에서만 조립(자유 서술 금지).
 * POV=무드, candidateStyle=렌더 방식(직교 조합).
 * [주의] 말미 "16:10"은 예술적 힌트일 뿐 — gemini-2.5-flash-image는 프롬프트 문자열 비율을 무시함이
 * 실증됨(정사각 출력). 실제 출력 비율은 generateGeminiImage의 aspectRatio(imageConfig)가 강제한다.
 */
export function buildImagePrompt(
  povId: PovId,
  industry: string,
  section: string,
  opts?: {
    candidateStyle?: CandidateStyle;
    palettePrimary?: string;
    background?: string;
    /** 고객이 고른 "원하는 느낌". 미지정 시 POV 영어 무드로 결정적 폴백. */
    tone?: readonly string[] | string;
    /** 자유 업종명보다 신뢰할 수 있는 온보딩 목적. 회사·포트폴리오 strict:false 판정에 우선 사용. */
    purposeId?: string;
  },
): string {
  const pov = findPov(povId);
  const candidateStyle = opts?.candidateStyle ?? 'photo';
  const render =
    candidateStyle === '3d_render'
      ? 'soft 3D render, tactile materials'
      : candidateStyle === 'illustration'
        ? 'editorial illustration'
        : 'photographic, art-directed';
  const role = imageRoleForSection(section);
  const context = industryDescriptor(industry);
  const subjectSafety = resolveIndustrySubjectSafety({ purposeId: opts?.purposeId, industry });
  const subject = ambientSubjectFor({
    tone: opts?.tone,
    fallbackMood: pov.promptMood,
    // raw section/industry는 선택의 결정성에만 쓰며 생성 프롬프트에는 노출하지 않는다.
    seed: `${povId}:${role}:${context}`,
  });
  // hex는 이미지 표면에 텍스트로 각인되므로 색 이름(describeColor)으로 치환 — 산출 프롬프트에 '#' 미포함(불변식).
  const color = opts?.palettePrimary
    ? ` Color mood: accent tone ${describeColor(opts.palettePrimary)}${opts.background ? `, background tone ${describeColor(opts.background)}` : ''}.`
    : '';
  // [H3] 양의 피사체는 tone 기반 ambient만. 업종은 배경 맥락, section은 화이트리스트 역할만 출력한다.
  return stripHangul(
    `${role} for a Korean small business. Focal ambient subject: ${subject}. ` +
      `Business-setting context only: ${context}; do not turn its goods or service outcomes into the focal subject. ` +
      `Design point-of-view: ${pov.promptMood}. Render: ${render}.${color} ` +
      `${productSafetyDirective(candidateStyle, { strict: subjectSafety.strict })} ` +
      `Generous negative space, ${NO_TEXT_DIRECTIVE}, no stock photography. 16:10.`,
  );
}

// ---------- QA 감사 단일 소스 ----------

/** qa-audit 요소(1,4,5,7) → 관리자 QA 큐 체크리스트 (규칙 파일과 QA 화면 단일 소스) */
export function qaAuditChecklist(): { id: string; title: string; description: string }[] {
  return QUALITY_STANDARDS.filter((s) => s.enforcement.includes('qa-audit')).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
  }));
}
