-- A payment recorded across a 1-1 split and a group (or with an overpayment) is stored as several rows that share a
-- link id, and each row sent its own alert: "recorded a payment of $156.04" and "recorded a payment of $100.00" for one
-- payment of $256.04. Now the pieces are added up and the other person gets a single alert with the full amount.
-- The alert also carries who recorded it (pid), so tapping it can open that person.
create or replace function public.notify_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  link text := coalesce(new.data ->> 'linkId', new.id::text);
  total numeric;
begin
  -- rows inserted together are all visible by the time this runs, so the sum is the whole payment
  select coalesce(sum((p.data ->> 'amt')::numeric), 0) into total
  from public.payments p
  where p.created_by = new.created_by and coalesce(p.data ->> 'linkId', p.id::text) = link;

  for m in select user_id from public.members
           where group_id = new.group_id and status = 'active' and user_id is not null and user_id <> new.created_by
             and person_id::text in (new.data ->> 'from', new.data ->> 'to') loop
    -- one alert per payment, however many pieces it was split into
    if exists (select 1 from public.notifs n where n.user_id = m.user_id and n.data ->> 'linkId' = link) then continue; end if;
    perform public.push_notif(m.user_id, jsonb_build_object(
      'text', public.person_name(new.created_by) || ' recorded a payment of ' || public.money(total),
      'sub', public.group_label(new.group_id), 'gid', new.group_id, 'pid', new.created_by, 'linkId', link));
  end loop;
  return new;
end $$;
