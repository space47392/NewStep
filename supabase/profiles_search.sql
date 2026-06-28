-- Full-text search across full_name, school_name, and interests.
--
-- A trigger (not a generated column) maintains search_text, because
-- to_tsvector(regconfig, text) is STABLE, not IMMUTABLE — Postgres requires
-- IMMUTABLE expressions for GENERATED ALWAYS AS columns, so that approach
-- would be rejected outright.
alter table public.profiles add column search_text tsvector;

create index profiles_search_idx on public.profiles using gin (search_text);

-- SECURITY INVOKER (the default) is correct here, unlike most other triggers in
-- this project — this one only derives a column on the SAME row already being
-- inserted/updated under the existing RLS policies, so no privilege escalation
-- is needed.
create or replace function public.profiles_search_text_update()
returns trigger
language plpgsql
as $$
begin
  new.search_text := to_tsvector('english',
    coalesce(new.full_name, '') || ' ' ||
    coalesce(new.school_name, '') || ' ' ||
    array_to_string(coalesce(new.interests, '{}'), ' ')
  );
  return new;
end;
$$;

create trigger profiles_search_text_trigger
  before insert or update on public.profiles
  for each row execute function public.profiles_search_text_update();

-- Backfill existing rows so search works immediately, not just for future edits.
update public.profiles set search_text = to_tsvector('english',
  coalesce(full_name, '') || ' ' ||
  coalesce(school_name, '') || ' ' ||
  array_to_string(coalesce(interests, '{}'), ' ')
);
