-- School Sky "painted sky": each star with a sky photo also stores three
-- colours read from that photo (top, middle and lower sky). The app blends
-- today's colours into the School Sky background. Run AFTER
-- school_sky_photos.sql. Safe to run more than once.

alter table public.sky_stars add column if not exists sky_colors text[];

alter table public.sky_stars drop constraint if exists sky_stars_colors_valid;
alter table public.sky_stars add constraint sky_stars_colors_valid
  check (
    sky_colors is null
    or (
      array_length(sky_colors, 1) = 3
      and array_to_string(sky_colors, ',') ~ '^#[0-9a-f]{6},#[0-9a-f]{6},#[0-9a-f]{6}$'
    )
  );

drop function if exists public.set_my_star(text, text);
drop function if exists public.set_my_star(text, text, text);

create or replace function public.set_my_star(
  p_mood text,
  p_note text,
  p_photo_url text default null,
  p_sky_colors text[] default null
)
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
  -- Colours only make sense alongside a photo.
  v_colors text[] := case when v_photo is null then null else p_sky_colors end;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

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

  insert into public.sky_stars (user_id, school_id, school_name, mood, note, photo_url, sky_colors, updated_at)
  values (auth.uid(), v_school_id, v_school_name, p_mood, v_note, v_photo, v_colors, now())
  on conflict (user_id) do update
    set school_id = excluded.school_id,
        school_name = excluded.school_name,
        mood = excluded.mood,
        note = excluded.note,
        photo_url = excluded.photo_url,
        sky_colors = excluded.sky_colors,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_my_star(text, text, text, text[]) from public;
grant execute on function public.set_my_star(text, text, text, text[]) to authenticated;
