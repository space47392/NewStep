-- 1. One active story per user. "Expiry" is enforced purely by query filtering
-- (expires_at > now()) — there's no scheduled job deleting old rows, which keeps
-- this MVP-simple. Expired rows just sit inert until overwritten or deleted.
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint unique_story_per_author unique (author_id)
);

create index stories_expires_at_idx on public.stories (expires_at);

alter table public.stories enable row level security;

create policy "Stories are viewable by everyone"
  on public.stories for select
  using (true);

create policy "Authors can delete their own stories"
  on public.stories for delete
  using (auth.uid() = author_id);

-- No INSERT policy on purpose — stories can only be created through this function,
-- which atomically clears any existing story (active or expired) before inserting
-- the new one, so "only one story per user" holds regardless of expiry state.
create or replace function public.replace_story(p_image_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  delete from public.stories where author_id = auth.uid();

  insert into public.stories (author_id, image_url)
  values (auth.uid(), p_image_url)
  returning id into new_id;

  return new_id;
end;
$$;

-- 2. Storage bucket for story images (public read; one fixed path per user, so a
-- new story just overwrites the last one instead of accumulating files).
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do nothing;

create policy "Story images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'stories');

create policy "Users can upload their own story image"
  on storage.objects for insert
  with check (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own story image"
  on storage.objects for update
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
