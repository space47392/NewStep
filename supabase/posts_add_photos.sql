-- 1. Up to 5 photo URLs per post. Optional — '{}' for text-only posts.
-- coalesce(array_length(...), 0) is needed because array_length() of an empty
-- array returns NULL in Postgres, not 0.
alter table public.posts
  add column photo_urls text[] not null default '{}',
  add constraint photo_urls_max_5 check (coalesce(array_length(photo_urls, 1), 0) <= 5);

-- 2. edit_post() needs a new parameter — CREATE OR REPLACE can't change a
-- function's signature (functions are identified by name + argument types), so
-- the old 3-argument version has to be dropped explicitly first or it would just
-- end up as a separate overload alongside the new one.
drop function if exists public.edit_post(uuid, text, text);

create or replace function public.edit_post(
  p_post_id uuid,
  p_content text,
  p_category text,
  p_photo_urls text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.posts where id = p_post_id and author_id = auth.uid()) then
    raise exception 'You can only edit your own posts.';
  end if;

  update public.posts
  set content = p_content, category = p_category, photo_urls = p_photo_urls
  where id = p_post_id;
end;
$$;

-- 3. Storage bucket for post photos (public read; upload/delete scoped to the
-- uploading user's own folder — same pattern as avatars/stories).
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

create policy "Post photos are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'post-photos');

create policy "Users can upload their own post photos"
  on storage.objects for insert
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own post photos"
  on storage.objects for delete
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);
