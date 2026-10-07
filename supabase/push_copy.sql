-- Friendlier push notification wording, in one place.
--
-- Every notification already goes through create_notification(); the
-- triggers that call it each pass their own title/body. Rather than editing
-- every trigger (and risking their guards), this re-declares
-- create_notification() with the SAME checks and insert as
-- notifications_push_payload_fix.sql, and only rewrites the push title/body
-- by type just before sending. The in-app Notifications list is unaffected
-- (it builds its own text from the row), and anything unrecognised keeps the
-- caller's original wording.
--
-- Safe to run more than once. Run after notifications_push_payload_fix.sql.

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
declare
  v_first text;
  v_title text := p_push_title;
  v_body text := p_push_body;
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

  -- First name of whoever did it, for a more personal line.
  if p_actor_id is not null then
    select nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), '')
      into v_first
      from public.profiles
     where id = p_actor_id;
  end if;
  v_first := coalesce(v_first, 'Someone');

  case p_type
    when 'like' then
      v_title := v_first || ' liked your post ❤️';
      v_body := 'Nice one — tap to see it.';
    when 'comment' then
      v_title := v_first || ' commented on your post 💬';
      v_body := 'See what they said.';
    when 'volunteer' then
      v_title := 'Someone''s got you 🤝';
      v_body := v_first || ' offered to help with your request.';
    when 'message' then
      -- Sender's name as the title, message text as the body (unchanged).
      v_title := v_first;
    when 'help_completed' then
      v_title := 'You helped someone today 🎉';
      v_body := 'The request you helped with was marked done. Thanks for showing up!';
    when 'points_earned' then
      v_title := '+1 Community Point ⭐';
      v_body := 'Every bit of help counts.';
    when 'achievement_earned' then
      v_title := 'New sticker unlocked! 🏆';
      v_body := coalesce(p_push_body, 'You earned a new achievement') || ' — it''s on your profile now.';
    when 'follow' then
      v_title := v_first || ' followed you 👋';
      v_body := 'Say hi back?';
    when 'story_wave' then
      v_title := v_first || ' waved at your story 👋';
      v_body := 'Wave back or say hello.';
    when 'thanks_received' then
      v_title := v_first || ' said thank you 💙';
      v_body := 'You made someone''s day.';
    else
      null;
  end case;

  perform public.send_push_notification(
    p_user_id, v_title, v_body,
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
