-- In-app Notifications (Step 6). Builds ON TOP of the existing push system
-- (profiles.expo_push_token, send_push_notification(), and the 3 push triggers
-- in push_notifications_schema.sql) rather than replacing it — every existing
-- push trigger is extended, not rewritten, and send_push_notification() itself
-- is reused verbatim, unchanged.

-- =====================================================================
-- 1. The notifications table
-- =====================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,   -- recipient
  actor_id uuid references public.profiles (id) on delete set null,          -- who did it; null for points/achievement "system" events
  type text not null check (type in (
    'like', 'comment', 'volunteer', 'help_completed', 'points_earned', 'achievement_earned', 'message'
  )),
  post_id uuid references public.posts (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  achievement_id uuid references public.achievements (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Private per-user inbox — never visible to anyone but the recipient.
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

-- The only legitimate client write: marking your own notification read.
-- No INSERT or DELETE policy for authenticated/anon at all — the only writer
-- of new rows is create_notification() below (SECURITY DEFINER).
create policy "Users can mark their own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The UPDATE policy above has no column restriction — same shape as the
-- profiles.points gap from Step 2. Closed the same way: a trigger that
-- rejects any change except read_at, so a client can't rewrite an existing
-- notification into a fabricated one (different type/actor/achievement).
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.actor_id is distinct from old.actor_id
     or new.type is distinct from old.type
     or new.post_id is distinct from old.post_id
     or new.conversation_id is distinct from old.conversation_id
     or new.achievement_id is distinct from old.achievement_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only read_at can be changed on a notification.';
  end if;
  return new;
end;
$$;

create trigger guard_notification_update
  before update on public.notifications
  for each row execute function public.guard_notification_update();

-- =====================================================================
-- 2. Shared, trusted notification-creation helper
-- =====================================================================
-- Every trigger below calls this instead of inserting into notifications
-- directly, so "skip self-notifications" and "also send a push" live in
-- exactly one place. Guarded with a same-transaction flag rather than
-- GRANT/REVOKE — Step 3's postmortem found that revoking EXECUTE broke a
-- legitimate internal SECURITY DEFINER caller in this environment, so this
-- avoids that risk entirely: a direct client RPC call can never create a
-- notification for anyone, itself included.
create or replace function public.create_notification(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_post_id uuid,
  p_conversation_id uuid,
  p_achievement_id uuid,
  p_push_title text,
  p_push_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_notification_create', true), 'off') <> 'on' then
    raise exception 'create_notification() cannot be called directly.';
  end if;

  -- Never notify someone about their own action. System events (points,
  -- achievements) have no actor and SHOULD still reach the user.
  if p_actor_id is not null and p_actor_id = p_user_id then
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, conversation_id, achievement_id)
  values (p_user_id, p_actor_id, p_type, p_post_id, p_conversation_id, p_achievement_id);

  perform public.send_push_notification(p_user_id, p_push_title, p_push_body, jsonb_build_object('type', p_type));
end;
$$;

-- =====================================================================
-- 3. New: like notifications (no push existed for this before either)
-- =====================================================================
create or replace function public.notify_new_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author_id uuid;
  liker_name text;
begin
  select author_id into post_author_id from public.posts where id = new.post_id;

  if post_author_id is not null then
    select full_name into liker_name from public.profiles where id = new.user_id;
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      post_author_id, new.user_id, 'like', new.post_id, null, null,
      'New like', coalesce(liker_name, 'Someone') || ' liked your post'
    );
  end if;

  return new;
end;
$$;

create trigger on_like_added_notify
  after insert on public.likes
  for each row execute function public.notify_new_like();

-- =====================================================================
-- 4. Extended: comment notifications (was push-only; now also in-app)
-- =====================================================================
create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author_id uuid;
  commenter_name text;
begin
  select author_id into post_author_id from public.posts where id = new.post_id;

  if post_author_id is not null then
    select full_name into commenter_name from public.profiles where id = new.author_id;
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      post_author_id, new.author_id, 'comment', new.post_id, null, null,
      'New comment', coalesce(commenter_name, 'Someone') || ' commented on your post'
    );
  end if;

  return new;
end;
$$;
-- Trigger on_comment_created_notify already exists (push_notifications_schema.sql)
-- and already points at this function name — no need to recreate it.

-- =====================================================================
-- 5. Extended: volunteer notifications
-- =====================================================================
create or replace function public.notify_volunteer_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  helper_name text;
begin
  if new.status = 'accepted' and old.status = 'open' and new.helper_id is not null then
    select full_name into helper_name from public.profiles where id = new.helper_id;
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      new.author_id, new.helper_id, 'volunteer', new.id, null, null,
      'Someone is helping!', coalesce(helper_name, 'A student') || ' volunteered to help with your request'
    );
  end if;

  return new;
end;
$$;
-- Trigger on_post_volunteered_notify already exists and already points here.

-- =====================================================================
-- 6. Extended: message notifications
-- =====================================================================
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  sender_name text;
begin
  select case when c.user1_id = new.sender_id then c.user2_id else c.user1_id end
  into recipient_id
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient_id is not null then
    select full_name into sender_name from public.profiles where id = new.sender_id;
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      recipient_id, new.sender_id, 'message', null, new.conversation_id, null,
      coalesce(sender_name, 'New message'), new.content
    );
  end if;

  return new;
end;
$$;
-- Trigger on_message_created_notify already exists and already points here.
-- (The push body still uses the real message text, unchanged from before — the
-- in-app notification deliberately does NOT store message content; see
-- src/lib/notifications.ts's formatNotificationMessage(), which renders a
-- generic "sent you a message" instead, separating push delivery from in-app data.)

-- =====================================================================
-- 7. Extended: help_completed + points_earned, both to the HELPER — the
-- author is the one performing the completion action, so notifying them
-- would violate "don't notify a user about their own action". Same trigger,
-- same exactly-once guard as Steps 1-3 — two more create_notification()
-- calls appended at the end.
-- =====================================================================
create or replace function public.handle_post_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.helper_id is not null then
    perform set_config('newstep.allow_points_change', 'on', true);
    update public.profiles
    set points = points + 1
    where id = new.helper_id;

    insert into public.points_history (user_id, amount, reason, post_id)
    values (new.helper_id, 1, 'help_completed', new.id)
    on conflict (post_id, reason) where post_id is not null do nothing;

    perform set_config('newstep.allow_achievement_award', 'on', true);
    perform public.award_achievements(
      new.helper_id,
      'help_completed',
      (select count(*) from public.posts where helper_id = new.helper_id and status = 'completed')
    );

    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      new.helper_id, null, 'help_completed', new.id, null, null,
      'Nice work!', 'The request you helped with was marked as completed'
    );
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      new.helper_id, null, 'points_earned', null, null, null,
      'Community Point earned', 'You earned 1 Community Point'
    );
  end if;
  return new;
end;
$$;

-- =====================================================================
-- 8. Extended: achievement_earned — one notification per achievement
-- actually newly inserted this call (never for ones already owned, and
-- never a duplicate). Same NOT EXISTS + ON CONFLICT DO NOTHING protection
-- as before; GET DIAGNOSTICS confirms a row was really inserted before
-- notifying, since ON CONFLICT DO NOTHING silently no-ops otherwise.
-- =====================================================================
create or replace function public.award_achievements(p_user_id uuid, p_metric text, p_current_count bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_inserted integer;
begin
  if coalesce(current_setting('newstep.allow_achievement_award', true), 'off') <> 'on' then
    raise exception 'award_achievements() cannot be called directly.';
  end if;

  for r in
    select a.id, a.name
    from public.achievements a
    where a.metric = p_metric
      and a.requirement <= p_current_count
      and not exists (
        select 1 from public.user_achievements ua
        where ua.user_id = p_user_id and ua.achievement_id = a.id
      )
  loop
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user_id, r.id)
    on conflict (user_id, achievement_id) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
      perform set_config('newstep.allow_notification_create', 'on', true);
      perform public.create_notification(
        p_user_id, null, 'achievement_earned', null, null, r.id,
        'Achievement unlocked!', 'You earned "' || r.name || '"'
      );
    end if;
  end loop;
end;
$$;
