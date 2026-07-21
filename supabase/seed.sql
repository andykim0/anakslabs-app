-- ============================================================================
-- seed.sql — 데모 데이터 (개발 전용, supabase db reset 시 자동 적용)
--
-- 주의:
--  * auth.users에 데이터 전용 유저를 직접 삽입한다. 실제 카카오/구글 로그인은
--    불가하며, DB 모드 개발/화면 데모용 데이터다.
--  * 결제/크레딧은 반드시 함수 경유(handle_*_payment, consume_credits 등) —
--    원장-잔액 정합이 함수로만 유지되기 때문. 직접 INSERT 금지.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. auth.users (데이터 전용 계정)
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated',
    'kim@hwarodam.kr', '',
    now(),
    '{"provider": "kakao", "providers": ["kakao"]}'::jsonb,
    '{"name": "김대표"}'::jsonb,
    now() - interval '30 days', now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    'park@mintwash.kr', '',
    now(),
    '{"provider": "google", "providers": ["google"]}'::jsonb,
    '{"name": "박사장"}'::jsonb,
    now() - interval '10 days', now(),
    '', '', '', ''
  )
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. clients — premium '화로담 김대표' / basic '민트세탁소 박사장'
-- ----------------------------------------------------------------------------
insert into public.clients (id, name, email, auth_provider, tier, status, created_at) values
  ('11111111-1111-1111-1111-111111111111', '화로담 김대표', 'kim@hwarodam.kr', 'kakao', 'premium', 'active', now() - interval '30 days'),
  ('22222222-2222-2222-2222-222222222222', '민트세탁소 박사장', 'park@mintwash.kr', 'google', 'basic', 'active', now() - interval '10 days')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. 결제 + 초기 크레딧 (웹훅 함수 경유 — 멱등)
--    화로담: 빌드비(premium, +3) + 크레딧 5팩(+5) + 유지보수 1회
--    민트세탁소: 빌드비(basic, +1)
-- ----------------------------------------------------------------------------
select public.handle_build_fee_payment(
  '11111111-1111-1111-1111-111111111111', 'mock_toss_hwarodam_build_001', 1290000, 'premium');
select public.handle_credit_pack_payment(
  '11111111-1111-1111-1111-111111111111', 'mock_toss_hwarodam_pack5_001', 65000, 5);
select public.handle_maintenance_payment(
  '11111111-1111-1111-1111-111111111111', 'mock_toss_hwarodam_maint_2026_07', 29900);
select public.handle_build_fee_payment(
  '22222222-2222-2222-2222-222222222222', 'mock_toss_mintwash_build_001', 490000, 'basic');

-- ----------------------------------------------------------------------------
-- 4. sites — 화로담: 라이브 / 민트세탁소: 온보딩 중 초안
-- ----------------------------------------------------------------------------
insert into public.sites (
  id, client_id, name, domain, domain_type, dns_verified, status,
  site_config, draft_config, survey, published_at, created_at
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '화로담',
  'hwarodam.anakslabs.com',
  'subdomain',
  false,
  'live',
  $config$
  {
    "version": 1,
    "theme": {
      "fonts": {
        "heading": "'Noto Serif KR', serif",
        "body": "'Pretendard', sans-serif",
        "googleFonts": ["Noto Serif KR"]
      },
      "palette": {
        "background": "#0f0e0c",
        "surface": "#1a1815",
        "text": "#f5f1e8",
        "muted": "#9a917f",
        "primary": "#b08d57",
        "accent": "#7a2e2e"
      },
      "radius": 8
    },
    "meta": {
      "title": "화로담 — 숯불 화로구이",
      "description": "여섯 가지 부위, 하나의 화로. 강릉 초당동 숯불 화로구이 다이닝.",
      "ogImage": "https://picsum.photos/seed/hwarodam-hero/1200/630"
    },
    "sections": [
      {
        "id": "sec-hero",
        "type": "hero",
        "name": "히어로",
        "height": 800,
        "background": { "color": "#0f0e0c" },
        "elements": [
          {
            "id": "el-hero-title",
            "kind": "text",
            "frame": { "x": 120, "y": 280, "w": 700, "h": 190 },
            "z": 2,
            "text": "여섯 가지 부위,\n하나의 화로",
            "style": { "fontSize": 64, "fontWeight": 600, "fontFamily": "heading", "color": "#f5f1e8", "align": "left", "lineHeight": 1.3 }
          },
          {
            "id": "el-hero-sub",
            "kind": "text",
            "frame": { "x": 120, "y": 490, "w": 520, "h": 60 },
            "z": 2,
            "text": "강릉 초당동 · 숯불 화로구이 다이닝",
            "style": { "fontSize": 20, "fontFamily": "body", "color": "#9a917f", "align": "left", "lineHeight": 1.6 }
          },
          {
            "id": "el-hero-cta",
            "kind": "button",
            "frame": { "x": 120, "y": 590, "w": 180, "h": 56 },
            "z": 2,
            "label": "자리 예약",
            "href": "#sec-contact",
            "style": { "variant": "solid", "color": "#b08d57", "textColor": "#0f0e0c", "fontSize": 17, "borderRadius": 8 }
          },
          {
            "id": "el-hero-img",
            "kind": "image",
            "frame": { "x": 860, "y": 140, "w": 460, "h": 560 },
            "z": 1,
            "src": "https://picsum.photos/seed/hwarodam-hero/920/1120",
            "alt": "화로 위 숯불구이",
            "style": { "objectFit": "cover", "borderRadius": 12, "shadow": true }
          }
        ]
      },
      {
        "id": "sec-about",
        "type": "about",
        "name": "소개",
        "height": 560,
        "background": { "color": "#1a1815" },
        "elements": [
          {
            "id": "el-about-title",
            "kind": "text",
            "frame": { "x": 120, "y": 110, "w": 420, "h": 70 },
            "z": 2,
            "text": "불 앞의 시간",
            "style": { "fontSize": 40, "fontWeight": 600, "fontFamily": "heading", "color": "#f5f1e8", "align": "left" }
          },
          {
            "id": "el-about-body",
            "kind": "text",
            "frame": { "x": 120, "y": 210, "w": 560, "h": 200 },
            "z": 2,
            "text": "참숯이 오르는 데 사십 분.\n화로담은 그 시간을 기다립니다.\n당일 손질한 여섯 부위만, 한 화로에서 굽습니다.",
            "style": { "fontSize": 18, "fontFamily": "body", "color": "#cfc8b8", "align": "left", "lineHeight": 1.9 }
          },
          {
            "id": "el-about-img",
            "kind": "image",
            "frame": { "x": 800, "y": 80, "w": 520, "h": 400 },
            "z": 1,
            "src": "https://picsum.photos/seed/hwarodam-about/1040/800",
            "alt": "화로담 내부",
            "style": { "objectFit": "cover", "borderRadius": 12, "shadow": false }
          }
        ]
      },
      {
        "id": "sec-menu",
        "type": "menu",
        "name": "메뉴",
        "height": 780,
        "background": { "color": "#0f0e0c" },
        "elements": [
          {
            "id": "el-menu-title",
            "kind": "text",
            "frame": { "x": 120, "y": 100, "w": 300, "h": 70 },
            "z": 2,
            "text": "메뉴",
            "style": { "fontSize": 40, "fontWeight": 600, "fontFamily": "heading", "color": "#f5f1e8", "align": "left" }
          },
          {
            "id": "el-menu-1-name",
            "kind": "text",
            "frame": { "x": 120, "y": 240, "w": 400, "h": 40 },
            "z": 2,
            "text": "본갈비",
            "style": { "fontSize": 24, "fontWeight": 500, "fontFamily": "heading", "color": "#f5f1e8", "align": "left" }
          },
          {
            "id": "el-menu-1-desc",
            "kind": "text",
            "frame": { "x": 120, "y": 288, "w": 600, "h": 30 },
            "z": 2,
            "text": "참숯 직화 · 이틀 건식 숙성",
            "style": { "fontSize": 15, "fontFamily": "body", "color": "#9a917f", "align": "left" }
          },
          {
            "id": "el-menu-1-price",
            "kind": "text",
            "frame": { "x": 1020, "y": 240, "w": 300, "h": 40 },
            "z": 2,
            "text": "42,000",
            "style": { "fontSize": 22, "fontFamily": "body", "color": "#b08d57", "align": "right" }
          },
          {
            "id": "el-menu-div-1",
            "kind": "divider",
            "frame": { "x": 120, "y": 350, "w": 1200, "h": 2 },
            "z": 2,
            "style": { "color": "#2a2721", "thickness": 1 }
          },
          {
            "id": "el-menu-2-name",
            "kind": "text",
            "frame": { "x": 120, "y": 400, "w": 400, "h": 40 },
            "z": 2,
            "text": "살치살",
            "style": { "fontSize": 24, "fontWeight": 500, "fontFamily": "heading", "color": "#f5f1e8", "align": "left" }
          },
          {
            "id": "el-menu-2-desc",
            "kind": "text",
            "frame": { "x": 120, "y": 448, "w": 600, "h": 30 },
            "z": 2,
            "text": "마블링 상급 부위 · 화로 초벌",
            "style": { "fontSize": 15, "fontFamily": "body", "color": "#9a917f", "align": "left" }
          },
          {
            "id": "el-menu-2-price",
            "kind": "text",
            "frame": { "x": 1020, "y": 400, "w": 300, "h": 40 },
            "z": 2,
            "text": "38,000",
            "style": { "fontSize": 22, "fontFamily": "body", "color": "#b08d57", "align": "right" }
          },
          {
            "id": "el-menu-div-2",
            "kind": "divider",
            "frame": { "x": 120, "y": 510, "w": 1200, "h": 2 },
            "z": 2,
            "style": { "color": "#2a2721", "thickness": 1 }
          },
          {
            "id": "el-menu-3-name",
            "kind": "text",
            "frame": { "x": 120, "y": 560, "w": 400, "h": 40 },
            "z": 2,
            "text": "안창살",
            "style": { "fontSize": 24, "fontWeight": 500, "fontFamily": "heading", "color": "#f5f1e8", "align": "left" }
          },
          {
            "id": "el-menu-3-desc",
            "kind": "text",
            "frame": { "x": 120, "y": 608, "w": 600, "h": 30 },
            "z": 2,
            "text": "하루 스무 접시 한정",
            "style": { "fontSize": 15, "fontFamily": "body", "color": "#9a917f", "align": "left" }
          },
          {
            "id": "el-menu-3-price",
            "kind": "text",
            "frame": { "x": 1020, "y": 560, "w": 300, "h": 40 },
            "z": 2,
            "text": "36,000",
            "style": { "fontSize": 22, "fontFamily": "body", "color": "#b08d57", "align": "right" }
          },
          {
            "id": "el-menu-note",
            "kind": "text",
            "frame": { "x": 120, "y": 690, "w": 600, "h": 30 },
            "z": 2,
            "text": "모든 메뉴는 1인분(150g) 기준입니다.",
            "style": { "fontSize": 14, "fontFamily": "body", "color": "#9a917f", "align": "left" }
          }
        ]
      },
      {
        "id": "sec-contact",
        "type": "contact",
        "name": "예약·오시는 길",
        "height": 520,
        "background": { "color": "#1a1815" },
        "elements": [
          {
            "id": "el-contact-title",
            "kind": "text",
            "frame": { "x": 120, "y": 100, "w": 500, "h": 70 },
            "z": 2,
            "text": "예약 · 오시는 길",
            "style": { "fontSize": 40, "fontWeight": 600, "fontFamily": "heading", "color": "#f5f1e8", "align": "left" }
          },
          {
            "id": "el-contact-info",
            "kind": "text",
            "frame": { "x": 120, "y": 210, "w": 560, "h": 160 },
            "z": 2,
            "text": "강릉시 초당순두부길 24-1\n화–일 17:00–23:00 · 월 휴무\n0507-1234-5678",
            "style": { "fontSize": 18, "fontFamily": "body", "color": "#cfc8b8", "align": "left", "lineHeight": 1.9 }
          },
          {
            "id": "el-contact-cta",
            "kind": "button",
            "frame": { "x": 120, "y": 400, "w": 170, "h": 54 },
            "z": 2,
            "label": "전화 문의",
            "href": "tel:0507-1234-5678",
            "style": { "variant": "outline", "color": "#b08d57", "textColor": "#b08d57", "fontSize": 16, "borderRadius": 8 }
          },
          {
            "id": "el-contact-map",
            "kind": "image",
            "frame": { "x": 800, "y": 100, "w": 520, "h": 340 },
            "z": 1,
            "src": "https://picsum.photos/seed/hwarodam-map/1040/680",
            "alt": "매장 위치 지도",
            "style": { "objectFit": "cover", "borderRadius": 8, "shadow": false }
          }
        ]
      }
    ]
  }
  $config$::jsonb,
  null, -- draft_config: 아래에서 발행본 복사로 채움
  $survey$
  {
    "businessName": "화로담",
    "purpose": "예약 유도",
    "industry": "요식업 — 숯불 화로구이",
    "tone": "고급스러운, 무게감 있는",
    "colorPreference": "딥 차콜 + 앰버 골드",
    "referenceImageUrls": [],
    "sections": ["hero", "about", "menu", "contact"],
    "extraNotes": "과한 수식어 없는 절제된 카피 선호"
  }
  $survey$::jsonb,
  now() - interval '20 days',
  now() - interval '28 days'
)
on conflict (id) do nothing;

-- 발행본과 동일한 초안으로 시작 (에디터 재진입 시 기준)
update public.sites
set draft_config = site_config
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and draft_config is null;

-- 민트세탁소: 온보딩 진행 중 (설문 완료 + 1차 가공 초안, 미발행)
insert into public.sites (
  id, client_id, name, domain, domain_type, dns_verified, status,
  site_config, draft_config, survey, published_at, created_at
) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  '민트세탁소',
  null,
  'subdomain',
  false,
  'draft',
  null,
  $config$
  {
    "version": 1,
    "theme": {
      "fonts": {
        "heading": "'Gowun Batang', serif",
        "body": "'Pretendard', sans-serif",
        "googleFonts": ["Gowun Batang"]
      },
      "palette": {
        "background": "#f7f6f2",
        "surface": "#ffffff",
        "text": "#1c1b18",
        "muted": "#8a877e",
        "primary": "#2f7d6d",
        "accent": "#e4a11b"
      },
      "radius": 12
    },
    "meta": {
      "title": "민트세탁소 — 우리 동네 프리미엄 세탁",
      "description": "아침에 맡기면 저녁에 새 옷. 성수동 민트세탁소."
    },
    "sections": [
      {
        "id": "sec-hero",
        "type": "hero",
        "name": "히어로",
        "height": 720,
        "background": { "color": "#f7f6f2" },
        "elements": [
          {
            "id": "el-hero-title",
            "kind": "text",
            "frame": { "x": 120, "y": 240, "w": 720, "h": 160 },
            "z": 2,
            "text": "아침에 맡기면,\n저녁에 새 옷.",
            "style": { "fontSize": 56, "fontWeight": 700, "fontFamily": "heading", "color": "#1c1b18", "align": "left", "lineHeight": 1.35 }
          },
          {
            "id": "el-hero-sub",
            "kind": "text",
            "frame": { "x": 120, "y": 430, "w": 520, "h": 56 },
            "z": 2,
            "text": "성수동 프리미엄 세탁 · 당일 수거 배송",
            "style": { "fontSize": 19, "fontFamily": "body", "color": "#8a877e", "align": "left", "lineHeight": 1.6 }
          },
          {
            "id": "el-hero-cta",
            "kind": "button",
            "frame": { "x": 120, "y": 530, "w": 190, "h": 56 },
            "z": 2,
            "label": "수거 신청",
            "href": "#sec-contact",
            "style": { "variant": "solid", "color": "#2f7d6d", "textColor": "#ffffff", "fontSize": 17, "borderRadius": 12 }
          },
          {
            "id": "el-hero-img",
            "kind": "image",
            "frame": { "x": 880, "y": 130, "w": 440, "h": 460 },
            "z": 1,
            "src": "https://picsum.photos/seed/mintwash-hero/880/920",
            "alt": "세탁소 매장",
            "style": { "objectFit": "cover", "borderRadius": 16, "shadow": true }
          }
        ]
      }
    ]
  }
  $config$::jsonb,
  $survey$
  {
    "businessName": "민트세탁소",
    "purpose": "수거/배송 신청 유도",
    "industry": "생활 서비스 — 세탁",
    "tone": "친근한, 깔끔한",
    "colorPreference": "민트 그린 + 아이보리",
    "referenceImageUrls": [],
    "sections": ["hero", "features", "pricing", "contact"],
    "extraNotes": "가격표를 꼭 넣고 싶음"
  }
  $survey$::jsonb,
  null,
  now() - interval '5 days'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. 편집 요청 + 크레딧 소진/환불 샘플 (화로담)
--    e1: 텍스트 수정 → 적용 완료 (-1)
--    e2: 이미지 교체 → QA 대기 (-1, 선차감)
--    e3: 이미지 교체 → 반려 (-1 후 +1 환불)
--    결과 잔액: 3(초기) + 5(팩) - 1 - 1 - 1 + 1 = 6
-- ----------------------------------------------------------------------------
insert into public.edit_requests (
  id, client_id, site_id, type, credit_cost, status, requested_content, ai_output, created_at, applied_at
) values
  (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'text', 1, 'applied',
    '히어로 문구를 더 짧고 힘있게 바꿔주세요. 수식어는 빼고요.',
    '{"elementId": "el-hero-title", "text": "여섯 가지 부위,\n하나의 화로"}'::jsonb,
    now() - interval '6 days', now() - interval '5 days'
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'image', 1, 'qa_review',
    '메뉴 섹션 상단에 갈비 클로즈업 사진을 어둡고 무디한 톤으로 추가해주세요.',
    '{"url": "https://picsum.photos/seed/galbi-moody/800/600", "prompt": "moody charcoal-grilled galbi closeup, dark editorial food photography"}'::jsonb,
    now() - interval '2 days', null
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'image', 1, 'rejected',
    '외관 사진을 한낮의 밝은 사진으로 바꿔주세요.',
    '{"url": "https://picsum.photos/seed/hwarodam-day/800/600", "qaNote": "브랜드 톤(무디 다크)과 상충 — 반려 후 야간 외관으로 재제안 예정"}'::jsonb,
    now() - interval '4 days', null
  )
on conflict (id) do nothing;

-- 선차감 (제출 시점 hold) — reference = edit_requests.id
select public.consume_credits(
  '11111111-1111-1111-1111-111111111111', 1, 'edit_text',  '33333333-3333-3333-3333-333333333331');
select public.consume_credits(
  '11111111-1111-1111-1111-111111111111', 1, 'edit_image', '33333333-3333-3333-3333-333333333332');
select public.consume_credits(
  '11111111-1111-1111-1111-111111111111', 1, 'edit_image', '33333333-3333-3333-3333-333333333333');

-- e3 반려 → 환불 (+1, 멱등)
select public.refund_credits(
  '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');

-- ============================================================================
-- [v3] 화로담 사업자정보(businessInfo) 주입 — 실 DB 데모의 발행 게이트 통과용.
-- 인라인 site_config JSON은 v2 시절 손작성이라 businessInfo가 없다(발행 시 409).
-- 여기서 발행본·초안 양쪽에 idempotent하게 채워 데모 재발행을 복원한다.
-- (섹션 구조 전체를 mock 품질로 올리는 동기화는 별도 폴리시 항목.)
-- 값은 web/src/lib/data/mock/hwarodam.ts 의 HWARODAM_SITE_CONFIG.businessInfo 와 일치.
-- ============================================================================
update public.sites
set
  site_config  = jsonb_set(site_config,  '{businessInfo}', '{
    "businessName": "화로담",
    "ownerName": "김대표",
    "businessNumber": "123-45-67890",
    "address": "서울특별시 마포구 화로길 12, 1층",
    "phone": "02-123-4567",
    "email": "kim@hwarodam.kr"
  }'::jsonb),
  draft_config = jsonb_set(draft_config, '{businessInfo}', '{
    "businessName": "화로담",
    "ownerName": "김대표",
    "businessNumber": "123-45-67890",
    "address": "서울특별시 마포구 화로길 12, 1층",
    "phone": "02-123-4567",
    "email": "kim@hwarodam.kr"
  }'::jsonb)
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
