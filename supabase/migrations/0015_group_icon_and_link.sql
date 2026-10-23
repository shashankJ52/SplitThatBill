-- A group can wear an emoji in its line bullet (instead of the first letter of its name).
alter table public.groups add column if not exists icon text not null default '' check (char_length(icon) <= 16);

-- Every group now starts with its join link switched on (people who open it can only ask to join; an admin
-- approves each one). An admin can still turn it off or make a new one.
create or replace function public.give_group_a_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'group' and new.invite_code is null then
    new.invite_code := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end $$;
revoke all on function public.give_group_a_link() from public, anon, authenticated;

drop trigger if exists give_link on public.groups;
create trigger give_link before insert on public.groups for each row execute function public.give_group_a_link();

-- Groups made before this change get a link too. The lock on invite_code is lifted for this one statement.
select set_config('stb.rpc', '1', true);
update public.groups set invite_code = replace(gen_random_uuid()::text, '-', '') where kind = 'group' and invite_code is null;
