-- Signed-out visitors (the "anon" role) and signed-in users start with broad default table permissions in Supabase.
-- Row-level security already hides other people's rows, but permissions should be exactly what the app needs.
-- Remove everything, then grant back only what 0001 intended.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.people, public.ledgers, public.bills, public.payments,
  public.notes, public.notifs, public.sent_reminders, public.prefs
  to authenticated;
