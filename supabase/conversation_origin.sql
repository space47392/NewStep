-- "How you met" for chats that start from a help request.
--
-- Adds conversations.origin_post_id: the Need Help post through which the two
-- participants first connected (helper <-> asker). Shown as a small card at
-- the top of the chat. Only ever set once, and only by link_conversation_to_post()
-- below, which checks that the caller and the other participant really are the
-- post's author and helper — so nobody can attach an unrelated post.
--
-- Safe to run more than once.

alter table public.conversations
  add column if not exists origin_post_id uuid references public.posts (id) on delete set null;

create or replace function public.link_conversation_to_post(p_conversation_id uuid, p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
  v_post public.posts;
begin
  if v_uid is null then
    return;
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or (v_conv.user1_id is distinct from v_uid and v_conv.user2_id is distinct from v_uid) then
    return;
  end if;

  -- First connection wins; never overwritten by a later request.
  if v_conv.origin_post_id is not null then
    return;
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if not found or v_post.category is distinct from 'Need Help' or v_post.helper_id is null then
    return;
  end if;

  -- The two participants must be exactly this post's author and helper.
  if not (
    (v_post.author_id = v_conv.user1_id and v_post.helper_id = v_conv.user2_id)
    or (v_post.author_id = v_conv.user2_id and v_post.helper_id = v_conv.user1_id)
  ) then
    return;
  end if;

  update public.conversations set origin_post_id = p_post_id where id = p_conversation_id;
end;
$$;

revoke all on function public.link_conversation_to_post(uuid, uuid) from public;
grant execute on function public.link_conversation_to_post(uuid, uuid) to authenticated;
