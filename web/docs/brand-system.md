# Anaks Labs brand system

## Brand architecture

- **Product:** Anaks Labs
- **Maker / operator:** Anaks Labs (아낙스랩스)
- 고객 접점의 주 브랜드는 항상 `Anaks Labs`이다. Anaks Labs는 푸터·회사소개·약관의 제작사/운영사 표기로만 사용한다.

## Position

**Category:** 홈페이지 전문 최적화 AI

**Promise:** 검색과 AI가 읽을 수 있게, Anaks Labs.

**Product truth:** 업종별 구조를 설계하고, SEO·AEO·GEO 기반을 생성 기본값으로 넣어, 편집과 호스팅까지 한 제품에서 제공한다.

Anaks Labs은 범용 웹 빌더처럼 사용자가 빈 캔버스와 설정을 모두 책임지는 제품도, 결과물을 넘긴 뒤 수정 때마다 다시 의뢰해야 하는 전통 제작대행도 아니다. 비개발자 사업자를 위해 **전문가의 홈페이지 제작 흐름을 제품화한 관리형 AI SaaS**로 포지셔닝한다.

## Message hierarchy

1. 내 홈페이지, 검색과 AI가 제대로 읽고 있을까요?
2. 주소 하나로 무료 SEO·AEO·GEO 진단.
3. 검색과 AI가 읽을 수 있게, Anaks Labs.
4. 업종 설계 → 디자인 3안 → 캔버스 편집 → 최적화 → 호스팅.

순위·노출·AI 인용을 보장하지 않는다. 항상 “읽을 수 있는 구조”, “인용하기 쉬운 기반”, “생성 기본값”으로 표현한다.

## Visual system

단일 진실은 마케팅 사이트 `../../website/assets/site.css` 의 토큰이다. 앱은 그 값을 그대로 쓴다.

- BG `#F6F7F9`: 앱·문서의 기본 배경
- White `#FFFFFF`: 입력·카드 표면
- Ink `#141A3A`: 헤딩·푸터·고대비 텍스트
- Ink-2 `#232C52`: 보조 헤딩·중간 대비 텍스트
- Blue `#2D63F0`: 주 CTA·링크·활성 상태
- Blue Bright `#2F6BFF`: 주 CTA hover
- Blue Soft `#4D7CFF`: 보조 신호·그라데이션 중간색
- Gray `#545C70` / Gray Soft `#6A7286`: 보조 텍스트
- Line `#DFE1E6` / `#D9DAE0`: 구분선·컨트롤 테두리

파생값(앱 전용): 진한 파랑 `#1E4BD1`(hover/pressed), 파랑 틴트 `#EAEFFE`(칩·활성 배경).

밝은 표면이 화면의 80% 이상을 차지하도록 한다. Ink는 텍스트와 푸터에 제한한다. 그라데이션은 파랑 계열 안에서만 쓴다 — **블루→시안→민트 그라데이션은 폐기됐다**(이전 팔레트 잔재). 성공/경고/오류는 브랜드색이 아니라 상태색으로 따로 유지한다.

## Motion system

- 얇은 스캔 라인, 순차 점등 노드, 상태 전환을 기본 모션 문법으로 사용한다.
- 히어로 3D 신호 필름은 Anaks Labs 전용 신규 Gemini 시작 프레임에서 Veo 3.1 Fast image-to-video로 생성한 8초 원본을 사용한다. Anaks Labs 기존 브랜드 영상은 재사용하지 않는다.
- 공개 자산 `anakslabs-visibility-film.mp4`와 `anakslabs-visibility-film.webm`은 원본 해상도를 유지한 무음 1080p(1920×1080) 파생본이다.
- `prefers-reduced-motion`과 모바일에서는 `anakslabs-visibility-film-poster.webp`만 표시한다.
- 영상은 뷰포트 근접 시에만 로드하고, 화면 밖에서는 일시 정지한다.

## Competitive frame

| | 범용 빌더(아임웹 등) | 제작대행사 | Anaks Labs |
|---|---|---|---|
| 강점 | 쇼핑·예약 등 폭넓은 운영 도구 | 사람 중심의 맞춤 기획 | 업종 홈페이지 최적화의 제품화 |
| 시작 | 템플릿/AI 결과를 사용자가 조립 | 상담·견적·제작 | 질문 응답 후 구조와 3안 생성 |
| 검색·AI | 제공 기능과 가이드를 사용자가 설정·운영 | 계약 범위와 업체 역량에 따라 다름 | SEO·AEO·GEO 구조가 생성 기본값 |
| 오픈 후 | 사용자가 직접 운영 | 수정 요청 또는 유지보수 계약 | 직접 편집 + 월 관리 + 편집 크레딧 |

경쟁사의 기능 부재를 주장하지 않는다. 차별점은 개별 기능이 아니라 **최적화가 처음부터 적용되는 제작·운영 방식**이다.

## Logo usage

로고에 **벡터 원본은 존재하지 않는다.** 마케팅 사이트(anakslabs.com)도 PNG 를 쓴다. 앱은
`../../website/assets` 의 PNG 를 그대로 복사해 쓴다 — 재작도·재색상 금지.

- `public/anakslabs-mark.png` (= `assets/icon-512.png`): AL 심벌. 앱 아이콘·워터마크
- `public/anakslabs-logo.png` (= `assets/logo-inline.png`): 심벌 위 워드마크가 얹힌 세로 락업
- `src/app/icon.png` · `src/app/apple-icon.png` · `src/app/favicon.ico`: 파비콘/앱 아이콘.
  favicon.ico 는 심벌을 16/32/48 로 담은 멀티사이즈 아이콘이며, 테넌트 라이브
  (`app/s/[domain]/_shared.tsx`)와 Export 셸(`lib/export/document-shell.ts`)이 이걸 참조한다.
- `BrandLogo` (`src/components/brand/BrandLogo.tsx`): 제품 UI 락업 = 심벌 PNG + Space Grotesk
  워드마크. 세로 락업 PNG 는 헤더 높이(28px)에서 워드마크가 판독 불가라 가로로 재조합한다.
- `BrandLockup`: 세로 락업 PNG 를 그대로 렌더한다(세로 여백이 있는 표면용).
- 심벌 최소 크기는 디지털 24px이다.
- 청록 그라데이션 인라인 마크와 그 SVG 복제본(`anakslabs-*.svg`, `app/icon.svg`)은 제거됐다.

## Typography

- 앱·마케팅 공통 서체는 **Space Grotesk**(마케팅 `--sans`)이며, 폴백은
  `"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", Roboto, Helvetica, Arial, sans-serif`.
- 적용 경계: `src/app/app-typography.ts` 를 (auth)·(dashboard)·(admin)·(marketing) 라우트
  그룹 레이아웃만 import 한다. `globals.css` 의 `body` 규칙과 `root-layout-contract.ts` 의
  `--font-geist-*` 는 테넌트/공유 프리뷰 문서와의 공유 계약이므로 **바꾸지 않는다** —
  고객 사이트는 각자의 AI 생성 테마 폰트로 렌더돼야 한다.
