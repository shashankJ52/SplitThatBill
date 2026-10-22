-- Deleting an account straight from Supabase (dashboard, SQL editor) failed whenever that person was in a
-- group: the delete sets members.user_id / invited_by to null, and the column lock refused the change.
-- Lift the lock for the length of a user delete. Only the server can delete from auth.users, so no app
-- user can use this to get around the lock.
create or replace function public.allow_user_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform set_config('stb.rpc', '1', true);
  return old;
end $$;

revoke all on function public.allow_user_delete() from public, anon, authenticated;

drop trigger if exists allow_user_delete on auth.users;
create trigger allow_user_delete before delete on auth.users
  for each row execute function public.allow_user_delete();
