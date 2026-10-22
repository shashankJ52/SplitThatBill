-- Deleting an account. Two things had to change first:
--
-- 1. Bills, payments, comments and lists pointed at the account that made them and were deleted with it. That would wipe
--    other people's history (a bill someone else is splitting, a payment they were owed). The pointer stays as a plain
--    number, so the history survives and only the account goes.
-- 2. A group's owner was deleted with their account, taking the group with them for everyone. Now an owner must hand
--    the group over first; groups with nobody else in them are removed along with the account.
--
-- Run this once in the Supabase SQL Editor.

alter table public.bills drop constraint if exists bills_created_by_fkey;
alter table public.payments drop constraint if exists payments_created_by_fkey;
alter table public.comments drop constraint if exists comments_author_id_fkey;
alter table public.lists drop constraint if exists lists_created_by_fkey;
alter table public.list_items drop constraint if exists list_items_added_by_fkey;

-- Delete the signed-in person's account. The app checks first and offers to hand groups over; this is the guard that
-- cannot be skipped.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  nm text;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;

  -- a group you own is still in use while another person with an account is active in it
  if exists (
    select 1 from public.groups g
    where g.owner_id = me
      and exists (select 1 from public.members m where m.group_id = g.id and m.user_id is not null and m.user_id <> me and m.status = 'active')
  ) then
    raise exception 'Hand over the groups you own to someone else first' using errcode = '42501';
  end if;

  -- what is left of your own groups is only you, contacts and people who never accepted: it goes with you
  delete from public.groups where owner_id = me;

  -- invitations you never answered simply disappear
  delete from public.members where user_id = me and status = 'invited';

  -- everywhere else you leave, and your name stays on the bills and payments you were part of
  select p.name into nm from public.profiles p where p.id = me;
  perform set_config('stb.rpc', '1', true);
  update public.members
     set status = 'left', removed_at = coalesce(removed_at, now()), user_id = null, display_name = coalesce(nm, display_name, 'Former member')
   where user_id = me;

  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
