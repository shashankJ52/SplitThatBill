-- Found while testing 0004 against the real project: when the app creates a group it sends the owner's own member row
-- and the contacts in ONE statement, with ON CONFLICT DO NOTHING so a retry is safe. Two things went wrong inside that
-- single statement, because the owner row being added next to a contact is not yet visible to the checks:
--   1. the admin check for adding a contact could not see the owner row, so every contact was refused;
--   2. with ON CONFLICT, Postgres also requires each new row to be readable by the person adding it, and the contact
--      row was not (read access also depended on being a member).
-- The group's owner may add contacts and read the member rows of a group they own, independent of that row.
drop policy "members: add contact" on public.members;
create policy "members: add contact" on public.members for insert to authenticated with check (
  user_id is null and role = 'member' and status = 'active'
  and (public.is_admin(group_id)
       or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))));

drop policy "members: read" on public.members;
create policy "members: read" on public.members for select to authenticated using (
  public.is_member(group_id)
  or user_id = (select auth.uid())
  or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid())));
