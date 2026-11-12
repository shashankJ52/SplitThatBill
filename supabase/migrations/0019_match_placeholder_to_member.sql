-- 0017 let an admin turn a placeholder name into a real account that is NOT in the group yet (the account gets an invite).
-- This adds the other half: the person is already in the group (they joined by the group link, accepted a plain invite, or
-- are still invited), and the admin says "this is actually Sam". Everything that mentioned the placeholder now belongs to
-- that person and the placeholder row goes away. It is refused when the two appear in the same bill or payment, because
-- combining those would merge two people's shares in one bill (or make someone pay themselves).
create or replace function public.link_contact(gid uuid, contact uuid, uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c record; prof record; t record; old text := '"' || contact::text || '"'; new text := '"' || uid::text || '"';
begin
  perform set_config('stb.rpc', '1', true);
  if not public.is_admin(gid) then raise exception 'Only an admin can link people' using errcode = '42501'; end if;
  select role, status, user_id into c from public.members where group_id = gid and person_id = contact;
  if not found or c.status <> 'active' or c.user_id is not null then raise exception 'That person is not a name without an account'; end if;
  select name into prof from public.profiles where id = uid;
  if not found then raise exception 'No such user'; end if;
  select status into t from public.members where group_id = gid and person_id = uid;

  if found and t.status in ('active', 'invited') then
    -- already in the group: combine the placeholder into them
    if exists (select 1 from public.bills where group_id = gid and data::text like '%' || contact::text || '%' and data::text like '%' || uid::text || '%')
       or exists (select 1 from public.payments where group_id = gid and data::text like '%' || contact::text || '%' and data::text like '%' || uid::text || '%') then
      raise exception 'They are both in the same bill or payment, so they cannot be the same person';
    end if;
    update public.bills set data = replace(data::text, old, new)::jsonb where group_id = gid and data::text like '%' || contact::text || '%';
    update public.payments set data = replace(data::text, old, new)::jsonb where group_id = gid and data::text like '%' || contact::text || '%';
    delete from public.members where group_id = gid and person_id = contact;
    return;
  end if;

  -- not in the group yet (or left or was removed earlier): the placeholder becomes their invited membership
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
