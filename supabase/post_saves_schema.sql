-- Save / Bookmark (Step 11). One minimal table, structurally identical to
-- likes.ts's likes table, except saves are private: unlike likes (which
-- everyone can see), only the saver can ever see their own saved rows. No
-- denormalized count, no triggers, no SECURITY DEFINER — nothing here is
-- ever shown to anyone but the owner, so there's nothing extra to secure.

create table public.post_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_post_save unique (post_id, user_id)
);

create index post_saves_user_id_idx on public.post_saves (user_id, created_at desc);

alter table public.post_saves enable row level security;

-- Private by design: SELECT is restricted to the owner (unlike likes' "viewable
-- by everyone" policy) so save state can never be read back for anyone else.
create policy "Users can view their own saves"
  on public.post_saves for select
  using (auth.uid() = user_id);

create policy "Users can save posts as themselves"
  on public.post_saves for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own save"
  on public.post_saves for delete
  using (auth.uid() = user_id);
