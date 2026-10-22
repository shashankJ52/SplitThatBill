-- The admin dashboard: who the admins are, and the numbers and lists they can see.
--
-- Admins are listed in public.admins, which nobody can read or change from the app. You add yourself once, in the
-- SQL Editor, after creating the admin user (see docs/ADMIN.md). Every function below refuses anyone who is not listed.
-- The functions return counts and the feedback inbox, never anyone's bills, notes or messages.
--
-- Run this once in the Supabase SQL Editor.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from public, anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- A user created in the Supabase dashboard (like the admin) has no name or tag in its sign-up details, which used to make
-- the profile fail. Now such a user gets a name from its email and a generated tag. The app always sends both, so a
-- sign-up from the app behaves exactly as before, including failing when the tag is taken.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  nm text := btrim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  tg text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'tag', '')));
begin
  if nm = '' and tg = '' then
    nm := left(initcap(replace(split_part(coalesce(new.email, 'member'), '@', 1), '.', ' ')), 40);
    if nm = '' then nm := 'Member'; end if;
    tg := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, name, email, tag) values (new.id, nm, coalesce(new.email, ''), tg);
  return new;
end $$;

-- ---------- the numbers ----------
create function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  r jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new7', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'new30', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
      'disabled', (select count(*) from auth.users where banned_until is not null and banned_until > now())),
    'groups', jsonb_build_object(
      'groups', (select count(*) from public.groups where kind = 'group'),
      'ones', (select count(*) from public.groups where kind = 'one')),
    'bills', jsonb_build_object(
      'total', (select count(*) from public.bills),
      'd7', (select count(*) from public.bills where created_at > now() - interval '7 days'),
      'd30', (select count(*) from public.bills where created_at > now() - interval '30 days')),
    -- a payment spread over several groups is stored as several rows with one link id: count it once
    'payments', jsonb_build_object(
      'total', (select count(distinct coalesce(data ->> 'linkId', id::text)) from public.payments),
      'd7', (select count(distinct coalesce(data ->> 'linkId', id::text)) from public.payments where created_at > now() - interval '7 days'),
      'd30', (select count(distinct coalesce(data ->> 'linkId', id::text)) from public.payments where created_at > now() - interval '30 days')),
    'scans', jsonb_build_object(
      'total', (select coalesce(sum(n), 0) from public.scan_usage),
      'today', (select coalesce(sum(n), 0) from public.scan_usage where day = today),
      'd7', (select coalesce(sum(n), 0) from public.scan_usage where day > today - 7)),
    'feedback', jsonb_build_object(
      'total', (select count(*) from public.feedback),
      'down', (select count(*) from public.feedback where rating = 'down'),
      'up', (select count(*) from public.feedback where rating = 'up'),
      'love', (select count(*) from public.feedback where rating = 'love'))
  ) into r;
  return r;
end $$;

-- ---------- the feedback inbox, newest first ----------
create function public.admin_feedback(lim int default 100, only_rating text default null)
returns table (id uuid, created_at timestamptz, rating text, message text, contact text, page text, device text, user_name text, user_tag text, user_email text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select f.id, f.created_at, f.rating, f.message, f.contact, f.page, f.device, p.name, p.tag, p.email
    from public.feedback f left join public.profiles p on p.id = f.user_id
    where only_rating is null or f.rating = only_rating
    order by f.created_at desc
    limit least(greatest(coalesce(lim, 100), 1), 500);
end $$;

-- ---------- the people ----------
create function public.admin_users(lim int default 500)
returns table (id uuid, name text, tag text, email text, created_at timestamptz, last_sign_in_at timestamptz, disabled boolean, groups int, bills int, payments int, scans int, is_admin boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select p.id, p.name, p.tag, p.email, p.created_at, u.last_sign_in_at,
      coalesce(u.banned_until > now(), false),
      (select count(*)::int from public.members m where m.user_id = p.id and m.status = 'active'),
      (select count(*)::int from public.bills b where b.created_by = p.id),
      (select count(distinct coalesce(x.data ->> 'linkId', x.id::text))::int from public.payments x where x.created_by = p.id),
      (select coalesce(sum(s.n), 0)::int from public.scan_usage s where s.user_id = p.id),
      exists (select 1 from public.admins a where a.user_id = p.id)
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc
    limit least(greatest(coalesce(lim, 500), 1), 2000);
end $$;

-- Switch someone off (they cannot sign in and their open sessions end) or back on. Nothing of theirs is deleted.
create function public.admin_set_disabled(target uuid, off boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if target = (select auth.uid()) then raise exception 'You cannot disable your own account'; end if;
  if exists (select 1 from public.admins where user_id = target) then raise exception 'An admin cannot be disabled here'; end if;
  update auth.users set banned_until = case when off then now() + interval '100 years' else null end where id = target;
  if not found then raise exception 'No such user'; end if;
  if off and to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using target; end if;
end $$;

revoke all on function public.admin_overview(), public.admin_feedback(int, text), public.admin_users(int), public.admin_set_disabled(uuid, boolean) from public, anon;
grant execute on function public.admin_overview(), public.admin_feedback(int, text), public.admin_users(int), public.admin_set_disabled(uuid, boolean) to authenticated;
