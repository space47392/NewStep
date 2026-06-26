-- Adds volunteer/helper tracking to "Need Help" posts.
alter table public.posts
  add column status text not null default 'open' check (status in ('open', 'accepted')),
  add column helper_id uuid references public.profiles (id) on delete set null;

-- Lets another student claim an open "Need Help" post by setting themselves as the helper.
-- USING restricts which existing rows can be touched (must be open, not your own post).
-- WITH CHECK restricts what the row can become (you can only set yourself as helper + accepted).
create policy "Students can volunteer to help on open requests"
  on public.posts for update
  using (
    category = 'Need Help'
    and status = 'open'
    and auth.uid() <> author_id
  )
  with check (
    helper_id = auth.uid()
    and status = 'accepted'
  );
