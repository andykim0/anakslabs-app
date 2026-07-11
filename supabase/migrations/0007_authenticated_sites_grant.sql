-- ============================================================================
-- 0007_authenticated_sites_grant.sql — 에디터 초안 저장(saveDraft) 권한 복구
--
-- 배경: sites.saveDraft(services.ts)는 보안 심층방어를 위해 service_role이 아니라
--   세션 클라이언트(authenticated 역할, RLS + guard 트리거 적용)로 UPDATE sites 한다
--   — "고객은 본인 소유 사이트의 name/draft_config/survey만 수정" 불변식.
-- 버그: 0006은 service_role DML만 부여하고 authenticated를 빠뜨렸다. 0001도 anon 회수만
--   하고 authenticated DML을 Supabase 기본 권한에 의존했는데 그게 없어(REFERENCES/TRIGGER/
--   TRUNCATE만 남음) authenticated의 sites UPDATE가 "permission denied"로 실패 →
--   에디터 초안 저장 실패 → 발행 중단. (실 DB 모드에서만 발현 — mock은 이 경로 없음)
-- 조치: authenticated에 sites SELECT/UPDATE 명시 부여. 범위는 RLS(sites_select_own/
--   sites_update_own, client_id=auth.uid())와 guard_site_protected_columns 트리거가
--   그대로 강제한다(허용 컬럼 name/draft_config/survey, 본인 소유 행만) — 권한만 여는 것.
--   INSERT/DELETE는 부여하지 않는다(사이트 생성/삭제는 service_role 경유).
-- ============================================================================

grant select, update on table public.sites to authenticated;
