-- Story "Say Hi" wave (Step 14 / School Stories 1.0). No new table — a wave is
-- a one-off, ephemeral courtesy, not a persisted relationship worth tracking
-- duplicates of (unlike follows/likes/saves). Reuses the existing
-- create_notification() guard-flag pattern (see notify_new_follow() in
-- follows_schema.sql) via one new SECURITY DEFINER RPC the client calls
-- directly — same shape as volunteer_to_help()/edit_post() in
-- secure_help_lifecycle.sql / posts_edit_delete.sql. create_notification()
-- itself is untouched; only its type CHECK constraint is widened.

alter table public.notifications
  drop constraint notifications_type_check,
  add constraint notifications_type_check
    check (type in (
      'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
      'achievement_earned', 'message', 'follow', 'story_wave'
    ));

create or replace function public.send_story_wave(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  waver_name text;
begin
  select author_id into target_author_id
  from public.stories
  where id = p_story_id and expires_at > now();

  if target_author_id is null then
    raise exception 'This story is no longer available.';
  end if;

  if target_author_id = auth.uid() then
    return; -- waving at your own story is a silent no-op, not an error
  end if;

  if public.users_blocked(auth.uid(), target_author_id) then
    raise exception 'Unable to send this.';
  end if;

  select full_name into waver_name from public.profiles where id = auth.uid();

  perform set_config('newstep.allow_notification_create', 'on', true);
  perform public.create_notification(
    target_author_id, auth.uid(), 'story_wave', null, null, null,
    'Someone said hi 👋', coalesce(waver_name, 'Someone') || ' said hi to your story!'
  );
end;
$$;
