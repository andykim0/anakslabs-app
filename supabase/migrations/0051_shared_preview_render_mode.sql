-- CLINIC v2 keeps the evaluation mode outside SiteConfig so published config bytes stay unchanged.

alter table public.shared_site_previews
  add column render_mode text not null default 'standard';

alter table public.shared_site_previews
  add constraint shared_site_previews_render_mode_check
  check (render_mode in ('standard', 'outreach-safe', 'preview-full'));

comment on column public.shared_site_previews.render_mode is
  'Server-owned preview boundary: standard import, outreach-safe medical, or internal preview-full.';
