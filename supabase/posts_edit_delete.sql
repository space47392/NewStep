-- 1. Authors can delete their own posts. DELETE has no WITH CHECK, so a plain
--    RLS policy is safe here (no cross-policy combination risk like UPDATE has).
-- Comments cascade-delete automatically (comments.post_id already references
-- posts.id on delete cascade).
create policy "Authors can delete their own posts"
  on public.posts for delete
  using (auth.uid() = author_id);

-- 2. Editing goes through this function instead of a general "author can update"
-- RLS policy. Reason: posts already has UPDATE policies for the volunteer/complete
-- workflows. Postgres combines multiple permissive policies with OR across BOTH
-- their USING and WITH CHECK clauses independently — meaning a row can be matched
-- by one policy's USING and validated by a *different* policy's WITH CHECK. A
-- simple "auth.uid() = author_id" edit policy would let an author exploit that to
-- pass the volunteer policy's WITH CHECK (helper_id = auth.uid()) on their own
-- post, accepting their own help request. SECURITY DEFINER bypasses RLS entirely
-- and only ever touches content/category, so it can't interact with those policies.
create or replace function public.edit_post(p_post_id uuid, p_content text, p_category text)
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
  set content = p_content, category = p_category
  where id = p_post_id;
end;
$$;
