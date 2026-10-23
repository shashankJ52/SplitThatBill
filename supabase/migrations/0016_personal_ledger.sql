-- Personal: each person's own private ledger, for spending that is not split with anyone. It is a group row of a
-- third kind, "me", with only its owner in it. It gets no join link (the link trigger only covers kind "group").
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.groups'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.groups drop constraint %I', c);
  end loop;
end $$;
alter table public.groups add constraint groups_kind_check check (kind in ('group', 'one', 'me'));
