-- Story views (Step 13). Private, minimal — mirrors post_saves' private-select
-- pattern (Step 11), except the SELECT check is on the STORY's ownership
-- rather than the viewer's own id: only the story's author may ever read who
-- viewed it. No UPDATE/DELETE policy — views aren't editable or removable by
-- anyone in v1. Deliberately stores only ids, same as likes/saves/follows —
-- no profile data duplicated here.

create table public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_story_view unique (story_id, viewer_id)
);

create index story_views_story_id_idx on public.story_views (story_id, created_at desc);

alter table public.story_views enable row level security;

-- Only the story's own author can ever read who viewed it — not even the
-- viewers themselves get a "did I view this" read back from this table.
create policy "Story owners can view their story's viewers"
  on public.story_views for select
  using (
    exists (
      select 1 from public.stories
      where stories.id = story_views.story_id
        and stories.author_id = auth.uid()
    )
  );

-- A viewer can only ever record a view as themselves — never on someone
-- else's behalf. The unique constraint (not just this check) is what actually
-- prevents duplicate views, same as likes.ts's unique_like.
create policy "Users can record their own story view"
  on public.story_views for insert
  with check (auth.uid() = viewer_id);
