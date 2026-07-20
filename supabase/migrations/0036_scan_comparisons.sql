-- GT$ G2: 기존 30일 공유 스캔 행에 선택 경쟁 URL(최대 2)의 동일 검사 결과를 보관한다.
-- 실제 검색 순위나 스크래핑 데이터는 저장하지 않는다.

alter table public.scans
  add column if not exists comparisons jsonb not null default '[]'::jsonb;

comment on column public.scans.comparisons is
  '선택 경쟁 URL 최대 2개의 구조 신호 스캔 결과. 순위 데이터가 아님';
