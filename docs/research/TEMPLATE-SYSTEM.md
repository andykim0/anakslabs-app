# TEMPLATE-SYSTEM — 구조 10종 × 시각 계열 × 팔레트 슬롯 × 모션 규약

**층 분담을 확정한다.**

| 층 | 소스 | 근거 문서 |
|---|---|---|
| **구조** — 어떤 섹션을 어떤 순서로 | **7월 조사** (KR 42곳 / 구성코드 19곳 + US 26곳) | `survey-2026-07/kr-survey/clinic-type-crosstab.md` · `kr-survey/kr-crosstab.md` · `us-survey/us-crosstab.md` · `us-survey/type-taxonomy.md` · `us-survey/variant-axes.md` |
| **시각** — 토큰·타이포·반응형 | **2026 프로덕션 학습** (16곳) | `DEMO-STYLE-LEARNING.md` 1부 |
| **모션** — 리빌·스크롤·진입 | **7월 리빌 실측(런타임)** + **2026 소스 CSS/JS(정적)** | `survey-2026-07/reveal-measurement-spec.md` · 두 crosstab의 `리빌(px/ms)` 열 · 본 문서 §5 |
| **팔레트** | **클리닉별 추출** | 본 문서 §2 |

구조는 7월 조사에서만 끌어온다. 코퍼스(79곳)에서 새로 캐지 않는다.
**모션 수치는 런타임 실측(7월) > 정적 CSS 추출(2026) 순으로 우선한다** — 정적 추출은 JS가 인라인으로 넣는 값을 못 본다.

---

## 0. 먼저 — 내 앞선 초안의 오류 세 건을 정정한다

### 0-1. 코퍼스 정규식 집계 오류 2건

클래스명 패턴(`accordion|faq|toggle`)으로 센 값이라 실제 섹션 보유와 다르다. 7월 조사는 홈 구성을 사람이 코드화한 것이므로 **그쪽이 정본**이다.

| 항목 | 내 코퍼스 정규식 | 7월 조사 실측 | 귀결 |
|---|---|---|---|
| FAQ | 69% | **KR 0/42 (0%)** · US 6/26, 치과 5/11 · **정형 0/8** | T9를 **US 치과 전용**으로 강등 |
| 전후사진 | 46% | KR 성형 **10/12 83%** · **피부과 0/5 0%** / US 치과 2/11 · 정형 0/8 · 에스테틱 0/7 | T10 대상에서 **피부과를 뺀다** |

### 0-2. ★ FAQ 배제 규칙은 7월 리더 판정과 정면 충돌했다 — 조사 쪽으로 되돌린다

앞 초안에 **"KR 대상 템플릿에 `faq`를 기본으로 넣지 않는다"**고 썼는데, 7월 조사는 정반대를 이미 판정해 뒀다.

> `clinic-type-crosstab.md` :121 — *"「축이 아님」은 측정 판정이고 제품 결정은 별개다. 42/42 부재는 「넣지 말라」가 아니라 「아무도 안 한다」이다. **리더 판정: FAQ는 축이 아니라 전 변주 공통 탑재.**"*
> `variant-axes.md` :146 — *"FAQ 생략 … 관행은 '안 둔다'지만 FAQ는 AI 인용에 가장 유리. **축으로 켜고 끄지 말고 전 안에 상시 포함**"*
> `variant-axes.md` :165 (엔진 인터페이스 고정값) — *"`booking`(26/26) · `hero` 시작(26/26) · 후기(22/26) **+ FAQ 상시 포함(관행 역행, 의도적)**"*

**정정**: FAQ는 **전 템플릿 상시 포함**이다(관행 역행을 의도한 결정). 0/42는 "빼라"가 아니라 "차별화 여지"였다.
단 **배치는 다르다** — US 실측에서 FAQ의 정규화 위치는 **0.82(거의 끝)**이고 5곳 중 2곳은 최종 블록이다. 따라서 **"상시 포함하되 하단에"**가 조사와 정합하는 형태이며, T9의 이름이 가리키던 *FAQ 선행*은 실측에 어긋난다 → **T9를 `FAQ-closer`로 개명**했다(§3).

### 0-3. 규모축 관련 표현 정정

`location` 규모축은 **US 안에서는 통과**했고(`us-crosstab.md` §3.3 — 네트워크분원 8/10 vs 단일원장 2/6, 치과·정형이 각각 독립적으로 4/5), **KR에서 완전 역전돼 범시장 축으로만 기각**됐다(`variant-axes.md` §1.3). 앞 초안의 "7월에 기각됐다"는 반쪽이다. **US 한정 템플릿(T7·T8)에서는 근거로 쓸 수 있다.**

---

## 1. 7월 조사에서 가져오는 구조 규칙

### 1-1. 시장상수 — 축이 아니라 고정값 (US n=26)

| 항목 | 수치 | 전 템플릿 적용 |
|---|---|---|
| **예약·상담 블록 보유** | **26/26 (100%)** | 필수. 예외 없음 |
| **`hero`로 시작** | **26/26 (100%)** | 필수. 모든 템플릿의 첫 블록은 hero |
| 후기/신뢰 블록 | 22/26 (85%) | 기본 포함, 유형별로 반복 횟수만 조절 |
| 모션 보유 | 21/26 (81%) | 허용 — §5 규약 안에서 |
| 히어로 슬라이드 | **4/26 (15%)** | **기본값에서 제외** |
| 히어로 내 스탯 배지 | **2/26 (8%)** | 기본값에서 제외 |
| **FAQ** | 6/26 (US) · **0/42 (KR)** | **관행 역행으로 상시 포함** (§0-2) |

> 앞서 내가 "2026 소스 16곳에 슬라이더 0곳"이라고 적었는데, 더 정확한 수치는 **US 26곳 중 4곳(15%)**이다. 소수지만 0은 아니다.

**주의 — 「보유 100%」와 「마지막에 둔다」는 다르다.** 예약 블록은 26/26이 갖지만 **`booking`으로 닫는 곳은 11/26(42%)**뿐이다. 닫는 블록은 `variant-axes.md` 축5에서 **`R 4:4 · S 9:9` 정확히 반반**으로 관측된 자유 축이다. 템플릿이 전부 booking으로 끝나면 안 된다.

### 1-2. ★ 섹션 순서 법칙 (신규 집계 — 구성 코드 전문에서 산출)

두 조사의 구성 코드를 파싱해 각 토큰의 **정규화 위치**(0=첫 블록, 1=마지막 블록) 평균을 냈다. 새 관측이 아니라 기존 코드의 재집계다.

**US (n=26, 총 249토큰)** — 6개 밴드로 갈린다.

| 밴드 | 위치 | 토큰 (출현수) |
|---|---|---|
| 1 | 0.01 | `hero` (26) |
| 2 | 0.30 | `about` (29) |
| 3 | 0.43~0.47 | `providers` (15) · `services` (32) · `trust` (15) |
| 4 | 0.56~0.61 | `videos` (8) · `gallery` (12) · `reviews` (21) |
| 5 | 0.72~0.75 | `events` (3) · `insurance` (8) |
| 6 | 0.81~0.82 | `location` (12) · `faq` (6) · `booking` (19) |

- **`hero` 다음 블록 최빈은 `about` 11/26 (42%)** — `services`가 아니다.
- **`reviews`는 `booking`보다 앞** — 둘 다 가진 16곳 중 13곳(81%).
- `services` vs `providers` 선후는 갈린다(7:5). **단 단일원장은 `providers`가 앞선다**(§3 T8).
- 닫는 블록: `booking` 11 · `location` 4 · `other` 4 · `faq` 2 · `videos` 2. **정형외과만 `location` 3 : `booking` 3 동률.**

**KR (n=19, 구성 코드 보유분)** — 밴드 구조가 US와 다르다.

| 위치 | 토큰 |
|---|---|
| 0.00 | `hero` |
| 0.40~0.46 | `events` · `videos` · `services` · `providers` · `beforeafter` |
| 0.53~0.59 | `reviews` · `trust` · `gallery` · `about` |
| 0.67 | `booking` |
| **0.94** | **`location`** |

### 1-3. ★ KR / US 구조 분기 4건 — 코드에 넣어야 한다

| 항목 | US (n=26) | KR (n=19 코드 / 42 보유) | 구현 귀결 |
|---|---|---|---|
| **`about` 위치** | **0.30** — hero 직후가 최빈(11/26) | **0.59** — 후반부 | KR 템플릿에서 회사소개를 2번째로 올리지 마라 |
| **닫는 블록** | `booking` 11/26 | **`location` 12/19** (꼬리 `other` 1개 제거 후) | KR은 **오시는 길로 닫는다** |
| **hero 다음** | `about` 11/26 | **`other` 6/19** (퀵메뉴·검색상담바·브랜드 비주얼) | KR은 hero 직후 유틸/브랜드 밴드가 관행 |
| **예약 노출 형태** | 상단 고정 가로바 우세 · 모바일 하단 13/26 | **우측 세로스택 퀵메뉴 12/19 · 플로팅 CTA 보유 15/19(79%)** | KR은 예약을 섹션이 아니라 **상시 플로팅**으로 둔다 |

`faq`·`insurance`도 시장차가 크다(KR `faq` 0/42 · `insurance` 1/42). 다만 §0-2에 따라 FAQ는 두 시장 모두 상시 포함하고, `insurance`는 **US 전용**으로 둔다(KR 1/42 + 의료광고 규제 미확인).

### 1-4. 축 1 — R/S 유형군 (US 전용, 분리 정확도 11/11)

`t` = 구성 코드의 `trust` + `reviews` 토큰 수(푸터 `other` 1개 제거 후). `t≥2 → R` · `t≤1 → S`.

- **R 신뢰반복형** (US 8/26) — 신뢰 블록을 페이지 전체에 2회 이상 분산. **길게 설득.** 실측 블록수 **8~18, 중앙 11.5**
- **S 단일경로형** (US 18/26) — 신뢰 블록 0~1회. **한 번에 훑게.** 실측 블록수 **5~14, 중앙 8.5**

주의: R/S는 "후기 보유량"이 아니라 **"독립 섹션으로 몇 번 반복했나"**다. US 후기 실측 보유는 22곳인데 `t≥2`는 8곳뿐이다. **KR에는 적용 불가**(`reviews` 토큰 3/19 vs 실측 13/19, 괴리 +10).

**전체 블록수 실측 하한은 5다**(seancallowaymd). 4블록 이하는 관측 범위 밖이므로 템플릿 하한을 5로 잡는다.

### 1-5. 축 2 — 갤러리 유/무 (US 전용, 조건부)

`gallery`/`beforeafter` 보유 여부. **치과에서만 다수**(7/11), 정형외과 **8곳 전부 0**, 에스테틱 1/7. KR은 의료광고 규제 확인이 선행돼야 하므로 미적용.

### 1-6. 유형별 섹션 계획 (KR n=42 · US n=26)

**KR 분기 축 7종**(격차 ≥40%p): `beforeafter` 83%p · `reviews` 80%p · `videos` 75%p · `events` 58%p · `gallery` 42%p · `services` 40%p · `providers` 40%p

| 진료 유형 | 앞세우는 것 | 넣지 않는 것 | 근거 |
|---|---|---|---|
| **성형외과** (KR n=12) | `beforeafter` 83% · `videos` 75% · `events` 58% | — | KR crosstab |
| **치과** (KR n=5 / US n=11) | `reviews` 80%(KR)·9/11(US) · `trust` 80% · `gallery` 7/11(US) · `faq` 5/11(US) | **`providers` KR 0/5** | 양쪽 |
| **피부과** (KR n=5) | `services` **5/5 100%** | **`beforeafter` 0/5** · **`reviews` 0/5** | KR crosstab |
| **정형외과** (US n=8) | `location` 6/8 · `reviews` 6/8 | **`faq` 0/8** · **`gallery` 0/8** · **`beforeafter` 0/8** | US crosstab |
| **에스테틱** (US n=7) | **의료진 7/7 100%**(`providers` 토큰 6/7) · `videos` 5/7 · `trust` 8회 | **`location` 0/7** | US crosstab |
| 한의원 (KR n=3) | — | `videos`·`events`·`gallery` 전부 0 | n≤3, 사례로만 |

**표본 표기 의무** — 위 수치는 *"디자인 라운드업에 실린 US 병원 26곳 / KR 42곳의 관행 (성과·전환 미검증)"*이다. "US 병원 사이트의 관행"이라고 쓰면 안 된다.

### 1-7. 축으로 쓰면 안 되는 5항목 (`variant-axes.md` §5.1) — 전 템플릿 금지

1. 히어로 헤드라인을 **이미지로 렌더**(1/26) — H1이 사라져 검색·AI가 주제문을 못 읽는다
2. **DOM 대량 은닉 텍스트**(1/26 — 표시 8.2화면 vs DOM 133,581자)
3. **캐러셀에 콘텐츠 매장** — 2번째 이후 슬라이드는 비노출
4. **FAQ 생략** — §0-2에 따라 상시 포함
5. **진입 모달·전면 팝업**(최소 4곳) — 자동 판독기를 실제로 막았다

---

## 2. 팔레트 슬롯 계약과 추출 규약

### 2-1. 슬롯 7개

모든 템플릿은 아래만 참조한다. 그 외 색 하드코딩 금지. 그림자·보더는 `--ink` 알파 변형으로만.

| 슬롯 | 역할 | 대비 요구 |
|---|---|---|
| `--brand` | 주조 — 로고·주요 CTA | 배경 대비 4.5:1 |
| `--brand-ink` | `--brand` 위 텍스트 | 자동(흑/백 중 대비 큰 쪽) |
| `--accent` | 링크·활성·통계 | 배경 대비 3:1 |
| `--surface` | 페이지 배경 | — |
| `--surface-2` | 카드·교대 배경 | `--surface`와 ΔL 3~8 |
| `--ink` | 본문 | 배경 대비 12:1 |
| `--ink-muted` | 보조 텍스트 | 배경 대비 4.5:1 |

### 2-2. 추출 우선순위

1. **로고 색**(SVG `fill`/`stop-color`, 래스터는 배경 제외 최빈 클러스터) — 브랜드가 의도적으로 고른 유일한 색이라 신뢰도 최상
2. 주요 CTA 버튼 배경색 → 3. 본문 링크 색 → 4. 헤딩 색(무채 아닐 때) → 5. `<meta name="theme-color">` / manifest `theme_color`

`--surface`는 `body` 배경에서 뽑되 **명도 0.92 미만이면 화이트로 강제**한다.

### 2-3. 정제 — 탁한 색이 뽑혔을 때

코퍼스 최대 계열이 **탁한 중간 블루**(`#2669af`대)였다. 그대로 주입하면 데모가 고객 현실과 같은 세계에 남는다. **H는 보존하고 S·L만 재사상**한다.

| 조건 | 처리 |
|---|---|
| S < 0.35 | S → 0.55 |
| **0.35 ≤ S < 0.75 이고 L 0.25~0.55** | **일렉트릭화**(S→0.90·L→0.55) 또는 **딥뉴트럴화**(S→0.30·L→0.18) 중 택1 |
| L > 0.75 | L → 0.55, 원래 색은 `--surface-2`로 강등 |
| L < 0.12 | `--ink`으로 배정, `--brand`는 폴백에서 |

**택1 판정**: 원 사이트 이미지 밀도가 높으면 딥뉴트럴, 타이포 중심이면 일렉트릭. 사진 위 고채도는 서로 싸운다. **자동 판정 결과를 산출물에 표기해 클리닉이 뒤집을 수 있게 한다.**

### 2-4. 폴백 (추출 실패 시)

| 진료과 | `--brand` | `--accent` |
|---|---|---|
| 치과·교정 | `#152D49` | `#4253FF` |
| 피부·성형·미용 | `#201D1B` | `#C8A92D` |
| 정형·외과·통증 | `#14151D` | `#FECC00` |
| 안과·내과·일반 | `#1D364F` | `#1890D7` |

폴백 사용 여부는 **메타에 기록**한다.

### 2-5. 검증 게이트 (실패 시 폴백 복귀)

`--ink`/`--surface` 12:1 · `--brand`/`--surface` 4.5:1 · `--brand-ink`/`--brand` 4.5:1 · `--accent`가 `--brand`와 ΔH 15° 또는 ΔL 0.2 이상

---

## 3. 구조 템플릿 10종

각 항목 = **[섹션 계획 / 유형 적합(7월) / 시각 계열(2026) / 팔레트 수용 / 모션 성격]**.
**근거 소스** 줄에 `[7월 조사 행 / 2026 소스]`를 병기한다.
전 템플릿 공통: **첫 블록 hero(26/26) · 예약 블록 보유 필수(26/26) · FAQ 상시 포함(§0-2)**.

---

### T1 · Cinematic — S형 단문
- **섹션 계획** `hero → about → gallery → services → reviews → faq → booking` (7~9블록, S형)
- **유형 적합** 심미치과(US 치과 `gallery` 7/11) · 성형(KR `videos` 9/12). **정형외과 제외**(`gallery` 0/8)
- **순서 정합** 밴드 2→4→3→4→6. `about` 2번째는 US 최빈(11/26)
- **시각 계열** 풀블리드 **비디오 히어로**, H1 96~120px, 섹션 여백 112px, 그림자 최소
- **팔레트 수용 넓음** — 히어로 색이 영상에서 오므로 의존이 낮다. 어두운 브랜드색은 오버레이 12% 틴트, 밝은 브랜드색은 오버레이를 `--ink` 40%로 두고 CTA에만 사용
- **모션 강함** (§5-4)
- **근거 소스** [7월: `us-crosstab.md` 구성코드 #3 zen.dentist `hero→about→services→other→gallery→other→reviews→location→booking`(9블록·S) · #2 grandstreetdental(9블록·S) · 치과 `gallery` 11회 7/11 / 2026: `bespokedentistry.com` · `seasidedentalsandiego.com` · `sleep-well-creatives.com`]

### T2 · Editorial Long-form — R형 장문
- **섹션 계획** `hero → about → trust → services → providers → reviews → videos → trust → faq → booking` (10~14블록, **R형 신뢰반복**)
- **유형 적합** **에스테틱**(US 의료진 **7/7** · `trust` 8회 = 사이트당 1.14회로 타 진료과의 3배) · 원장 브랜드형. **`location` 제외**(에스테틱 0/7)
- **순서 정합** R 실측 블록수 8~18(중앙 11.5). `carencampbellmd`의 앞 6블록과 토큰·순서가 일치
- **시각 계열** 타이포 히어로, **큰 그로테스크 + 세리프 한 겹**, H1 108px, 본문 17px/1.7, 62~68ch, 그림자 적극
- **팔레트 수용 넓음** — 세리프 악센트와 리드 문단에만 색을 쓴다. 밝은 브랜드색이 와도 가독성이 안 무너진다
- **모션 중간**
- **근거 소스** [7월: `us-crosstab.md` 구성코드 #24 carencampbellmd `hero→about→trust→services→providers→reviews→…`(11블록·R·t=2) · #20 millercosmeticsurgery(13블록·R·t=4) · #26 maloneyshamievision(18블록·R·t=5) · 교차표1 의료진 에스테틱 7/7 / 2026: `aventuradentalarts.com` · `instituteofhealth.com` · `strahlerdentalpartners.com`]

### T3 · Split Frame — S형 전환
- **섹션 계획** `hero → services → providers → reviews → insurance → location → faq → booking` (6~9블록)
- **유형 적합** **정형외과·일반외과**(US `location` **6/8** · `reviews` 6/8, `faq`/`gallery`/`beforeafter` 0/8) · 전환 목적 일반치과
- **⚠ 앞 초안 수정**: `location`이 빠져 있었다. 정형 8곳 중 6곳 보유이고 **닫는 블록이 `location` 3 : `booking` 3 동률**이라 필수로 올렸다. 블록 수도 5~7 → **6~9**(정형 S 실측 5·6·6·8·9·9, 중앙 7)
- **시각 계열** 좌우 분할 히어로 + **스티키 예약 레일**, H1 72px, 중간 밀도
- **팔레트 수용 중간** — 어두운 브랜드색은 레일 배경, 밝은 브랜드색은 레일을 `--surface-2`로 두고 **보더 1px 추가**(약해지므로)
- **모션 중간~최소**
- **근거 소스** [7월: `us-crosstab.md` 구성코드 #19 syracuseherniacenter `hero→reviews→providers→services→other→insurance→location→booking`(8블록·S) · #13 seancallowaymd(5블록·3.4화면) · #16 midorthoneuro `…→reviews→location`(6블록) · 교차표1 정형 FAQ 0/8 / 2026: 반응형 3단·H1 72px 계열]

### T4 · Card Index — 서비스 카탈로그형
- **섹션 계획** `hero → (브랜드 비주얼 밴드) → services → services → trust → faq → booking → location` (7~10블록)
- **유형 적합** **피부과**(KR `services` **5/5 100%**). **`beforeafter`·`reviews`를 넣지 않는다**(KR 피부과 각각 **0/5**)
- **⚠ 앞 초안 수정**: 계획에 `reviews`가 들어 있었는데 이는 §0-1의 자체 배제 규칙과 모순이었다. **제거**했다. 대신 KR 피부과 4곳이 공통으로 가진 `trust`·`location`·hero 직후 브랜드 밴드를 넣었다
- **순서 정합** KR 피부과 4곳 **전부** 첫 3블록 안에 `other` 브랜드/장비 비주얼 밴드를 둔다(hero 직후는 2곳). `services` 2회 반복 2곳, 꼬리 `other` 제거 후 닫는 블록 `location` 2곳
- **시각 계열** 카드 그리드, 카드 라운드 24px, H1 64px, 높은 밀도
- **팔레트 수용 좁음** — 카드가 많아 브랜드색을 카드 배경에 쓰면 화면이 뒤덮인다. 카드 상단 4px 바 또는 호버 보더로만
- **모션 최소~중간** (카드 스태거만)
- **근거 소스** [7월: `clinic-type-crosstab.md` 피부과 `services` 5/5·`beforeafter` 0/5·`reviews` 0/5 · `kr-crosstab.md` 구성코드 beautyskin `hero→other(장비)→providers→trust→about→services→trust→services→booking→location` · medicubesignature `hero→other→other→services→trust→other` · sdule · velyb / 2026: `bevel.health`(카드 90) · `cascaidhealth.com`]

### T5 · Mono Statement — 최단 선언형
- **섹션 계획** `hero → about → services → reviews → faq → booking` (**5~6블록**, S형 최소)
- **유형 적합** 단일 시술 특화(임플란트·라식 전문)
- **⚠ 앞 초안 수정**: 4블록으로 잡았는데 **US 26곳의 관측 하한은 5블록**(seancallowaymd)이다. 4는 근거 밖이라 **5로 올렸다**. 6블록 S의 실측 정답지가 `moderndermct`다
- **시각 계열** 이미지 없는 초대형 타이포, **H1 120~160px**, 여백이 콘텐츠
- **팔레트 수용 최대** — 액센트를 숫자·밑줄 한 곳에만 쓴다. **어떤 브랜드색이 와도 무너지지 않는다**
- **모션 강함** (움직이는 요소는 타이포 한 덩어리뿐)
- **근거 소스** [7월: `us-crosstab.md` 구성코드 #23 moderndermct `hero→about→services→providers→reviews→booking`(6블록·S) · #13 seancallowaymd(5블록, 관측 하한) · #17 orthospinecenters(6블록) / 2026: `mavehealth.com` · `dsnfperio.com`]

### T6 · Photo Immersive — 공간 중심
- **섹션 계획** `hero → about → gallery → services → gallery → reviews → faq → booking` (8~10블록)
- **유형 적합** **US 치과**(`gallery` 11회 7/11로 유일한 다수) · 시설이 강점인 곳. **정형외과 금지**(0/8)
- **순서 정합** `gallery` 정규화 위치 0.57(중반). 갤러리 **2회 반복**은 grandstreetdental·thetoothco·statenislandoralsurgery 3곳에서 재현
- **시각 계열** 풀블리드 사진 + 시차, H1 88px
- **팔레트 수용 좁음** — **밝은 브랜드색은 사진 위에서 죽는다.** 그 경우 사진 밖 섹션에만 쓰고 사진 위는 흰색 고정. **원 사이트 이미지가 부실하면 T1/T2로 자동 강등**
- **모션 시차 허용** (§5-4에서 유일하게 parallax 허용)
- **근거 소스** [7월: `us-crosstab.md` 구성코드 #11 thetoothco `hero→about→booking→providers→gallery→gallery→services` · #2 grandstreetdental(gallery 2회) · #5 statenislandoralsurgery(gallery 2회) · §3.2 `gallery` 치과 11회 vs 정형 0회 / 2026: `ravenhealth.com` · `photon.health`]

### T7 · Multi-unit — 정보 밀집형
- **섹션 계획** `hero → about → services(과별) → providers → trust → services → reviews → trust → insurance → faq → location → booking` (**13~18블록**, R형)
- **유형 적합** 다지점·종합병원 — **US 한정.** `location`은 US 안에서 **네트워크분원 8/10 vs 단일원장 2/6**으로 통과했고 치과 4/5·정형 4/5로 독립 재현됐다. KR에서 역전되므로 **KR 제안 금지**
- **⚠ 표본 경고**: 13블록 이상은 **26곳 중 4곳**(thegleamery 15 · fornidental 14 · millercosmeticsurgery 13 · maloneyshamievision 18)뿐이다. 이 템플릿의 근거는 얇다
- **시각 계열** 메가 내비 + 스티키, H1 56px(정보가 주인공), 매우 높은 밀도
- **팔레트 수용 좁음** — 정보량이 많아 브랜드색 면적 **5% 이내**로 제한
- **모션 최소** (밀도가 높을수록 움직이면 읽기가 무너진다)
- **근거 소스** [7월: `us-crosstab.md` §3.3 `location` 네트워크 8/10 vs 단일 2/6 · 구성코드 #4 thegleamery(15블록·R·`services` 4회 반복) · #26 maloneyshamievision(18블록) / 2026: `tibicohealth.com`(15섹션) · `maloneyshamievision.com`]

### T8 · Compact Practice — 로컬 개원
- **섹션 계획** `hero(폼 포함) → providers → services → reviews → faq → booking` (**5~7블록**)
- **유형 적합** 1인 개원·로컬. **우리 제품의 초기 고객이 여기 몰릴 가능성이 높다**
- **⚠ 앞 초안 수정 2건**: ① 4블록 → **5블록**(관측 하한). ② **`providers`를 `services`보다 앞으로.** 근거: `providers` 보유가 **단일원장 4/6(67%) vs 네트워크분원 3/10(30%)**이고, 최단 단일원장 사례 seancallowaymd가 `hero→providers→…`로 원장을 2번째에 둔다. 1인 개원은 사람이 상품이다
- **시각 계열** 히어로에 전화·예약 폼, H1 56px, 스크롤 2~3화면
- **팔레트 수용 넓음** — 색 면적이 작고 폼이 중심. 밝은 브랜드색은 폼 포커스 링에 쓴다
- **모션 최소**
- **근거 소스** [7월: `us-crosstab.md` 교차표2 `providers` 단일원장 4/6 vs 네트워크 3/10 · 구성코드 #13 seancallowaymd `hero→providers→services→booking→reviews`(단일원장·5블록·3.4화면) · #11 thetoothco(단일원장·7블록) / 2026: `flashdental.net`]

### T9 · FAQ-closer — **US 치과 전용** (개명)
- **섹션 계획** `hero → about → services → reviews → insurance → faq → location` (7~9블록)
- **유형 적합** **US 치과 한정.** FAQ는 US 치과 5/11에서만 다수에 근접(정형 0/8 · 에스테틱 1/7). 보험 블록도 US 치과 4/11로 여기 붙는다. **`insurance`는 US 전용**(KR 1/42)
- **⚠ 앞 초안 수정**: 이름과 계획이 FAQ를 3번째에 두었는데 **실측은 정반대다.** `faq` 정규화 위치 **0.82**, US 5곳 **전부 후반부**, dentologie·thegleamery는 **최종 블록**. `insurance`(0.75)가 `faq` 바로 앞에 오는 인접 패턴이 2곳에서 재현된다 → **`FAQ-forward` → `FAQ-closer`로 개명**하고 순서를 뒤로 옮겼다
- **시각 계열** 짧은 타이포 히어로 + 하단 아코디언, H1 64px
- **팔레트 수용 중간** — 접힘/펼침을 색으로만 구분하지 말고 **아이콘 회전·좌측 바 두께를 병행**한다(액센트 대비 실패에 대비)
- **모션 최소 + 아코디언 전용 토큰** (§5-4)
- **근거 소스** [7월: `us-crosstab.md` 구성코드 #10 dentologie `hero→services→other→insurance→location→other→services→faq`(faq 최종) · #4 thegleamery(`…→insurance→faq` 최종) · #8 fornidental(`…→insurance→faq→location→booking`) · 교차표1 FAQ 치과 5/11·정형 0/8 / 2026: 아코디언 계열]

### T10 · Before & After — **성형(KR)·심미치과(US) 전용**
- **섹션 계획** `hero → beforeafter → services → videos → gallery → events → trust → faq → location` (**8~10블록**)
- **유형 적합** **KR 성형외과**(`beforeafter` 10/12 83% · `videos` 9/12 75% · `events` 7/12 58%) · **US 심미치과**(2/11). **피부과 제외**(KR 0/5) · **정형외과 제외**(US 0/8)
- **⚠ 앞 초안 수정**: `booking`으로 닫게 돼 있었으나 **KR 성형 5곳 중 4곳이 `location`으로 닫는다.** KR `location` 정규화 위치는 **0.94**다. 예약은 섹션이 아니라 **우측 세로스택 퀵메뉴로 상시 노출**(KR 플로팅 CTA 15/19)
- **순서 정합** `beforeafter`는 2~4번째(KR 정규화 중앙 0.33), `videos`가 그 뒤, `trust`는 후반
- **시각 계열** 갤러리 선행, H1 72px, 캡션 14px, 높은 밀도
- **팔레트 수용 넓음** — 사진이 색을 지배하므로 브랜드색은 슬라이더 핸들·탭·CTA에만. **밝은 브랜드색이 오히려 유리**(사진 위 UI 가시성)
- **모션 중간** (전후 비교 슬라이더는 스크롤 모션과 분리)
- **⚠ KR 적용 시 의료광고 규제 확인 선행** — 7월 조사가 명시한 미검증 항목이다
- **근거 소스** [7월: `clinic-type-crosstab.md` 성형 `beforeafter` 10/12·`videos` 9/12·`events` 7/12 · `kr-crosstab.md` 구성코드 deesse `hero→gallery→beforeafter→services→gallery→videos→trust→other` · startps `hero→services→services→beforeafter→gallery→videos→trust→other→location→other` · andps · saekimps / 2026: 갤러리 선행 계열]

---

## 4. 요약표

| # | 템플릿 | 유형군 | 블록 | 주 대상(7월 근거) | 제외 대상 | 닫는 블록 | 팔레트 | 모션 |
|---|---|---|---|---|---|---|---|---|
| T1 | Cinematic | S | 7~9 | 심미치과·성형 | 정형(gallery 0/8) | booking | 넓음 | 강함 |
| T2 | Editorial Long-form | **R** | 10~14 | 에스테틱(의료진 7/7) | location(0/7) | booking | 넓음 | 중간 |
| T3 | Split Frame | S | 6~9 | 정형외과(location 6/8) | faq·gallery 실측 0/8* | location\|booking | 중간 | 중간 |
| T4 | Card Index | S | 7~10 | 피부과(services 5/5) | beforeafter·reviews | location | 좁음 | 최소 |
| T5 | Mono Statement | S | **5~6** | 단일 시술 특화 | — | booking | **최대** | 강함 |
| T6 | Photo Immersive | S | 8~10 | US 치과(gallery 7/11) | 정형(0/8) | booking | 좁음 | 시차 허용 |
| T7 | Multi-unit | **R** | 13~18 | 다지점(US 한정) | KR(축 역전) | booking | 좁음 | 최소 |
| T8 | Compact Practice | S | **5~7** | 1인 개원(providers 4/6) | — | booking | 넓음 | 최소 |
| T9 | FAQ-closer | S | 7~9 | **US 치과 전용** | KR insurance(1/42) | **faq\|location** | 중간 | 최소 |
| T10 | Before & After | S | 8~10 | **KR 성형·US 심미치과** | 피부과(0/5)·정형(0/8) | **location** | 넓음 | 중간 |

\* T3의 `faq` 0/8은 실측이지만 §0-2의 상시 포함 결정이 우선한다 — **하단에 최소 형태로** 넣는다.

**R형은 T2·T7 둘뿐이다.** US 26곳에서 R이 8/26(31%)이므로 10종 중 2종이 적정 비율이다.

---

## 5. ★ 모션 규약

### 5-0. 근거와 그 한계

| 소스 | 성격 | 무엇을 신뢰하는가 |
|---|---|---|
| **7월 리빌 실측** (`reveal-measurement-spec.md` + 두 crosstab `리빌(px/ms)` 열) | **런타임 computed style** — 실제 브라우저에서 잰 값 | **이동거리·지속·이징**의 정본 |
| **2026 소스 16곳** (캐시된 HTML+CSS 51파일 정적 추출) | 선언된 CSS/JS 설정값 | **라이브러리 채택률·스태거·reduced-motion 실태** |

**정적 추출의 한계를 먼저 밝힌다**: 2026 소스 16곳 중 **10곳이 Lenis(5)·Locomotive(5) 스무스 스크롤 + GSAP(4)** 조합이라, 리빌의 실제 이동거리를 **JS가 인라인 스타일로 넣는다.** CSS에서 건진 리빌 translate 샘플은 **2건뿐**이다. 그래서 **이동거리는 7월 런타임 실측을 쓴다.**

### 5-1. 리빌 문법 — 실측치

**① 이동거리 — US와 KR이 정반대다**

| 시장 | 실측 | 판정 |
|---|---|---|
| **US** (7월, 파라미터 측정된 5곳) | millercosmeticsurgery **50px**/500ms · parkcitydermatology **0px**/900ms · moderndermct **0px**/1000ms · carencampbellmd **0px**/250·500·800ms · maloneyshamievision **0px**/600·1000ms | **4/5가 이동 0px = 페이드 전용** |
| **KR** (7월, 측정된 12곳) | **100px**/1500ms(ilovegangnam·smileface·corea1) · 100px/700ms(beautyskin) · 100px/1000ms(erumeye) · 100px·42px/700·500ms(slseoulhospital) · 53px/1200ms(saekimps) · 0px/300·700·800ms(velyb) · 520px X축(sdule) | **100px 이동이 다수** |
| 2026 CSS 리빌 translate | 16px · 226px (n=2) / 전체 translate 최빈 4·8·16·20·24·32px | 마이크로 이동 대역 |

> **결정: US 데모의 리빌 이동거리는 0~24px, 기본 16px.** 100px 이동은 **KR 문법**이며 US 템플릿에 쓰지 않는다. 근거는 US 런타임 5곳 중 4곳이 0px라는 것과, 2026 CSS 리빌 하한이 16px라는 것이다.

**② 지속 시간 — 리빌과 호버를 분리해야 한다**

2026 소스 51파일을 규칙 단위로 파싱해 리빌 문맥(`opacity:0`·translate 보유 또는 reveal 계열 셀렉터)과 호버 문맥(`:hover`·버튼·내비)을 갈라 냈다.

| 구분 | n | min | p25 | **중앙** | p75 | p90 | max | 최빈 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| **리빌** | 135 | 150 | 300 | **500** | 500 | 1000 | 4000 | **500ms(44회)** · 300 · 400 · 1000 |
| **호버·UI** | 187 | 100 | 200 | **300** | 400 | 900 | 4000 | 300 · 200 · 400 |

**표본 집중 교차 확인**: 리빌 135건 중 40건(30%)이 tibicohealth 한 곳에서 나온다. 한 사이트 = 한 표로 다시 재면(리빌 값을 가진 14곳의 사이트별 중앙값) **462ms**, 호버는 **320ms**로 위 값과 어긋나지 않는다. 한 곳이 만든 수치가 아니다.

GSAP 직접 설정값도 같은 대역이다 — `duration: 0.3 / 0.8 / 1.0`(각 4회) · `1.2`.
7월 US 런타임 지속은 **250~1000ms**(중앙 ~800), KR은 **700~1500ms**로 더 길다.

**③ 이징 — ease-out 계열이 지배**

| 소스 | 관측 |
|---|---|
| 2026 CSS 리빌 | `ease` 62 · `ease-in-out` 9 · `ease-out` 7 · `cubic-bezier` 소수(`.4,0,.2,1` · `.16,1,.3,1` · `.04,.7,.32,1.03`) |
| GSAP `ease:` | `power2.out` 5 · `customEase` 6 · `power4.out` 1 · `sine.inOut` 2 · `back.out` 1 |
| 7월 런타임 | `ease` 다수 · `ease-out` · `ease-in-out` · **`cubic-bezier(0.16, 1, 0.3, 1)`**(hooclinic, easeOutExpo) |
| cubic-bezier 보유 | **14/16곳** |

**④ 스태거**

| 소스 | 값 |
|---|---|
| GSAP `stagger:` | **15ms · 50ms · 90ms** |
| `data-aos-delay` (tibicohealth 16건) | 0 · 100 · **150**(최빈 4회) · 200 · 300 · 350 · 400 · 500 · 600 · 700ms |
| 2026 전체 delay 분포 | n=145, p25 200 · 중앙 600 · p75 1000ms |
| 7월 런타임 | WOW.js 지연 **0~650ms** 스태거 · faceps 700/1100/1500ms |

**⑤ 리빌 유형의 다양성 — 없다**

`data-aos` 값은 **42건 전부 `fade-up` 단일 종류**다. 방향·유형을 섞지 않는다.

### 5-2. 스크롤 연동 — 절제가 관행이다

| 항목 | 2026 16곳 | 판정 |
|---|---|---|
| 스무스 스크롤(Lenis 5 · Locomotive 5) | **10/16** | **채택률 최상.** Lenis 설정 `duration: 1.2` |
| `position: sticky` 보유 | 11/16 | 흔함(헤더·레일) |
| **스크럽 애니메이션**(`scrub`) | **5회 / 4곳** | **소수** |
| **핀 고정 섹션**(`pin: true`) | **1회** | **거의 없다** |
| 시차(`data-scroll-speed`) | 3건 (값 50 · 55 · 70) | 약한 시차만 |
| `background-attachment: fixed` | 3/16 | 소수 |
| CSS 스크롤 구동(`animation-timeline`) | **0 / 51파일** | **미채택 — 쓰지 않는다** |
| `view-transition` | 0 | 미채택 |
| `will-change` | 10/16 | 흔하나 남용 주의 |

> **결정: 스크럽·핀 고정은 기본 금지.** T1(Cinematic)·T6(Photo Immersive)에서만 옵션으로 열고, 그마저 **1페이지 1회**로 제한한다. 근거는 16곳 중 핀이 1건이라는 것이다.

### 5-3. 히어로 진입 모션 · reduced-motion 실태

**히어로 로드 시퀀스** — 정적 CSS에서 히어로 전용 시퀀스를 분리 관측하지 못했다(JS 주도). delay 계단 실측(`0/100/150/200/300…`)과 7월 WOW.js 스태거(0~650ms)에서 역산한다.

- 움직이는 요소 **3~4개**(H1 / 서브카피 / CTA / 이미지), 계단 **0 · 150 · 300 · 450ms**, 각 duration **600~800ms**, **총 ≤1.2초**
- **H1을 `opacity:0`으로 숨긴 채 시작하지 않는다.** KR smileface.dental은 **H1이 0px로 숨겨진 상태**로 관측됐고, 이는 `variant-axes.md` §5.1 금지항목(히어로 헤드라인을 검색·AI가 못 읽음)과 같은 손상이다. 히어로 텍스트는 **처음부터 보이고, 이동·마스크만** 준다

**reduced-motion 실태 — 관행이 미달이다**

| 항목 | 2026 16곳 |
|---|---|
| `@media (prefers-reduced-motion)` **블록 보유** | **6/16 (38%)** |
| 문자열 언급이라도 있음 | 8/16 (50%) |

관측된 대응 내용: `animation: none` · `transition: none` · `scroll-behavior: auto` · `[data-reveal] .rv { opacity:1 !important; transition:none !important; transform:none !important }`

> **결정: 우리는 100% 필수.** FAQ와 같은 성격의 **의도적 관행 역행**이다(38%는 따를 기준이 못 된다).

### 5-4. 모션 토큰 (구현 게이트)

```css
:root{
  /* 지속 — 2026 리빌 중앙 500ms / 호버 중앙 300ms */
  --dur-hover: 200ms;   /* 호버 p25 */
  --dur-ui:    300ms;   /* 호버 중앙 */
  --dur-reveal:500ms;   /* 리빌 중앙·최빈(44회) */
  --dur-slow:  800ms;   /* 리빌 p75~p90, 히어로용 */

  /* 이징 — GSAP power2.out 등가 / easeOutExpo(7월 hooclinic 실측) */
  --ease-out:        cubic-bezier(0.33, 1, 0.68, 1);
  --ease-out-strong: cubic-bezier(0.16, 1, 0.30, 1);
  --ease-inout:      cubic-bezier(0.65, 0, 0.35, 1);

  /* 이동 — US 런타임 4/5가 0px, 2026 CSS 리빌 하한 16px */
  --reveal-shift: 16px;   /* 허용 0~24px. 100px은 KR 문법 */
  --stagger:      90ms;   /* 허용 60~150ms. GSAP 최대 90 / AOS 최빈 150 */
}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{ animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important; scroll-behavior:auto !important; }
  [data-reveal]{ opacity:1 !important; transform:none !important; }
}
```

**템플릿별 모션 성격**

| 템플릿 | 성격 | 리빌 대상 | duration | shift | stagger | 스크럽·핀 |
|---|---|---|---|---|---|---|
| T1 Cinematic | **강함** | 히어로 텍스트·갤러리·섹션 헤딩 | `--dur-slow` 800ms | 24px | 120ms | **옵션 1회** |
| T2 Editorial | 중간 | 섹션 헤딩·리드 문단·인용 | 500ms | 16px | 90ms | 금지 |
| T3 Split Frame | 중간 | 좌우 패널 교차 | 500ms | 16px | 90ms | 금지 |
| T4 Card Index | **최소** | 카드 그리드만 | 400ms | 12px | **60ms**(카드 다수) | 금지 |
| T5 Mono Statement | **강함** | 타이포 한 덩어리 | 800ms | 24px | 120ms | 금지 |
| T6 Photo Immersive | 시차 허용 | 사진 블록 | 600ms | 16px | 90ms | **시차 speed ≤70, 핀 1회** |
| T7 Multi-unit | **최소** | 섹션 헤딩만 | 300ms | **0px**(페이드) | 60ms | 금지 |
| T8 Compact Practice | **최소** | 히어로 폼만 | 300ms | 8px | — | 금지 |
| T9 FAQ-closer | **최소** | 아코디언 전용 | **250ms** 펼침 | — | — | 금지 |
| T10 Before & After | 중간 | 갤러리·슬라이더 | 500ms | 16px | 90ms | 금지 |

### 5-5. 성능·접근성 게이트 (구현 검수 항목)

1. **`transform`·`opacity`만 애니메이트한다.** `width`/`height`/`top`/`left`/`margin` 전이 금지 — 레이아웃을 다시 계산해 60fps가 깨진다
2. **`prefers-reduced-motion` 대응 필수** — 미구현은 반려. 위 블록을 그대로 넣는다
3. **IntersectionObserver 기반**, 스크롤 이벤트 핸들러 금지. 발화 후 `unobserve`로 1회만
4. **한 화면에 동시에 움직이는 요소 ≤6.** 스태거 90ms 기준 누적 지연이 540ms를 넘지 않게 한다
5. **폴드 위 요소는 리빌 대상이 아니다.** 초기 화면 콘텐츠에 `opacity:0`을 붙이면 LCP가 리빌 지속만큼 밀린다
6. **`will-change`는 리빌 진행 중에만.** 상시 선언 금지(합성 레이어 누적)
7. **리빌 발화 판정은 클래스 개수가 아니라 computed `opacity`/`transform`으로 한다** — `reveal-measurement-spec.md` §5-1: 라이브러리가 종료 후 클래스를 제거하면 개수가 0이 되어 오판한다
8. **`animation-duration`은 종료 후 `0s`로 되돌아간다** — 검수 스크립트가 이 값을 사후에 읽으면 "모션 없음"으로 오판한다. `transition-duration`은 트리거 전후 모두 살아 있으므로 **transition 기반을 기본으로 쓴다**
9. **CSS 스크롤 구동(`animation-timeline`)·`view-transition` 미사용** — 2026 소스 채택 0
10. **캐러셀에 콘텐츠를 매장하지 않는다**(`variant-axes.md` §5.1) — 2번째 이후 슬라이드는 비노출로 간주

---

## 6. 전 템플릿 공통 규약

**구조 (7월 조사)**
- 첫 블록은 반드시 `hero` — 26/26
- 예약·상담 블록 반드시 **보유** — 26/26. 단 **마지막에 두는 것은 자유**(booking 닫기 11/26, 축5는 R 4:4·S 9:9)
- 히어로 슬라이드·스탯 배지는 기본값에서 제외 — 15% · 8%
- **FAQ는 전 템플릿 상시 포함, 위치는 하단** — 0/42(KR)·6/26(US)에 대한 의도적 역행(§0-2), 실측 위치 0.82
- `insurance`는 **US 전용** — KR 1/42
- **§1-7 금지 5항목**(헤드라인 이미지 렌더 · DOM 은닉 텍스트 · 캐러셀 매장 · FAQ 생략 · 진입 모달)
- **KR/US 분기 4건**(§1-3)을 코드로 분기한다 — `about` 위치 · 닫는 블록 · hero 다음 밴드 · 예약 노출 형태

**시각 (2026 학습)**
- 브레이크포인트 **768 / 1024 / 1280** 3단
- 헤드라인 **clamp() 유동**, 본문 고정. `clamp(2.5rem, 6vw, 7.5rem)`
- **H1 데스크톱 최소 64px** — 코퍼스 44px+ 선언 0건 vs 2026 소스 16/16 보유(중앙 82px)
- 터치 타깃 44px 이상, 주요 CTA 56px
- 모바일 내비는 드로어
- **모바일 하단 고정 CTA는 보조축이다** — 앞 초안에서 "금지"라고 썼으나, 그 근거(2026 소스 CSS 클래스명 1/16)보다 **7월 런타임 실측 13/26(정확히 반반, `variant-axes.md` 축6)**이 강하다. **US는 기본 off**(데스크톱은 상단 고정 가로바가 우세), **KR은 기본 on**(플로팅 CTA 15/19 · 우측 세로스택 12/19)
- 폰트 **자체 호스팅** — 구글폰트는 16곳 중 2곳뿐
- CSS 커스텀 프로퍼티로만 토큰 정의
- 모션은 §5 규약 준수

---

## 7. 구현자에게 남기는 판단

1. **T5(Mono Statement) 먼저.** 팔레트 수용 폭이 최대라 추출기가 무엇을 뱉든 안 무너지고, 44px 공백 발견과 §5의 모션 토큰을 가장 직접 실현한다. **단 5블록 하한을 지켜라**(4블록은 관측 범위 밖).
2. **템플릿 추천은 진료과 → 유형군(R/S) → 시각 계열 순으로 좁힌다.** 진료과가 섹션 구성을, R/S가 길이를, 시각 계열이 표현을 결정한다. 색은 마지막이다.
3. **KR/US 분기를 코드에 넣어라**(§1-3). `about` 위치와 닫는 블록이 반대다. 하나의 템플릿을 양 시장에 그대로 쓰면 KR 홈이 US 문법으로 끝난다.
4. **T6은 이미지 품질 게이트 필수** — 미달 시 T1/T2 강등.
5. **T9의 접힘 상태를 색으로만 구분하지 마라** — 액센트 대비 게이트 실패 1순위다.
6. 폴백 팔레트 사용 여부와 §2-3 택1 결과는 **반드시 메타에 남긴다.**
7. **모션 검수는 사후 측정이 아니라 사전 측정이다**(§5-5 7·8항). 애니메이션이 끝난 뒤 `animation-duration`을 읽으면 0s가 나와 "모션 없음"으로 오판한다.
8. **T7의 근거는 얇다**(13블록 이상 4/26). 다지점 고객이 실제로 올 때까지 구현 우선순위를 낮게 둔다.

---

## 부록 · 재집계 스크립트

§1-2(섹션 순서)와 §5-1(모션 파라미터)의 수치는 아래로 재현한다. **신규 네트워크 요청 없이** 기존 조사 산출물과 캐시에서만 산출했다.

- `us-crosstab.md` · `kr-crosstab.md`의 「구성 코드 전문」 표 → 토큰 정규화 위치·닫는 블록·블록수 분포
- `/private/tmp/src2026/*.html` + `/private/tmp/src2026/css/*.css`(16곳 51파일) → 규칙 단위 파싱으로 리빌/호버 duration 분리, easing·stagger·라이브러리·reduced-motion 집계
