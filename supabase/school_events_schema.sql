-- School Events (Step 23). Events are just posts with category = 'Event' —
-- reuses posts' full existing infrastructure (RLS, ownership, edit/delete,
-- comments, likes, save, share, report, category-filtered search, Following/
-- For-You feed inclusion, block filtering) instead of a second content
-- system. Three new nullable columns hold the structured date/time/location
-- a plain post doesn't have; nothing else about posts changes, and these
-- columns are simply left null for every other category.
--
-- No new index for now — post volume doesn't justify one yet. If it ever
-- does, a partial index on upcoming events would help the SchoolScreen query:
--   create index posts_upcoming_events_idx on public.posts (event_date)
--     where category = 'Event';

alter table public.posts
  add column event_date timestamptz,
  add column event_end_time timestamptz,
  add column event_location text;

alter table public.posts
  drop constraint posts_category_check,
  add constraint posts_category_check
    check (category in ('Need Help', 'School Question', 'Looking for Friends', 'Event'));

-- edit_post() needs 3 new optional params. CREATE OR REPLACE can't change a
-- function's signature (Postgres identifies functions by name + argument
-- types) — same reason posts_add_photos.sql had to drop-then-recreate when
-- p_photo_urls was added. Defaults keep this backward compatible with any
-- other 4-arg caller.
drop function if exists public.edit_post(uuid, text, text, text[]);

create or replace function public.edit_post(
  p_post_id uuid,
  p_content text,
  p_category text,
  p_photo_urls text[],
  p_event_date timestamptz default null,
  p_event_end_time timestamptz default null,
  p_event_location text default null
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
  set content = p_content,
      category = p_category,
      photo_urls = p_photo_urls,
      event_date = p_event_date,
      event_end_time = p_event_end_time,
      event_location = p_event_location
  where id = p_post_id;
end;
$$;
