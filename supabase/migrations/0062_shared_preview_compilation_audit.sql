-- CRAWL: keep what the compiler knew, not just the four counters the API response carried.
--
-- A demo can compile without any step reporting a failure and still be thin: pages crawled but
-- contributing no source block, images rejected by the photo gate, a subpage left on a stock hero.
-- None of that survived the response, so a bad preview could only be re-diagnosed by recompiling
-- against a crawl artifact that expires in thirty days. The audit is written with the preview.

alter table public.shared_site_previews
  add column compilation_audit jsonb;

alter table public.shared_site_previews
  add constraint shared_site_previews_compilation_audit_check
  check (compilation_audit is null or jsonb_typeof(compilation_audit) = 'object');

comment on column public.shared_site_previews.compilation_audit is
  'Compiler audit for this preview: source coverage per crawled page, image gate rejections, and per-page section/image/character counts. Null for previews written before the column existed and for import previews, which have no compiler audit.';
