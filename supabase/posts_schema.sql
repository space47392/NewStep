-- 1. Posts table
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index posts_created_at_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

create policy "Posts are viewable by everyone"
  on public.posts for select
  using (true);

create policy "Users can insert their own posts"
  on public.posts for insert
  with check (auth.uid() = author_id);

-- 2. Required addition to the profiles table from the Profile phase:
--    it currently only lets a user see their OWN row, which would make every
--    other author's name/school/avatar show up blank in the feed.
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);
