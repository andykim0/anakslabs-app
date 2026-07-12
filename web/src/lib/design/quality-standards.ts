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
import { FONT_PAIRINGS, STYLE_DIRECTIONS } from '@/lib/ai/design-knowledge-data';

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
    enforcement: ['generation-data', 'validator', 'qa-audit'],
    implementedBy: ['src/lib/design/quality-standards.ts', 'src/lib/ai/gemini-image.ts'],
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

export interface DesignPov {
  id: PovId;
  mood: string;
  /** 어울리는 업종 */
  bestFor: string[];
  /** 금지 표현 */
  avoid: string[];
  /** 허용 폰트 페어링 — 기존 FONT_PAIRINGS id만(신규 레지스트리 금지) */
  allowedPairings: string[];
}

export const DESIGN_POVS: DesignPov[] = [
  {
    id: 'editorial',
    mood: '잡지 에디토리얼 — 큰 세리프 헤드라인, 넉넉한 여백, 그리드 위 절제된 리듬',
    bestFor: ['갤러리', '스튜디오', '브랜드', '출판·미디어', '헤리티지'],
    avoid: ['형광색', '과한 그림자', '스톡 사진 남발'],
    allowedPairings: ['hahmlet-editorial', 'playfair-classic', 'garamond-counsel', 'bodoni-mode'],
  },
  {
    id: 'dark-luxury',
    mood: '다크 럭셔리 — 어두운 배경에 금빛 포인트, 고요하고 묵직한 고급감',
    bestFor: ['파인다이닝', '호텔', '주얼리', '프리미엄 서비스'],
    avoid: ['밝은 파스텔', '만화체', '무지개 팔레트'],
    allowedPairings: ['cormorant-luxe', 'cinzel-estate', 'bodoni-mode', 'playfair-classic'],
  },
  {
    id: 'warm-artisan',
    mood: '따뜻한 아티산 — 손맛 있는 질감, 크림·테라코타 톤, 아날로그 감성',
    bestFor: ['카페', '베이커리', '공방', '리테일'],
    avoid: ['차가운 형광 그라데이션', '기계적 대칭'],
    allowedPairings: ['gowun-batang-literary', 'lora-wellness', 'caveat-handmade', 'abril-retro'],
  },
  {
    id: 'swiss-minimal',
    mood: '스위스 미니멀 — 기하학 산스, 강한 그리드, 여백과 정렬로 말하는 정제미',
    bestFor: ['회사·브랜드', '테크', '컨설팅', '포트폴리오'],
    avoid: ['장식체', '질감 오버레이', '과한 색'],
    allowedPairings: ['space-grotesk-tech', 'outfit-geometric', 'ibm-plex-trust'],
  },
  {
    id: 'soft-organic',
    mood: '소프트 오가닉 — 둥근 형태, 부드러운 그림자, 자연·웰니스 톤',
    bestFor: ['웰니스', '뷰티', '요가·필라테스', '식물·플라워'],
    avoid: ['날카로운 각', '고대비 네온', '브루탈 타입'],
    allowedPairings: ['lora-wellness', 'gowun-batang-literary', 'fredoka-playful'],
  },
  {
    id: 'bold-brutalist',
    mood: '볼드 브루탈리즘 — 굵은 임팩트 타입, 강한 대비, 원색 블록의 에너지',
    bestFor: ['피트니스', '이벤트', '스트리트 브랜드', '스포츠'],
    avoid: ['섬세한 세리프', '파스텔', '옅은 대비'],
    allowedPairings: ['bebas-impact', 'syne-avantgarde', 'barlow-athletic', 'space-grotesk-tech'],
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
 * gemini-image 프롬프트 조립 — POV 무드 + 업종 + (선택)팔레트/렌더방식에서만 조립(자유 서술 금지).
 * POV=무드, candidateStyle=렌더 방식(직교 조합).
 * [주의] 말미 "16:10"은 예술적 힌트일 뿐 — gemini-2.5-flash-image는 프롬프트 문자열 비율을 무시함이
 * 실증됨(정사각 출력). 실제 출력 비율은 generateGeminiImage의 aspectRatio(imageConfig)가 강제한다.
 */
export function buildImagePrompt(
  povId: PovId,
  industry: string,
  section: string,
  opts?: { candidateStyle?: CandidateStyle; palettePrimary?: string; background?: string },
): string {
  const pov = findPov(povId);
  const render =
    opts?.candidateStyle === '3d_render'
      ? 'soft 3D render, tactile materials'
      : opts?.candidateStyle === 'illustration'
        ? 'editorial illustration'
        : 'photographic, art-directed';
  const color = opts?.palettePrimary
    ? ` Color mood: accent near ${opts.palettePrimary}${opts.background ? `, background near ${opts.background}` : ''}.`
    : '';
  return (
    `${section} image for a Korean small business (${industry}). ` +
    `Design point-of-view: ${pov.mood}. Render: ${render}.${color} ` +
    `Generous negative space, no text, no words, no logos, no watermark, no stock photography. 16:10.`
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
