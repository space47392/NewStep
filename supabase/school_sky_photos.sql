-- School Sky photos ("Look up"): a star can carry one photo of the real
-- sky, taken with the camera. Run AFTER school_sky.sql. Safe to run more
-- than once.
--
-- One photo per student at a fixed path (<user id>/sky.jpg) in the `sky`
-- bucket, overwritten on each new photo — the same pattern as stories, so
-- account deletion can remove it by path (see src/lib/accountStorage.ts).

alter table public.sky_stars add column if not exists photo_url text;

-- Storage --------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('sky', 'sky', true)
on conflict (id) do nothing;

drop policy if exists "Sky photos are publicly readable" on storage.objects;
create policy "Sky photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'sky');

drop policy if exists "Users can upload their own sky photo" on storage.objects;
create policy "Users can upload their own sky photo"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sky' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own sky photo" on storage.objects;
create policy "Users can update their own sky photo"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'sky' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own sky photo" on storage.objects;
create policy "Users can delete their own sky photo"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'sky' and (storage.foldername(name))[1] = auth.uid()::text);

-- set_my_star, now with an optional photo --------------------------------

drop function if exists public.set_my_star(text, text);

create or replace function public.set_my_star(p_mood text, p_note text, p_photo_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_school_name text;
  v_last timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo_url, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Only the caller's own sky photo, in this project's `sky` bucket.
  if v_photo is not null
     and v_photo not like '%/storage/v1/object/public/sky/' || auth.uid()::text || '/sky.jpg%' then
    raise exception 'That photo can''t be used';
  end if;

  select school_id, school_name into v_school_id, v_school_name
  from public.profiles where id = auth.uid();

  if v_school_id is null and v_school_name is null then
    raise exception 'Choose your school first';
  end if;

  select updated_at into v_last from public.sky_stars where user_id = auth.uid();
  if v_last is not null and v_last > now() - interval '20 seconds' then
    raise exception 'Give it a few seconds before changing your star again';
  end if;

  insert into public.sky_stars (user_id, school_id, school_name, mood, note, photo_url, updated_at)
  values (auth.uid(), v_school_id, v_school_name, p_mood, v_note, v_photo, now())
  on conflict (user_id) do update
    set school_id = excluded.school_id,
        school_name = excluded.school_name,
        mood = excluded.mood,
        note = excluded.note,
        photo_url = excluded.photo_url,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_my_star(text, text, text) from public;
grant execute on function public.set_my_star(text, text, text) to authenticated;
