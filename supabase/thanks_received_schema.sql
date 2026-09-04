-- Community Reputation 2.0 — "Thanks Received" (Step 17). The existing
-- "Thank {helper}" button just posts a plain comment today, which cannot be
-- trusted as a real signal: any comment could look like a thank-you, nothing
-- stops duplicates, and nothing stops someone thanking themselves. This adds
-- the smallest secure mechanism that can actually be trusted — no new table.
--
-- Reuses the EXACT SAME pattern already proven for Community Points:
--   profiles.points          (public total)   <-> points_history (private ledger)
--   profiles.thanks_received_count (public total) <-> points_history, reason='help_thanked' (private ledger, amount 0)
-- "Helped Students" needs no changes at all — it was already correctly
-- derived from posts.helper_id/status (see points.ts's fetchHelpStats()).

-- =====================================================================
-- 1. Public total on profiles — same shape as profiles.points.
-- =====================================================================
alter table public.profiles
  add column thanks_received_count integer not null default 0;

-- =====================================================================
-- 2. Widen points_history to allow a zero-point "help_thanked" entry —
-- reuses its existing private RLS (auth.uid() = user_id) and its existing
-- unique (post_id, reason) index, which is exactly what makes "at most one
-- Thanks Received per completed Help request" a hard database guarantee
-- rather than a client-side promise.
-- =====================================================================
alter table public.points_history
  drop constraint points_history_reason_check,
  add constraint points_history_reason_check
    check (reason in ('help_completed', 'help_thanked'));

-- =====================================================================
-- 3. Widen notifications to allow the helper's "thanks received" alert —
-- same additive pattern as every prior type addition (follow, story_wave).
-- =====================================================================
alter table public.notifications
  drop constraint notifications_type_check,
  add constraint notifications_type_check
    check (type in (
      'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
      'achievement_earned', 'message', 'follow', 'story_wave', 'thanks_received'
    ));

-- =====================================================================
-- 4. Lock down the new column exactly like guard_profile_points_update()
-- locks down profiles.points — a dedicated flag per guarded write path, same
-- convention used throughout this project. Existing profile edits
-- (full_name/school_name/grade/interests/avatar_url/username/school_id)
-- keep working unchanged; only a direct change to thanks_received_count
-- without the flag set is rejected.
-- =====================================================================
create or replace function public.guard_profile_thanks_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_thanks_change', true), 'off') <> 'on' then
    raise exception 'profiles.thanks_received_count cannot be modified directly.';
  end if;
  return new;
end;
$$;

create trigger guard_profile_thanks_update
  before update on public.profiles
  for each row
  when (old.thanks_received_count is distinct from new.thanks_received_count)
  execute function public.guard_profile_thanks_update();

-- =====================================================================
-- 5. thank_helper() — the only legitimate way to create a Thanks Received.
-- SECURITY DEFINER, re-validates everything against the CURRENT row under a
-- row lock (same defensive shape as volunteer_to_help()/mark_post_completed()
-- in secure_help_lifecycle.sql):
--   - caller must be signed in
--   - caller must be the POST'S AUTHOR (not the helper, not anyone else)
--   - the post must actually be status = 'completed'
--   - the post must actually have a helper_id (defensive; already implied by
--     'completed' status, but checked explicitly rather than assumed)
--   - the helper can never be the caller (can't thank yourself — also
--     already structurally impossible via volunteer_to_help()'s own
--     "can't volunteer for your own post" check, but checked again here too)
-- A repeat call for the same post is a silent no-op (the unique index makes
-- the insert a no-op; nothing else runs), not an error — the client can't
-- privately see whether a thanks already exists (points_history is the
-- helper's own private ledger), so this has to be safe to just call again.
-- =====================================================================
create or replace function public.thank_helper(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_uid uuid := auth.uid();
  v_inserted_id uuid;
  v_author_name text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to send thanks.';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;

  if not found then
    raise exception 'Post not found.';
  end if;

  if v_post.author_id <> v_uid then
    raise exception 'Only the post author can thank the helper.';
  end if;

  if v_post.status is distinct from 'completed' then
    raise exception 'This request has not been completed yet.';
  end if;

  if v_post.helper_id is null then
    raise exception 'This request has no helper to thank.';
  end if;

  if v_post.helper_id = v_uid then
    raise exception 'You cannot thank yourself.';
  end if;

  insert into public.points_history (user_id, amount, reason, post_id)
  values (v_post.helper_id, 0, 'help_thanked', p_post_id)
  on conflict (post_id, reason) where post_id is not null do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return; -- already thanked for this post — silent no-op, not an error
  end if;

  perform set_config('newstep.allow_thanks_change', 'on', true);
  update public.profiles
  set thanks_received_count = thanks_received_count + 1
  where id = v_post.helper_id;

  select full_name into v_author_name from public.profiles where id = v_uid;

  perform set_config('newstep.allow_notification_create', 'on', true);
  perform public.create_notification(
    v_post.helper_id, v_uid, 'thanks_received', p_post_id, null, null,
    'You got a thank you 💙', coalesce(v_author_name, 'Someone') || ' thanked you for your help!'
  );
end;
$$;
