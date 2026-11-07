-- Link a placeholder name (a contact with no account) to a real person who has since signed up, so the group's
-- bills do not have to be re-entered. The contact's row becomes that person's row (invited, so they still have to
-- accept), and every mention of the contact in the group's bills and payments is rewritten to the person's account.
-- Contact ids are random uuids, so replacing the quoted id as text only ever touches that id (keys and values alike).
create function public.link_contact(gid uuid, contact uuid, uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c record; prof record; old text := '"' || contact::text || '"'; new text := '"' || uid::text || '"';
begin
  perform set_config('stb.rpc', '1', true);
  if not public.is_admin(gid) then raise exception 'Only an admin can link people' using errcode = '42501'; end if;
  select role, status, user_id into c from public.members where group_id = gid and person_id = contact;
  if not found or c.status <> 'active' or c.user_id is not null then raise exception 'That person is not a name without an account'; end if;
  select name into prof from public.profiles where id = uid;
  if not found then raise exception 'No such user'; end if;
  if exists (select 1 from public.members where group_id = gid and person_id = uid and status in ('active', 'invited')) then
    raise exception 'That person is already in this group';
  end if;
  -- someone who left or was removed earlier: their old row makes way for the linked one
  delete from public.members where group_id = gid and person_id = uid;
  update public.members
     set person_id = uid, user_id = uid, display_name = prof.name, role = 'member', status = 'invited',
         invited_by = auth.uid(), joined_at = null, removed_at = null
   where group_id = gid and person_id = contact;
  update public.bills set data = replace(data::text, old, new)::jsonb where group_id = gid and data::text like '%' || contact::text || '%';
  update public.payments set data = replace(data::text, old, new)::jsonb where group_id = gid and data::text like '%' || contact::text || '%';
  perform public.push_notif(uid, jsonb_build_object(
    'kind', 'invite', 'gid', gid,
    'text', public.person_name(auth.uid()) || ' invited you to ' || public.group_label(gid),
    'sub', 'Tap to accept or decline'));
end $$;

revoke all on function public.link_contact(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_contact(uuid, uuid, uuid) to authenticated;
