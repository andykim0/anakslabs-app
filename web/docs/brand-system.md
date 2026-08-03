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

- Ice White `#F8FBFF`: 무료 진단과 주요 배경
- White `#FFFFFF`: 입력·카드 표면
- Deep Navy `#0B1736`: 헤딩·푸터·고대비 텍스트
- Royal Blue `#174DDA`: 검색 신호·주 CTA 시작색
- Cyan `#08B8E8`: 답변 신호·CTA 중간색
- Signal Mint `#03D1B8`: AI 인용 신호·완료 상태
- Slate `#667085`: 보조 텍스트

밝은 표면이 화면의 80% 이상을 차지하도록 한다. 딥네이비는 텍스트와 푸터에 제한하고, 블루→시안→민트 그라데이션은 로고·CTA·신호 경로처럼 의미 있는 지점에만 쓴다.

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

- `public/anakslabs-mark.svg`: 정사각형 심벌, 앱 아이콘·파비콘·워터마크
- `public/anakslabs-logo.svg`: 밝은 배경용 영문 락업
- `src/components/brand/BrandLogo.tsx`: 제품 UI용 반응형 락업
- 심벌 최소 크기는 디지털 24px이다.
- 그라데이션 순서(blue → cyan → mint), 프레임 비율, 신호 경로를 임의로 바꾸지 않는다.
