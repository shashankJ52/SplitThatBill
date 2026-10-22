-- Feedback from people using the app or the website: a three-level rating and a few words.
-- Nobody can read or write this table directly. People send feedback through submit_feedback(), which limits how much
-- one person (or one network address, when signed out) can send. You read it in the Supabase Table Editor.
-- Run this once in the Supabase SQL Editor.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- who sent it, when they were signed in; kept as null if their account is deleted later
  user_id uuid references auth.users (id) on delete set null,
  rating text not null check (rating in ('down', 'up', 'love')),
  message text not null default '' check (char_length(message) <= 2000),
  -- an email address someone left so they can be answered (optional)
  contact text not null default '' check (char_length(contact) <= 200),
  page text not null default '' check (char_length(page) <= 200),
  device text not null default '' check (char_length(device) <= 300),
  -- a scrambled form of the sender's address, used only to slow down spam from signed-out visitors
  net text not null default ''
);
create index feedback_recent_idx on public.feedback (user_id, created_at);
create index feedback_net_idx on public.feedback (net, created_at);
alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;

create function public.submit_feedback(rating text, message text, contact text, page text, device text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  ip text := split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1);
  key text := case when ip = '' then 'unknown' else md5('stb-feedback:' || btrim(ip)) end;
  recent int;
begin
  if rating is null or rating not in ('down', 'up', 'love') then raise exception 'Choose how you feel about it first'; end if;
  -- slow down floods: 10 a day for a signed-in person, 5 an hour for a signed-out visitor
  if me is not null then
    select count(*) into recent from public.feedback f where f.user_id = me and f.created_at > now() - interval '1 day';
    if recent >= 10 then raise exception 'Thank you! You have sent a lot of feedback today. Please try again tomorrow.'; end if;
  else
    select count(*) into recent from public.feedback f where f.user_id is null and f.net = key and f.created_at > now() - interval '1 hour';
    if recent >= 5 then raise exception 'Thank you! Please wait a little before sending more.'; end if;
  end if;
  insert into public.feedback (user_id, rating, message, contact, page, device, net)
  values (me, rating, left(btrim(coalesce(message, '')), 2000), left(btrim(coalesce(contact, '')), 200), left(coalesce(page, ''), 200), left(coalesce(device, ''), 300), key);
end $$;

revoke all on function public.submit_feedback(text, text, text, text, text) from public;
grant execute on function public.submit_feedback(text, text, text, text, text) to anon, authenticated;
