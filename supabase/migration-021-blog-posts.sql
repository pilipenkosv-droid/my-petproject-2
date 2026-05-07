-- Migration 021: blog_posts table
--
-- Цель: переносим Second Brain статьи из TS-модуля (posts-second-brain.ts)
-- в БД, чтобы публикация новой статьи не требовала Vercel rebuild.
-- Драйвер расхода Vercel Pro — Build Minutes ($30/мес из $33). Каждая
-- ночная статья = новый билд. После миграции Second Brain пушит статьи
-- через POST /api/blog/publish, страница блога рендерится через ISR.
--
-- Статические TS-кластеры (posts-gost, posts-pain-clusters, posts-seasonal-draft)
-- остаются в коде — они меняются редко и являются SEO-ядром.

create table if not exists public.blog_posts (
  slug            text primary key,
  title           text not null,
  description     text not null,
  content         text not null,
  date_published  date not null,
  date_modified   date,
  keywords        text[] not null default '{}',
  reading_time    text not null,
  cover_image     text,
  faqs            jsonb,
  tldr            jsonb,
  cluster         text not null default 'second-brain'
                    check (cluster in ('second-brain', 'gost')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists blog_posts_date_published_idx
  on public.blog_posts (date_published desc);

create index if not exists blog_posts_cluster_idx
  on public.blog_posts (cluster);

-- updated_at автообновление
create or replace function public.blog_posts_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.blog_posts_set_updated_at();

-- RLS: read для всех (анонимный блог), write только service_role
alter table public.blog_posts enable row level security;

drop policy if exists "blog_posts_public_read" on public.blog_posts;
create policy "blog_posts_public_read"
  on public.blog_posts for select
  to anon, authenticated
  using (true);

-- service_role обходит RLS автоматически, но явная политика помогает читать структуру
drop policy if exists "blog_posts_service_write" on public.blog_posts;
create policy "blog_posts_service_write"
  on public.blog_posts for all
  to service_role
  using (true) with check (true);
