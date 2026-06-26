-- 1. Comments table
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index comments_post_id_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

create policy "Comments are viewable by everyone"
  on public.comments for select
  using (true);

create policy "Users can insert their own comments"
  on public.comments for insert
  with check (auth.uid() = author_id);

-- 2. Turn on Realtime for this table (required for live comment updates)
alter publication supabase_realtime add table public.comments;
