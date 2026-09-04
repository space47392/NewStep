-- School Stories → Help integration. One additive, nullable column — no new
-- table, no RLS change. Lets a Help post optionally remember which School
-- Story inspired it, powering a small "From a School Story" badge
-- (see StoryOriginBadge.tsx). Never stores story text/author — just the id.
--
-- ON DELETE SET NULL, same pattern as reports.story_id: if the story is
-- later deleted, the Help post keeps working exactly as before — it just
-- quietly loses the badge. Never exposes an expired or deleted story.
--
-- No INSERT policy change needed: posts' existing single INSERT policy
-- (auth.uid() = author_id) already covers writing this column like any other
-- field on a new post — there's no privilege this unlocks (a user already
-- fully controls their own new post's fields), unlike helper_id/status,
-- which is why those go through dedicated RPCs and this doesn't need to.
alter table public.posts
  add column source_story_id uuid references public.stories (id) on delete set null;
