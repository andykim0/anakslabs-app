/**
 * [G4] 발행 전 진단 가이드 — scan 이슈 코드(28종)를 고객 언어의 실행 가능한 코칭으로 매핑한다.
 * 이 제품은 "홈페이지 전문 최적화 AI" — 진단 화면이 정체성의 최전선이다. 카피는 점수 자랑이 아니라
 * "이거 채우면 검색 노출이 좋아져요" 코칭 톤. 매핑 누락 0(전 코드 커버)을 테스트가 강제한다.
 */
import { AEO_RULES } from './checks/aeo';
import { GEO_RULES } from './checks/geo';
import { SEO_RULES } from './checks/seo';

/** 딥링크 대상 — 고객이 '어디를 채우면 되는지'. system=발행 시 자동 처리(고객 조치 불필요) */
export type GuidanceAnchor =
  | 'editor:content'
  | 'editor:business-info'
  | 'editor:meta'
  | 'editor:images'
  | 'system';

export interface ScanGuidance {
  /** 문제를 고객 언어로 */
  title: string;
  /** 무엇을 하면 되는지(코칭) */
  action: string;
  /** 예상 효과 한 줄 */
  effect: string;
  anchor: GuidanceAnchor;
}

const G = (title: string, action: string, effect: string, anchor: GuidanceAnchor): ScanGuidance => ({
  title,
  action,
  effect,
  anchor,
});

const AUTO = '발행하면 자동으로 처리돼요 — 따로 하실 일은 없어요.';

export const SCAN_GUIDANCE: Record<string, ScanGuidance> = {
  // ---------- SEO ----------
  seo_title_missing: G('페이지 제목이 비어 있어요', '상호와 업종·지역이 들어간 제목을 넣어주세요.', '검색 결과에 가게 이름이 또렷이 나와요.', 'editor:meta'),
  seo_title_length: G('제목 길이가 아쉬워요', '제목을 15~40자로 다듬으면 좋아요.', '검색 결과에서 제목이 잘리지 않아요.', 'editor:meta'),
  seo_meta_description: G('검색 설명(요약)이 없어요', '가게를 한두 문장으로 소개하는 설명을 넣어주세요.', '검색 결과의 설명 줄이 채워져 클릭률이 올라가요.', 'editor:meta'),
  seo_h1: G('대표 제목(H1)이 없어요', '첫 화면에 가게를 대표하는 큰 제목을 넣어주세요.', '검색엔진이 이 페이지가 무엇인지 바로 이해해요.', 'editor:content'),
  seo_canonical: G('대표 주소(canonical)가 없어요', AUTO, '같은 내용의 주소가 여러 개여도 대표 주소로 모여요.', 'system'),
  seo_og: G('공유 미리보기(OG)가 없어요', '대표 이미지를 넣으면 공유 시 미리보기가 예뻐져요.', '카카오톡·메신저 공유 시 이미지·제목이 보여요.', 'editor:images'),
  seo_img_alt: G('이미지 설명(alt)이 없어요', '주요 사진에 짧은 설명을 달아주세요.', '이미지 검색과 접근성이 좋아져요.', 'editor:images'),
  seo_https: G('보안 연결(HTTPS)이 필요해요', AUTO, '안전한 사이트로 표시되고 검색 순위에 유리해요.', 'system'),
  seo_viewport: G('모바일 화면 설정이 없어요', AUTO, '휴대폰에서 화면이 깨지지 않고 잘 보여요.', 'system'),
  seo_robots_txt: G('크롤러 안내(robots.txt)가 없어요', AUTO, '검색엔진이 사이트를 원활히 수집해요.', 'system'),
  seo_sitemap: G('사이트맵이 없어요', AUTO, '모든 페이지가 검색엔진에 빠짐없이 알려져요.', 'system'),
  seo_speed_slow: G('로딩이 조금 느려요', '이미지 용량을 줄이면 더 빨라져요.', '방문자 이탈이 줄고 검색 순위에 유리해요.', 'editor:images'),
  seo_speed_very_slow: G('로딩이 많이 느려요', '큰 이미지·영상을 줄여주세요.', '2초 안에 열려 이탈과 순위 손해를 막아요.', 'editor:images'),
  seo_favicon: G('탭 아이콘(파비콘)이 없어요', '로고를 올리면 브라우저 탭에 아이콘이 생겨요.', '탭·즐겨찾기에서 브랜드가 눈에 띄어요.', 'editor:images'),
  // ---------- AEO (AI 답변 엔진 최적화) ----------
  aeo_jsonld_missing: G('구조화 정보(JSON-LD)가 없어요', AUTO, 'AI·검색이 업체 정보를 정확히 발췌해요.', 'system'),
  aeo_jsonld_type: G('업체 유형 정보가 부족해요', '사업자정보를 채우면 유형이 더 정확해져요.', 'AI가 "무슨 곳인지"를 정확히 답변해요.', 'editor:business-info'),
  aeo_heading_order: G('제목 순서가 뒤섞였어요', '큰제목→소제목 순서로 정리하면 좋아요.', 'AI가 내용 구조를 더 잘 이해해요.', 'editor:content'),
  aeo_question_headings: G('질문형 소제목이 없어요', '"영업시간은?" 같은 자주 묻는 질문을 넣어주세요.', 'AI 검색이 질문에 바로 이 페이지를 답으로 써요.', 'editor:content'),
  aeo_main_landmark: G('본문 영역 표시가 없어요', AUTO, 'AI·스크린리더가 본문을 정확히 찾아요.', 'system'),
  aeo_semantic_structure: G('문서 구조가 약해요', '섹션을 늘리고 제목을 붙이면 좋아져요.', 'AI가 내용을 체계적으로 읽어요.', 'editor:content'),
  aeo_lists_tables: G('목록·표가 없어요', '메뉴·가격을 목록으로 정리하면 좋아요.', 'AI가 항목을 표로 발췌해 답변에 써요.', 'editor:content'),
  // ---------- GEO (생성형 AI 인용 최적화) ----------
  geo_no_text: G('읽을 텍스트가 거의 없어요', '메뉴·소개·안내 등 실제 내용을 채워주세요.', 'AI·검색이 인용할 내용이 생겨 노출이 시작돼요.', 'editor:content'),
  geo_low_text_ratio: G('내용이 조금 부족해요', '소개·메뉴 설명을 몇 줄 더 넣어주세요.', 'AI가 인용할 근거가 늘어 답변에 자주 등장해요.', 'editor:content'),
  geo_llms_txt: G('AI 안내 파일(llms.txt)이 없어요', AUTO, 'AI 크롤러가 사이트 요약을 쉽게 가져가요.', 'system'),
  geo_business_info: G('사업자정보가 비어 있어요', '상호·주소·연락처를 채워주세요.', '지역·업체 검색과 신뢰도가 크게 올라가요.', 'editor:business-info'),
  geo_dates: G('최신성 표시(날짜)가 없어요', '소개나 공지에 날짜를 한 줄 넣어주세요.', 'AI가 최신 정보로 인식해 인용해요.', 'editor:content'),
  geo_author: G('작성 주체 표시가 없어요', '"OO가 운영합니다" 한 줄이면 충분해요.', 'AI가 출처를 신뢰해 인용률이 올라가요.', 'editor:content'),
  geo_empty_page: G('빈 페이지가 있어요', '내용 없는 페이지에 소개나 항목을 채워주세요.', '모든 페이지가 검색 대상이 돼요.', 'editor:content'),
  geo_lang: G('언어 설정이 없어요', AUTO, '한국어 페이지로 정확히 인식돼요.', 'system'),
};

/** guidance 조회 — 미매핑 코드는 undefined(테스트가 누락 0을 강제하므로 실사용엔 항상 존재) */
export function guidanceFor(code: string): ScanGuidance | undefined {
  return SCAN_GUIDANCE[code];
}

/** 전 scan 규칙 코드 목록 (guidance 완전성 테스트·전수 검증용) */
export function allScanCodes(): string[] {
  return [...SEO_RULES, ...AEO_RULES, ...GEO_RULES].map((r) => r.code);
}
