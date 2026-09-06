-- Notifications 2.0 (Step 24). A tapped in-app notification already deep-links
-- precisely (NotificationsScreen has post_id/conversation_id/actor loaded from
-- the row itself) — but a tapped PUSH notification only ever received
-- { type } in its data payload, so App.tsx's response listener had nothing to
-- deep-link with beyond a generic tab. This widens the JSON already being
-- sent to send_push_notification() with the same ids create_notification()
-- already receives as arguments — CREATE OR REPLACE, same signature, no new
-- column/table, no RLS change. Body is otherwise byte-for-byte identical to
-- the version in users_blocked_security_fix.sql.
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

  if p_actor_id is not null and p_actor_id = p_user_id then
    return;
  end if;

  if p_actor_id is not null then
    perform set_config('newstep.allow_users_blocked_check', 'on', true);
    if public.users_blocked(p_user_id, p_actor_id) then
      return;
    end if;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, conversation_id, achievement_id)
  values (p_user_id, p_actor_id, p_type, p_post_id, p_conversation_id, p_achievement_id);

  perform public.send_push_notification(
    p_user_id, p_push_title, p_push_body,
    jsonb_build_object(
      'type', p_type,
      'post_id', p_post_id,
      'conversation_id', p_conversation_id,
      'achievement_id', p_achievement_id,
      'actor_id', p_actor_id
    )
  );
end;
$$;
