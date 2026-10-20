-- How a person likes their Groups tab arranged (drag order of groups and people, settled people swiped away).
-- Personal to each account, so it lives next to the other per-person preferences.
-- Safe to run before the matching app update: the old app ignores the new column.
alter table public.prefs
  add column layout jsonb not null default '{}' check (pg_column_size(layout) < 20000);
