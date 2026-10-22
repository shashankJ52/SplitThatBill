-- Receipt scanning costs real money per photo, so each signed-in person gets a fixed number of scans per day.
-- The counter lives here, not in the app, so it cannot be skipped by changing the website's code.
-- Run this once in the Supabase SQL Editor.

create table public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  n int not null default 0 check (n >= 0),
  primary key (user_id, day)
);
alter table public.scan_usage enable row level security;
-- no policies and no grants: the table is only reachable through the two functions below
revoke all on public.scan_usage from public, anon, authenticated;

-- Use one scan. Returns {ok, used, limit, resets_at}; ok is false when today's scans are used up.
-- A "day" is a UTC day, so the counter resets at midnight UTC (resets_at says exactly when).
create function public.take_scan_credit() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'utc')::date;
  daily_limit constant int := 20;
  used int;
  resets timestamptz := ((today + 1)::timestamp at time zone 'utc');
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.scan_usage as u (user_id, day, n) values (uid, today, 1)
    on conflict (user_id, day) do update set n = u.n + 1 where u.n < daily_limit
    returning n into used;
  if used is null then
    return jsonb_build_object('ok', false, 'used', daily_limit, 'limit', daily_limit, 'resets_at', resets);
  end if;
  return jsonb_build_object('ok', true, 'used', used, 'limit', daily_limit, 'resets_at', resets);
end $$;

-- Give a scan back when the reading service failed, so an outage does not use up someone's day.
create function public.refund_scan_credit() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.scan_usage set n = n - 1 where user_id = uid and day = (now() at time zone 'utc')::date and n > 0;
end $$;

revoke all on function public.take_scan_credit(), public.refund_scan_credit() from public, anon;
grant execute on function public.take_scan_credit(), public.refund_scan_credit() to authenticated;
