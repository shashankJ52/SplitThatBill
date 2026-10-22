-- Each group (and each 1-1 split) can have its own currency, so a Europe trip can be in euros while the rest stay in
-- dollars. Amounts are not converted: the currency decides the symbol, nothing else. An empty value means "not chosen",
-- and each person then sees their own default currency (their account setting, kept in prefs.layout.currency).
-- Run this once in the Supabase SQL Editor.

alter table public.groups
  add column currency text not null default '' check (currency = '' or currency ~ '^[A-Z]{3}$');
-- admins may change it (the existing "groups: edit" policy), and nothing needs locking

-- The symbol for a currency code, spelled the same way as in the app.
create function public.currency_symbol(code text) returns text
language sql immutable set search_path = '' as $$
  select case code
    when 'EUR' then '€' when 'GBP' then '£' when 'INR' then '₹' when 'CAD' then 'CA$' when 'AUD' then 'A$'
    when 'NZD' then 'NZ$' when 'CHF' then 'CHF ' when 'SGD' then 'S$' when 'HKD' then 'HK$' when 'AED' then 'AED '
    when 'MXN' then 'MX$' when 'BRL' then 'R$' when 'ZAR' then 'R' when 'CNY' then 'CN¥' when 'THB' then '฿'
    else '$' end;
$$;

-- An amount in cents, written in the currency that applies to one person in one group: the group's own currency if it
-- has one, otherwise that person's default, otherwise dollars.
create function public.money_in(c numeric, gid uuid, uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.currency_symbol(coalesce(
    nullif((select g.currency from public.groups g where g.id = gid), ''),
    nullif((select p.layout ->> 'currency' from public.prefs p where p.user_id = uid), ''),
    'USD')) || to_char(c / 100.0, 'FM999,999,999,990.00');
$$;
revoke all on function public.currency_symbol(text), public.money_in(numeric, uuid, uuid) from public, anon, authenticated;

-- Alerts now say amounts in the right currency.
create or replace function public.notify_bill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record; share numeric; title text := coalesce(new.data ->> 'title', 'a bill');
begin
  for m in select user_id, person_id from public.members
           where group_id = new.group_id and status = 'active' and user_id is not null and user_id <> new.created_by loop
    share := coalesce((new.data -> 'shares' ->> m.person_id::text)::numeric, 0);
    perform public.push_notif(m.user_id, jsonb_build_object(
      'text', public.person_name(new.created_by) || ' added ' || title || ' to ' || public.group_label(new.group_id),
      'sub', case when share > 0 then 'Your share ' || public.money_in(share, new.group_id, m.user_id) else 'You are not in this one' end,
      'billId', new.id, 'gid', new.group_id));
  end loop;
  return new;
end $$;

create or replace function public.notify_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  link text := coalesce(new.data ->> 'linkId', new.id::text);
  total numeric;
begin
  select coalesce(sum((p.data ->> 'amt')::numeric), 0) into total
  from public.payments p
  where p.created_by = new.created_by and coalesce(p.data ->> 'linkId', p.id::text) = link;

  for m in select user_id from public.members
           where group_id = new.group_id and status = 'active' and user_id is not null and user_id <> new.created_by
             and person_id::text in (new.data ->> 'from', new.data ->> 'to') loop
    if exists (select 1 from public.notifs n where n.user_id = m.user_id and n.data ->> 'linkId' = link) then continue; end if;
    perform public.push_notif(m.user_id, jsonb_build_object(
      'text', public.person_name(new.created_by) || ' recorded a payment of ' || public.money_in(total, new.group_id, m.user_id),
      'sub', public.group_label(new.group_id), 'gid', new.group_id, 'pid', new.created_by, 'linkId', link));
  end loop;
  return new;
end $$;

create or replace function public.send_reminder(gid uuid, to_person uuid, amt bigint, msg text) returns void
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
    'sub', public.group_label(gid) || ' · ' || public.money_in(amt, gid, target.user_id), 'msg', left(msg, 500)));
end $$;

-- The public bill link shows the amounts in the group's currency (empty: the visitor sees dollars).
create or replace function public.public_bill(t text) returns jsonb
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
    'names', names,
    'currency', coalesce((select g.currency from public.groups g where g.id = b.group_id), ''));
end $$;
