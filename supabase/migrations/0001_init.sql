-- SplitThatBill: initial schema (Phase 1, one person's data synced across their devices).
--
-- Design:
--   * Every row belongs to one user (user_id) and row-level security (RLS) lets people see only their own rows.
--   * Each kind of record is its own table, so two devices editing different bills never overwrite each other.
--   * The detail of a record (items, shares, members...) is stored as jsonb in `data`. The app validates it
--     with its TypeScript types and tests. Phase 3 (sharing bills between users) will need these split into
--     proper relational tables; that will be a separate, backed-up migration.
--   * Money inside `data` is always whole cents.
--   * The project has "automatically expose new tables" OFF, so every grant below is explicit.

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  email text not null,
  tag text not null check (tag ~ '^[a-z0-9_]{3,20}$' and tag not in ('admin', 'support')),
  created_at timestamptz not null default now()
);
-- tags are unique ignoring case
create unique index profiles_tag_key on public.profiles (lower(tag));

-- ---------- one table per kind of record ----------
-- people: contacts (name, whether they have the app, their tag)
-- ledgers: groups and 1-1 ledgers (name, color, members, simplify, shared lists)
-- bills / payments: belong to a ledger
-- notes: personal notes and checklists; notifs: alerts; sent: reminders you sent
create table public.people (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb not null check (pg_column_size(data) < 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.ledgers (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  kind text not null check (kind in ('group', 'one')),
  data jsonb not null check (pg_column_size(data) < 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.bills (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  ledger_id text not null,
  bill_date date not null,
  data jsonb not null check (pg_column_size(data) < 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, ledger_id) references public.ledgers (user_id, id) on delete cascade
);
create index bills_ledger_idx on public.bills (user_id, ledger_id);

create table public.payments (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  ledger_id text not null,
  pay_date date not null,
  data jsonb not null check (pg_column_size(data) < 4500000), -- may hold a proof image (3 MB max in the app)
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, ledger_id) references public.ledgers (user_id, id) on delete cascade
);
create index payments_ledger_idx on public.payments (user_id, ledger_id);

create table public.notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb not null check (pg_column_size(data) < 50000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.notifs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb not null check (pg_column_size(data) < 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.sent_reminders (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  data jsonb not null check (pg_column_size(data) < 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- one row per user: custom order of Short notes and which ones are hidden
create table public.prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  note_order jsonb not null default '[]' check (pg_column_size(note_order) < 20000),
  hidden jsonb not null default '[]' check (pg_column_size(hidden) < 20000),
  updated_at timestamptz not null default now()
);

-- ---------- keep updated_at honest ----------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger touch before update on public.people for each row execute function public.touch_updated_at();
create trigger touch before update on public.ledgers for each row execute function public.touch_updated_at();
create trigger touch before update on public.bills for each row execute function public.touch_updated_at();
create trigger touch before update on public.payments for each row execute function public.touch_updated_at();
create trigger touch before update on public.notes for each row execute function public.touch_updated_at();
create trigger touch before update on public.notifs for each row execute function public.touch_updated_at();
create trigger touch before update on public.sent_reminders for each row execute function public.touch_updated_at();
create trigger touch before update on public.prefs for each row execute function public.touch_updated_at();

-- ---------- create a profile when someone signs up ----------
-- The app sends name and tag as sign-up metadata. If the tag is missing, invalid or taken, sign-up fails.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email, tag)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    lower(coalesce(new.raw_user_meta_data ->> 'tag', ''))
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- live "is this tag free?" check for the sign-up screen ----------
create function public.tag_available(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select t ~ '^[a-z0-9_]{3,20}$'
     and t not in ('admin', 'support')
     and not exists (select 1 from public.profiles where lower(tag) = lower(t));
$$;
revoke all on function public.tag_available(text) from public;
grant execute on function public.tag_available(text) to anon, authenticated;

-- ---------- row-level security: everyone sees only their own rows ----------
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.ledgers enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.notes enable row level security;
alter table public.notifs enable row level security;
alter table public.sent_reminders enable row level security;
alter table public.prefs enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: edit" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- the same four rules for every data table
do $$
declare t text;
begin
  foreach t in array array['people', 'ledgers', 'bills', 'payments', 'notes', 'notifs', 'sent_reminders', 'prefs']
  loop
    execute format('create policy "own rows: read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: edit" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------- explicit grants (nothing is exposed by default) ----------
-- Signed-out visitors get nothing except tag_available() above.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;  -- profiles are created only by the sign-up trigger
grant select, insert, update, delete on
  public.people, public.ledgers, public.bills, public.payments,
  public.notes, public.notifs, public.sent_reminders, public.prefs
  to authenticated;
