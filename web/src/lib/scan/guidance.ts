/**
 * 발행 전 진단 가이드 — 모든 scan 이슈를 고객 언어의 실행 가능한 코칭으로 매핑한다.
 * 카피는 검색 노출이나 AI 인용을 보장하지 않고, 실제로 개선되는 해석·수집·접근 조건만 설명한다.
 */
import { ALL_SCAN_RULES } from './rule-registry';

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
  /** 단순 고객 정보 부재는 오류 대신 채우면 만점이 되는 항목으로 안내한다. */
  presentation?: 'input-to-perfect';
}

const G = (
  title: string,
  action: string,
  effect: string,
  anchor: GuidanceAnchor,
  presentation?: ScanGuidance['presentation'],
): ScanGuidance => ({
  title,
  action,
  effect,
  anchor,
  ...(presentation ? { presentation } : {}),
});

const AUTO = '발행하면 자동으로 처리돼요 — 따로 하실 일은 없어요.';

export const SCAN_GUIDANCE: Record<string, ScanGuidance> = {
  // ---------- SEO ----------
  seo_http_status: G('페이지 응답 상태를 확인해야 해요', '오류·로그인·소프트 404 대신 실제 페이지가 2xx로 열리게 해주세요.', '검색로봇이 정상 문서와 오류 화면을 구분할 수 있어요.', 'system'),
  seo_html_response: G('웹문서 형식으로 응답하지 않아요', '공개 페이지가 HTML 문서로 응답하도록 서버 설정을 확인해주세요.', '네이버·구글이 일반 웹페이지로 해석할 수 있어요.', 'system'),
  seo_html_truncated: G('초기 HTML이 지나치게 커요', '중복 마크업과 큰 인라인 데이터를 줄여주세요.', '검색로봇과 사용자가 핵심 본문을 더 효율적으로 읽을 수 있어요.', 'editor:content'),
  seo_client_rendered_content: G('브라우저가 실행된 뒤 본문이 나타나는 사이트로 보여요', '현재 점수는 서버가 처음 보낸 HTML 기준으로만 해석해주세요.', '진단 범위 밖의 자바스크립트 본문 때문에 실제보다 낮게 나온 점수를 구분할 수 있어요.', 'system'),
  seo_soft_404: G('오류 화면이 200 상태로 열리고 있어요', '없는 URL은 실제 404 또는 410 상태로 응답하게 해주세요.', '검색엔진이 정상 콘텐츠와 없는 페이지를 정확히 구분할 수 있어요.', 'system'),
  seo_noindex: G('검색 제외(noindex)가 켜져 있어요', '공개할 페이지라면 meta robots와 X-Robots-Tag에서 noindex를 제거해주세요.', '검색엔진이 색인 대상으로 검토할 수 있어요.', 'system'),
  seo_googlebot_blocked: G('Googlebot 수집이 막혀 있어요', 'robots.txt에서 공개 페이지의 Googlebot 차단을 해제해주세요.', 'Google 검색과 생성형 검색 기능이 페이지를 수집할 수 있어요.', 'system'),
  seo_naver_yeti_blocked: G('네이버 Yeti 수집이 막혀 있어요', 'robots.txt에서 공개 페이지의 Yeti 차단을 해제해주세요.', '네이버가 페이지를 수집하고 색인 여부를 판단할 수 있어요.', 'system'),
  seo_daum_blocked: G('다음 검색 수집이 막혀 있어요', 'robots.txt에서 공개 페이지의 Daum 차단을 해제해주세요.', '다음 검색이 페이지를 수집하고 반영 여부를 판단할 수 있어요.', 'system'),
  seo_bingbot_blocked: G('Bingbot 수집이 막혀 있어요', 'robots.txt에서 공개 페이지의 Bingbot 차단을 해제해주세요.', 'Bing 검색과 Copilot의 검색 기반이 페이지를 수집할 수 있어요.', 'system'),
  seo_title_missing: G('페이지 제목이 비어 있어요', '브랜드와 페이지 주제를 구분되는 제목으로 넣어주세요.', '검색엔진이 대표 주제를 더 명확히 파악해요.', 'editor:meta'),
  seo_title_multiple: G('페이지 제목이 여러 개예요', '문서마다 title 요소를 하나만 남겨주세요.', '대표 제목을 둘러싼 해석 충돌을 줄일 수 있어요.', 'system'),
  seo_title_length: G('제목 길이를 다듬을 필요가 있어요', '핵심 주제를 앞에 두고 불필요한 반복을 줄여주세요.', '검색결과에서 제목이 과도하게 축약될 가능성을 줄여요.', 'editor:meta'),
  seo_meta_description: G('검색 설명이 비어 있어요', '이 페이지만의 내용과 이용 가치를 한두 문장으로 요약해주세요.', '검색엔진이 더 적절한 설명 후보를 확보해요.', 'editor:meta'),
  seo_h1: G('대표 제목(H1) 구조를 확인해야 해요', '페이지의 대표 제목을 H1 하나로 표시해주세요.', '네이버·구글이 본문의 중심 주제를 구분하기 쉬워져요.', 'editor:content'),
  seo_canonical: G('대표 주소(canonical)가 없어요', AUTO, '중복 주소가 생겨도 대표 URL을 명시할 수 있어요.', 'system'),
  seo_canonical_invalid: G('대표 주소가 현재 페이지와 맞지 않아요', AUTO, '다른 호스트나 fragment로 신호가 잘못 합쳐지는 일을 막아요.', 'system'),
  seo_og: G('공유 미리보기 정보가 불완전해요', '페이지 제목·설명과 대표 이미지를 채워주세요.', '카카오톡 등에서 공유 문맥을 더 정확히 보여줄 수 있어요.', 'editor:images'),
  seo_img_alt: G('alt 속성이 빠진 이미지가 많아요', '내용을 전달하는 사진에 짧고 구체적인 설명을 달아주세요.', '검색엔진과 보조기기가 이미지 의미를 이해하기 쉬워져요.', 'editor:images'),
  seo_https: G('보안 연결(HTTPS)이 필요해요', AUTO, '사용자와 검색로봇이 암호화된 연결로 페이지를 열 수 있어요.', 'system'),
  seo_viewport: G('모바일 화면 설정이 없어요', AUTO, '휴대폰에서 읽고 조작하기 쉬운 화면으로 표시돼요.', 'system'),
  seo_korean_encoding: G('한글 인코딩 선언이 불명확해요', AUTO, '네이버와 브라우저에서 한글이 깨질 위험을 줄여요.', 'system'),
  seo_hash_navigation: G('해시 기반 페이지 주소가 있어요', '독립 콘텐츠는 # 대신 실제 경로와 일반 링크로 연결해주세요.', '네이버가 각 콘텐츠를 별도 URL로 발견하기 쉬워져요.', 'editor:content'),
  seo_robots_txt: G('크롤러 안내(robots.txt)를 확인할 수 없어요', AUTO, '검색·AI 크롤러 정책과 사이트맵 위치를 한곳에서 안내할 수 있어요.', 'system'),
  seo_robots_temporarily_unavailable: G('크롤러 안내를 잠시 확인할 수 없어요', '서버가 바쁘거나 요청을 제한한 상태일 수 있어요. 잠시 뒤 다시 진단해주세요.', '일시 오류와 실제 차단을 구분해서 확인할 수 있어요.', 'system'),
  seo_robots_invalid: G('robots.txt 형식이 올바르지 않아요', AUTO, '오류 페이지를 정책 파일로 오해하는 상황을 막아요.', 'system'),
  seo_robots_sitemap: G('robots.txt에 사이트맵 위치가 없어요', AUTO, '네이버·구글·빙이 사이트맵을 더 쉽게 찾을 수 있어요.', 'system'),
  seo_sitemap: G('사이트맵을 확인할 수 없어요', AUTO, '대표 페이지와 수정 시점을 검색엔진에 전달할 수 있어요.', 'system'),
  seo_sitemap_invalid: G('사이트맵 형식이 올바르지 않아요', AUTO, '검색엔진이 URL 목록을 실제 사이트맵으로 읽을 수 있어요.', 'system'),
  seo_speed_slow: G('서버 첫 응답이 조금 느려요', '큰 이미지·동영상과 서버 처리 시간을 점검해주세요.', '사용자와 검색로봇의 대기 시간을 줄일 수 있어요.', 'editor:images'),
  seo_speed_very_slow: G('서버 첫 응답이 많이 느려요', '서버 병목과 초기 콘텐츠 자산을 우선 점검해주세요.', '시간 초과와 방문자 이탈 위험을 낮출 수 있어요.', 'editor:images'),
  seo_favicon: G('탭 아이콘이 없어요', '브랜드 로고를 파비콘으로 등록해주세요.', '브라우저 탭과 일부 검색 화면에서 사이트를 식별하기 쉬워져요.', 'editor:images'),
  // ---------- AEO (AI 답변 엔진 최적화) ----------
  aeo_jsonld_missing: G('구조화 정보(JSON-LD)가 없어요', AUTO, '검색·답변 시스템이 엔티티와 페이지 관계를 덜 추측하게 돼요.', 'system'),
  aeo_jsonld_invalid: G('구조화 정보 문법이 깨져 있어요', AUTO, '검색엔진이 JSON-LD 전체를 정상적으로 읽을 수 있어요.', 'system'),
  aeo_jsonld_type: G('페이지 의미를 설명하는 타입이 부족해요', AUTO, '업체·인물·페이지·상품의 역할을 더 분명히 전달해요.', 'system'),
  aeo_entity_identity: G('운영 주체 정보가 불완전해요', '공식 이름과 URL을 확인해주세요.', '브랜드·업체·인물을 하나의 엔티티로 연결하기 쉬워져요.', 'editor:business-info'),
  aeo_jsonld_visibility: G('구조화 정보와 화면 내용이 달라요', '이름·전화·주소가 화면과 JSON-LD에서 같은 값인지 확인해주세요.', '검색엔진과 사용자가 동일한 업체 정보를 확인할 수 있어요.', 'editor:business-info'),
  aeo_local_business_details: G(
    '주소와 전화번호를 입력하면 이 항목이 만점이 돼요',
    '사장님이 확인한 실제 주소와 전화번호를 입력해주세요.',
    '네이버·구글이 매장 정보를 교차 확인하기 쉬워져요.',
    'editor:business-info',
    'input-to-perfect',
  ),
  aeo_heading_order: G('제목 순서가 뒤섞였어요', '대표 제목 아래에 큰 주제→세부 주제 순서로 정리해주세요.', '질문과 답변의 문맥 경계를 파악하기 쉬워져요.', 'editor:content'),
  aeo_question_headings: G('FAQ 질문 경계가 불명확해요', '각 질문을 소제목으로 표시하고 바로 아래에 답을 적어주세요.', '답변 시스템이 질문별 내용을 정확히 분리하기 쉬워져요.', 'editor:content'),
  aeo_main_landmark: G('본문 영역 표시가 없어요', AUTO, '검색 에이전트와 스크린리더가 핵심 본문을 찾기 쉬워져요.', 'system'),
  aeo_semantic_structure: G('문서 구역 구조가 약해요', '섹션마다 제목과 의미에 맞는 구역을 사용해주세요.', '반복 메뉴와 핵심 내용을 구분하기 쉬워져요.', 'editor:content'),
  aeo_lists_tables: G('목록형 정보가 문장으로만 이어져 있어요', '가격·메뉴·절차·비교를 목록이나 표로 정리해주세요.', '항목과 순서를 빠뜨리지 않고 발췌하기 쉬워져요.', 'editor:content'),
  aeo_accessible_controls: G('이름 없는 버튼이나 입력 요소가 있어요', AUTO, '사람과 ARIA 기반 브라우징 에이전트가 조작 목적을 이해할 수 있어요.', 'system'),
  aeo_breadcrumb: G('하위 페이지의 위치 안내가 없어요', AUTO, '사용자와 검색엔진이 사이트 안의 페이지 관계를 이해하기 쉬워져요.', 'system'),
  // ---------- GEO (생성형 AI 인용 최적화) ----------
  geo_oai_search_blocked: G('ChatGPT 검색 크롤러가 막혀 있어요', 'robots.txt에서 OAI-SearchBot의 공개 페이지 접근을 허용해주세요.', 'ChatGPT 검색이 페이지를 검색·요약 대상으로 검토할 수 있어요.', 'system'),
  geo_perplexity_blocked: G('Perplexity 검색 크롤러가 막혀 있어요', 'robots.txt에서 PerplexityBot의 공개 페이지 접근을 허용해주세요.', 'Perplexity가 페이지를 검색·인용 대상으로 검토할 수 있어요.', 'system'),
  geo_snippet_restricted: G('검색 요약과 본문 발췌가 막혀 있어요', '공개 페이지의 nosnippet·max-snippet:0·noindex 설정을 확인해주세요.', '검색결과와 생성형 검색이 허용된 범위에서 본문을 사용할 수 있어요.', 'system'),
  geo_naver_sourceinfo_disabled: G('네이버 AI 출처 설명이 꺼져 있어요', 'AI 출처 설명을 원한다면 robots meta의 nosourceinfo를 제거해주세요.', '네이버가 허용된 화면에서 페이지를 출처로 설명할 수 있어요.', 'system'),
  geo_no_text: G('읽을 본문 텍스트가 거의 없어요', '서비스·제품·절차·이용 정보를 실제 텍스트로 채워주세요.', '검색·답변 시스템이 요약하고 확인할 근거가 생겨요.', 'editor:content'),
  geo_low_text_ratio: G('핵심 설명이 마크업에 묻혀 있어요', '첫 화면과 주요 섹션에 구체적인 설명을 보강해주세요.', '페이지의 중심 정보와 근거를 찾기 쉬워져요.', 'editor:content'),
  geo_business_info: G(
    '주소와 전화번호를 입력하면 이 항목이 만점이 돼요',
    '실제 전화번호와 도로명 주소를 같은 표기로 입력해주세요.',
    '매장 질문에 답할 수 있는 확인 가능한 근거가 생겨요.',
    'editor:business-info',
    'input-to-perfect',
  ),
  geo_dates: G(
    '작성일과 수정일을 입력하면 이 항목이 만점이 돼요',
    '기사·가이드의 실제 작성일과 수정일을 입력해주세요.',
    '사용자와 답변 시스템이 최신성을 판단할 수 있어요.',
    'editor:content',
    'input-to-perfect',
  ),
  geo_lang: G('언어 설정이 없어요', AUTO, '한국어 문서와 지역 문맥을 더 정확히 구분할 수 있어요.', 'system'),
  geo_korean_lang_mismatch: G('본문과 언어 설정이 맞지 않아요', AUTO, '한국어 검색·음성·답변 처리의 언어 신호가 일치해요.', 'system'),
  geo_author: G(
    '작성자나 검토자를 입력하면 이 항목이 만점이 돼요',
    '실제 작성자 또는 검토자와 관련 경험을 입력해주세요.',
    '독자가 정보의 출처와 책임을 확인할 수 있어요.',
    'editor:content',
    'input-to-perfect',
  ),
  geo_channel_identity: G('공식 채널이 엔티티와 연결되지 않았어요', AUTO, '네이버·카카오·SNS 채널을 같은 공식 주체로 해석하기 쉬워져요.', 'system'),
  geo_unsourced_claims: G('수치·연구 주장에 출처가 없어요', '원문 링크와 발행 주체·기준 날짜를 함께 표시해주세요.', '사람과 생성형 검색이 주장을 검증하고 정확히 인용하기 쉬워져요.', 'editor:content'),
  geo_topic_alignment: G('페이지 제목과 대표 제목의 주제가 달라요', 'title과 H1이 같은 핵심 주제를 설명하도록 다듬어주세요.', '페이지의 대표 질문과 답을 일관되게 해석할 수 있어요.', 'editor:meta'),
  geo_empty_page: G('페이지가 사실상 비어 있어요', '고유한 설명·항목·근거가 없는 페이지는 내용을 채우거나 공개하지 마세요.', '검색 대상 페이지의 품질과 주제 집중도를 유지할 수 있어요.', 'editor:content'),
};

/** guidance 조회 — 미매핑 코드는 undefined(테스트가 누락 0을 강제하므로 실사용엔 항상 존재) */
export function guidanceFor(code: string): ScanGuidance | undefined {
  return SCAN_GUIDANCE[code];
}

/** 전 scan 규칙 코드 목록 (guidance 완전성 테스트·전수 검증용) */
export function allScanCodes(): string[] {
  return ALL_SCAN_RULES.map((rule) => rule.code);
}
