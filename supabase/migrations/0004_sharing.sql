-- SplitThatBill: sharing between people. See docs/SHARING_DESIGN.md for the decisions behind this.
--
-- Replaces the per-person ledgers/bills/payments/people/notifs tables from 0001 with one shared model.
-- Only test data existed when this was written; the old tables are dropped, not migrated.
-- profiles, notes, prefs and sent_reminders are kept.

drop table if exists public.bills, public.payments, public.ledgers, public.people, public.notifs cascade;

-- =====================================================================================================
-- tables
-- =====================================================================================================
create table public.groups (
  id uuid primary key,
  kind text not null check (kind in ('group', 'one')),
  name text check (name is null or char_length(btrim(name)) between 1 and 40),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  simplify boolean not null default true,
  -- NOTE: deleting an owner's account deletes the group for everyone. A delete-account flow with
  -- ownership transfer is needed before public launch (see docs/SHARING_DESIGN.md).
  owner_id uuid not null references auth.users (id) on delete cascade,
  invite_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who is in a group. person_id is the account id for real people (so one person is the same in every group)
-- or a made-up id for a contact without the app. Rows are never deleted so history keeps names.
create table public.members (
  group_id uuid not null references public.groups (id) on delete cascade,
  person_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'removed', 'left')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  removed_at timestamptz,
  primary key (group_id, person_id),
  unique (group_id, user_id),
  check (user_id is null or person_id = user_id)
);
create index members_user_idx on public.members (user_id) where user_id is not null;

create table public.join_requests (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  primary key (group_id, user_id)
);

create table public.bills (
  id uuid primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bill_date date not null,
  -- long and random: anyone holding the link can read this one bill through public_bill()
  token text not null unique check (char_length(token) >= 12),
  data jsonb not null check (pg_column_size(data) < 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id)
);
create index bills_group_idx on public.bills (group_id, bill_date);

create table public.comments (
  id uuid primary key,
  group_id uuid not null,
  bill_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  sys boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (bill_id, group_id) references public.bills (id, group_id) on delete cascade
);
create index comments_bill_idx on public.comments (bill_id);

create table public.payments (
  id uuid primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pay_date date not null,
  data jsonb not null check (pg_column_size(data) < 4500000), -- may hold a proof image (3 MB max in the app)
  created_at timestamptz not null default now()
);
create index payments_group_idx on public.payments (group_id, pay_date);

create table public.lists (
  id uuid primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 40),
  memo text not null default '' check (char_length(memo) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id)
);

create table public.list_items (
  id uuid primary key,
  group_id uuid not null,
  list_id uuid not null,
  text text not null check (char_length(btrim(text)) between 1 and 80),
  done boolean not null default false,
  done_by uuid references auth.users (id) on delete set null,
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (list_id, group_id) references public.lists (id, group_id) on delete cascade
);
create index list_items_list_idx on public.list_items (list_id);

-- Alerts. Rows are created by triggers and functions below, never by a client.
create table public.notifs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 20000),
  created_at timestamptz not null default now()
);
create index notifs_user_idx on public.notifs (user_id, created_at desc);

-- =====================================================================================================
-- helpers
-- =====================================================================================================
create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where group_id = gid and user_id = (select auth.uid()) and status = 'active');
$$;

create function public.is_admin(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where group_id = gid and user_id = (select auth.uid()) and status = 'active' and role in ('owner', 'admin'));
$$;

-- true when the signed-in person and `other` are in a group together (invited counts, so names show up before accepting)
create function public.shares_group_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members me
    join public.members them on them.group_id = me.group_id
    where me.user_id = (select auth.uid()) and me.status = 'active'
      and them.user_id = other and them.status in ('active', 'invited')
  ) or exists (
    select 1 from public.join_requests jr
    join public.members me on me.group_id = jr.group_id
    where jr.user_id = other and jr.status = 'pending'
      and me.user_id = (select auth.uid()) and me.status = 'active' and me.role in ('owner', 'admin')
  );
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger touch before update on public.groups for each row execute function public.touch_updated_at();
create trigger touch before update on public.bills for each row execute function public.touch_updated_at();
create trigger touch before update on public.lists for each row execute function public.touch_updated_at();

-- Some columns must never be changed by a direct update. Functions below set stb.rpc for their own transaction.
create function public.lock_columns() returns trigger
language plpgsql set search_path = '' as $$
declare col text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  if coalesce(current_setting('stb.rpc', true), '') = '1' then return new; end if;
  foreach col in array tg_argv loop
    if o -> col is distinct from n -> col then
      raise exception 'column % cannot be changed directly', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create trigger lock before update on public.groups for each row execute function public.lock_columns('id', 'kind', 'owner_id', 'invite_code', 'created_at');
create trigger lock before update on public.members for each row execute function public.lock_columns('group_id', 'person_id', 'user_id', 'role', 'status', 'invited_by', 'created_at', 'joined_at', 'removed_at');
create trigger lock before update on public.bills for each row execute function public.lock_columns('id', 'group_id', 'created_by', 'token', 'created_at');
create trigger lock before update on public.lists for each row execute function public.lock_columns('id', 'group_id', 'created_by', 'created_at');
create trigger lock before update on public.list_items for each row execute function public.lock_columns('id', 'group_id', 'list_id', 'added_by', 'created_at');

-- =====================================================================================================
-- alerts written by the database
-- =====================================================================================================
create function public.money(c numeric) returns text
language sql immutable set search_path = '' as $$ select '$' || to_char(c / 100.0, 'FM999999990.00'); $$;

create function public.push_notif(uid uuid, d jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifs (user_id, data)
  values (uid, d || jsonb_build_object('id', gen_random_uuid()::text, 'ts', floor(extract(epoch from now()) * 1000)::bigint, 'read', false));
$$;
revoke all on function public.push_notif(uuid, jsonb) from public, anon, authenticated;

create function public.person_name(uid uuid) returns text
language sql stable security definer set search_path = '' as $$ select coalesce((select name from public.profiles where id = uid), 'Someone'); $$;
revoke all on function public.person_name(uuid) from public, anon, authenticated;

create function public.group_label(gid uuid) returns text
language sql stable security definer set search_path = '' as $$ select coalesce((select name from public.groups where id = gid), 'a 1-1 split'); $$;
revoke all on function public.group_label(uuid) from public, anon, authenticated;

create function public.notify_bill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record; share numeric; title text := coalesce(new.data ->> 'title', 'a bill');
begin
  for m in select user_id, person_id from public.members
           where group_id = new.group_id and status = 'active' and user_id is not null and user_id <> new.created_by loop
    share := coalesce((new.data -> 'shares' ->> m.person_id::text)::numeric, 0);
    perform public.push_notif(m.user_id, jsonb_build_object(
      'text', public.person_name(new.created_by) || ' added ' || title || ' to ' || public.group_label(new.group_id),
      'sub', case when share > 0 then 'Your share ' || public.money(share) else 'You are not in this one' end,
      'billId', new.id, 'gid', new.group_id));
  end loop;
  return new;
end $$;
create trigger notify after insert on public.bills for each row execute function public.notify_bill();

create function public.notify_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record; amt numeric := coalesce((new.data ->> 'amt')::numeric, 0);
begin
  for m in select user_id from public.members
           where group_id = new.group_id and status = 'active' and user_id is not null and user_id <> new.created_by
             and person_id::text in (new.data ->> 'from', new.data ->> 'to') loop
    perform public.push_notif(m.user_id, jsonb_build_object(
      'text', public.person_name(new.created_by) || ' recorded a payment of ' || public.money(amt),
      'sub', public.group_label(new.group_id), 'gid', new.group_id));
  end loop;
  return new;
end $$;
create trigger notify after insert on public.payments for each row execute function public.notify_payment();

create function public.notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  if new.sys then return new; end if;
  select created_by, data ->> 'title' as title into b from public.bills where id = new.bill_id;
  if b.created_by <> new.author_id then
    perform public.push_notif(b.created_by, jsonb_build_object(
      'text', public.person_name(new.author_id) || ' commented on ' || coalesce(b.title, 'your bill'),
      'sub', left(new.text, 80), 'billId', new.bill_id, 'gid', new.group_id));
  end if;
  return new;
end $$;
create trigger notify after insert on public.comments for each row execute function public.notify_comment();

-- =====================================================================================================
-- functions the app calls (each checks who is asking)
-- =====================================================================================================
-- Look up one person by exact tag. Returns only what an invite needs.
create function public.find_user_by_tag(t text) returns table (id uuid, name text, tag text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.tag from public.profiles p
  where lower(p.tag) = lower(btrim(t, ' @')) and (select auth.uid()) is not null limit 1;
$$;

create function public.invite_user(gid uuid, uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cur record; prof record;
begin
  perform set_config('stb.rpc', '1', true);
  if not public.is_admin(gid) then raise exception 'Only an admin can invite people' using errcode = '42501'; end if;
  select name into prof from public.profiles where id = uid;
  if not found then raise exception 'No such user'; end if;
  select status into cur from public.members where group_id = gid and user_id = uid;
  if found and cur.status = 'active' then raise exception 'Already in this group'; end if;
  if found and cur.status = 'invited' then return; end if;
  insert into public.members (group_id, person_id, user_id, display_name, role, status, invited_by)
  values (gid, uid, uid, prof.name, 'member', 'invited', auth.uid())
  on conflict (group_id, person_id) do update
    set status = 'invited', role = 'member', display_name = excluded.display_name, invited_by = auth.uid(), removed_at = null;
  perform public.push_notif(uid, jsonb_build_object(
    'kind', 'invite', 'gid', gid,
    'text', public.person_name(auth.uid()) || ' invited you to ' || public.group_label(gid),
    'sub', 'Tap to accept or decline'));
end $$;

create function public.accept_invite(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('stb.rpc', '1', true);
  update public.members set status = 'active', joined_at = now()
  where group_id = gid and user_id = auth.uid() and status = 'invited';
  if not found then raise exception 'No invite to accept'; end if;
  perform public.push_notif(g.owner_id, jsonb_build_object('gid', gid,
    'text', public.person_name(auth.uid()) || ' joined ' || public.group_label(gid), 'sub', 'Invite accepted'))
  from public.groups g where g.id = gid;
end $$;

create function public.decline_invite(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('stb.rpc', '1', true);
  update public.members set status = 'left', removed_at = now()
  where group_id = gid and user_id = auth.uid() and status = 'invited';
end $$;

-- Turn the group link on (makes a new code, which also replaces an old one) or off.
create function public.set_invite_link(gid uuid, enabled boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  perform set_config('stb.rpc', '1', true);
  if not public.is_admin(gid) then raise exception 'Only an admin can change the group link' using errcode = '42501'; end if;
  code := case when enabled then replace(gen_random_uuid()::text, '-', '') else null end;
  update public.groups set invite_code = code where id = gid;
  return code;
end $$;

-- What someone sees after opening a group link, before they are approved.
create function public.group_preview(code text) returns table (group_name text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select coalesce(g.name, 'a 1-1 split'), public.person_name(g.owner_id)
  from public.groups g where g.invite_code = code and code is not null and (select auth.uid()) is not null;
$$;

create function public.request_join(code text) returns text
language plpgsql security definer set search_path = '' as $$
declare g record; m record;
begin
  perform set_config('stb.rpc', '1', true);
  select id, name into g from public.groups where invite_code = code and code is not null;
  if not found then raise exception 'This link is not valid any more'; end if;
  select status into m from public.members where group_id = g.id and user_id = auth.uid();
  if found and m.status = 'active' then return 'member'; end if;
  insert into public.join_requests (group_id, user_id) values (g.id, auth.uid())
  on conflict (group_id, user_id) do update set status = 'pending', created_at = now(), decided_by = null, decided_at = null
  where public.join_requests.status <> 'pending';
  if found then
    perform public.push_notif(a.user_id, jsonb_build_object('kind', 'join_request', 'gid', g.id, 'pid', auth.uid(),
      'text', public.person_name(auth.uid()) || ' asked to join ' || coalesce(g.name, 'your split'), 'sub', 'Tap to approve or deny'))
    from public.members a where a.group_id = g.id and a.status = 'active' and a.role in ('owner', 'admin') and a.user_id is not null;
  end if;
  return 'requested';
end $$;

create function public.decide_join(gid uuid, uid uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare prof record;
begin
  perform set_config('stb.rpc', '1', true);
  if not public.is_admin(gid) then raise exception 'Only an admin can decide' using errcode = '42501'; end if;
  update public.join_requests set status = case when approve then 'approved' else 'denied' end, decided_by = auth.uid(), decided_at = now()
  where group_id = gid and user_id = uid and status = 'pending';
  if not found then raise exception 'No pending request'; end if;
  if approve then
    select name into prof from public.profiles where id = uid;
    insert into public.members (group_id, person_id, user_id, display_name, role, status, invited_by, joined_at)
    values (gid, uid, uid, prof.name, 'member', 'active', auth.uid(), now())
    on conflict (group_id, person_id) do update set status = 'active', role = 'member', display_name = excluded.display_name, joined_at = now(), removed_at = null;
    perform public.push_notif(uid, jsonb_build_object('gid', gid, 'text', 'You joined ' || public.group_label(gid), 'sub', 'An admin approved your request'));
  else
    perform public.push_notif(uid, jsonb_build_object('text', 'Your request to join ' || public.group_label(gid) || ' was not approved', 'sub', ''));
  end if;
end $$;

-- Only the owner makes or removes admins.
create function public.set_role(gid uuid, pid uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('stb.rpc', '1', true);
  if new_role not in ('admin', 'member') then raise exception 'Role must be admin or member'; end if;
  if not exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) then
    raise exception 'Only the owner can change roles' using errcode = '42501';
  end if;
  update public.members set role = new_role where group_id = gid and person_id = pid and status = 'active' and role <> 'owner' and user_id is not null;
  if not found then raise exception 'That person cannot have this role'; end if;
end $$;

-- Remove someone. History is kept; they lose access. Admins cannot remove the owner or other admins.
create function public.remove_member(gid uuid, pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  perform set_config('stb.rpc', '1', true);
  if not public.is_admin(gid) then raise exception 'Only an admin can remove people' using errcode = '42501'; end if;
  select role, status, user_id into t from public.members where group_id = gid and person_id = pid;
  if not found or t.status not in ('active', 'invited') then raise exception 'Not a member'; end if;
  if t.role = 'owner' then raise exception 'The owner cannot be removed' using errcode = '42501'; end if;
  if t.role = 'admin' and not exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) then
    raise exception 'Only the owner can remove an admin' using errcode = '42501';
  end if;
  update public.members set status = 'removed', removed_at = now() where group_id = gid and person_id = pid;
  if t.user_id is not null then
    perform public.push_notif(t.user_id, jsonb_build_object('text', 'You were removed from ' || public.group_label(gid), 'sub', ''));
  end if;
end $$;

create function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('stb.rpc', '1', true);
  if exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) then
    raise exception 'Transfer ownership before leaving' using errcode = '42501';
  end if;
  update public.members set status = 'left', removed_at = now() where group_id = gid and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not a member'; end if;
end $$;

create function public.transfer_ownership(gid uuid, pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('stb.rpc', '1', true);
  if not exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) then
    raise exception 'Only the owner can transfer ownership' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members where group_id = gid and person_id = pid and status = 'active' and user_id is not null) then
    raise exception 'The new owner must be an active member with an account';
  end if;
  update public.groups set owner_id = pid where id = gid;
  update public.members set role = 'admin' where group_id = gid and user_id = auth.uid();
  update public.members set role = 'owner' where group_id = gid and person_id = pid;
end $$;

-- A friendly reminder. Goes only to the person it is for, at most once an hour per person and group.
create function public.send_reminder(gid uuid, to_person uuid, amt bigint, msg text) returns void
language plpgsql security definer set search_path = '' as $$
declare target record;
begin
  if not public.is_member(gid) then raise exception 'Not a member' using errcode = '42501'; end if;
  select user_id into target from public.members where group_id = gid and person_id = to_person and status = 'active';
  if not found or target.user_id is null then raise exception 'That person cannot get reminders in the app'; end if;
  if target.user_id = auth.uid() then raise exception 'You cannot remind yourself'; end if;
  if exists (select 1 from public.sent_reminders
             where user_id = auth.uid() and data ->> 'gid' = gid::text and data ->> 'to' = to_person::text
               and (data ->> 'ts')::bigint > floor(extract(epoch from now() - interval '1 hour') * 1000)) then
    raise exception 'You already sent a reminder a moment ago';
  end if;
  insert into public.sent_reminders (user_id, id, data)
  values (auth.uid(), gen_random_uuid()::text, jsonb_build_object('gid', gid, 'to', to_person, 'amt', amt, 'text', left(msg, 500), 'ts', floor(extract(epoch from now()) * 1000)::bigint));
  perform public.push_notif(target.user_id, jsonb_build_object(
    'kind', 'remind', 'gid', gid, 'from', auth.uid(),
    'text', public.person_name(auth.uid()) || ' sent you a reminder',
    'sub', public.group_label(gid) || ' · ' || public.money(amt), 'msg', left(msg, 500)));
end $$;

-- What a friend sees from a bill link: this bill, how it is split, first names. No comments, balances or accounts.
create function public.public_bill(t text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b record; names jsonb;
begin
  select * into b from public.bills where token = t and t is not null;
  if not found then return null; end if;
  select coalesce(jsonb_object_agg(m.person_id::text, split_part(coalesce(p.name, m.display_name), ' ', 1)), '{}'::jsonb) into names
  from public.members m left join public.profiles p on p.id = m.user_id where m.group_id = b.group_id;
  return jsonb_build_object(
    'bill', (b.data - 'comments' - 'token' - 'by'),
    'by', b.created_by::text,
    'names', names);
end $$;

-- =====================================================================================================
-- row-level security
-- =====================================================================================================
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.join_requests enable row level security;
alter table public.bills enable row level security;
alter table public.comments enable row level security;
alter table public.payments enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.notifs enable row level security;

-- profiles: you, plus people you share a group with (or who are asking to join your group)
drop policy "own profile: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create policy "groups: read" on public.groups for select to authenticated using (public.is_member(id) or owner_id = (select auth.uid()));
create policy "groups: create" on public.groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "groups: edit" on public.groups for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
create policy "groups: delete" on public.groups for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members: read" on public.members for select to authenticated using (public.is_member(group_id) or user_id = (select auth.uid()));
-- the creator adds themself as owner; admins add contacts (people without an account). Real people join through invites.
create policy "members: add owner" on public.members for insert to authenticated with check (
  user_id = (select auth.uid()) and person_id = user_id and role = 'owner' and status = 'active'
  and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid())));
create policy "members: add contact" on public.members for insert to authenticated with check (
  user_id is null and role = 'member' and status = 'active' and public.is_admin(group_id));
create policy "members: rename contact" on public.members for update to authenticated
  using (user_id is null and public.is_admin(group_id)) with check (user_id is null and public.is_admin(group_id));

create policy "join requests: admins and the asker read" on public.join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin(group_id));

create policy "bills: read" on public.bills for select to authenticated using (public.is_member(group_id));
create policy "bills: add" on public.bills for insert to authenticated with check (public.is_member(group_id) and created_by = (select auth.uid()));
create policy "bills: edit own" on public.bills for update to authenticated
  using (created_by = (select auth.uid()) and public.is_member(group_id)) with check (created_by = (select auth.uid()) and public.is_member(group_id));
create policy "bills: delete own" on public.bills for delete to authenticated using (created_by = (select auth.uid()) and public.is_member(group_id));

create policy "comments: read" on public.comments for select to authenticated using (public.is_member(group_id));
create policy "comments: add" on public.comments for insert to authenticated with check (public.is_member(group_id) and author_id = (select auth.uid()));
create policy "comments: delete own" on public.comments for delete to authenticated using (author_id = (select auth.uid()) and public.is_member(group_id));

create policy "payments: read" on public.payments for select to authenticated using (public.is_member(group_id));
create policy "payments: add" on public.payments for insert to authenticated with check (public.is_member(group_id) and created_by = (select auth.uid()));
create policy "payments: delete own" on public.payments for delete to authenticated using (created_by = (select auth.uid()) and public.is_member(group_id));

create policy "lists: all members" on public.lists for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy "list items: all members" on public.list_items for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));

create policy "alerts: read own" on public.notifs for select to authenticated using (user_id = (select auth.uid()));
create policy "alerts: change own" on public.notifs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "alerts: delete own" on public.notifs for delete to authenticated using (user_id = (select auth.uid()));

-- =====================================================================================================
-- grants (nothing is exposed by default)
-- =====================================================================================================
revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.notes, public.prefs, public.sent_reminders to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update on public.members to authenticated;
grant select on public.join_requests to authenticated;
grant select, insert, update, delete on public.bills, public.lists, public.list_items to authenticated;
grant select, insert, delete on public.comments, public.payments to authenticated;
grant select, update, delete on public.notifs to authenticated;

-- functions: signed-in people only, except the public bill link
revoke all on function public.is_member(uuid), public.is_admin(uuid), public.shares_group_with(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_admin(uuid), public.shares_group_with(uuid) to authenticated;
revoke all on function
  public.find_user_by_tag(text), public.invite_user(uuid, uuid), public.accept_invite(uuid), public.decline_invite(uuid),
  public.set_invite_link(uuid, boolean), public.group_preview(text), public.request_join(text), public.decide_join(uuid, uuid, boolean),
  public.set_role(uuid, uuid, text), public.remove_member(uuid, uuid), public.leave_group(uuid), public.transfer_ownership(uuid, uuid),
  public.send_reminder(uuid, uuid, bigint, text), public.public_bill(text), public.money(numeric)
  from public, anon;
grant execute on function
  public.find_user_by_tag(text), public.invite_user(uuid, uuid), public.accept_invite(uuid), public.decline_invite(uuid),
  public.set_invite_link(uuid, boolean), public.group_preview(text), public.request_join(text), public.decide_join(uuid, uuid, boolean),
  public.set_role(uuid, uuid, text), public.remove_member(uuid, uuid), public.leave_group(uuid), public.transfer_ownership(uuid, uuid),
  public.send_reminder(uuid, uuid, bigint, text), public.money(numeric)
  to authenticated;
grant execute on function public.public_bill(text) to anon, authenticated;
