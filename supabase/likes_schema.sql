-- 1. One row per (post, user) — the unique constraint is what actually prevents
--    duplicate likes, not just client-side checks.
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_like unique (post_id, user_id)
);

create index likes_post_id_idx on public.likes (post_id);

-- Realtime DELETE events only carry the primary key by default — without FULL
-- replica identity, postgres_changes can't filter by post_id on unlike events,
-- and payload.old wouldn't include user_id either.
alter table public.likes replica identity full;

alter table public.likes enable row level security;

create policy "Likes are viewable by everyone"
  on public.likes for select
  using (true);

create policy "Users can like posts as themselves"
  on public.likes for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own like"
  on public.likes for delete
  using (auth.uid() = user_id);

-- 2. Denormalized count on posts, kept in sync by triggers — avoids an N+1 count
-- query per post when rendering a feed.
alter table public.posts add column like_count integer not null default 0;

create or replace function public.handle_like_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set like_count = like_count + 1 where id = new.post_id;
  return new;
end;
$$;

create trigger on_like_added
  after insert on public.likes
  for each row execute function public.handle_like_added();

create or replace function public.handle_like_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set like_count = like_count - 1 where id = old.post_id;
  return old;
end;
$$;

create trigger on_like_removed
  after delete on public.likes
  for each row execute function public.handle_like_removed();

-- 3. Realtime for live like/unlike updates
alter publication supabase_realtime add table public.likes;
