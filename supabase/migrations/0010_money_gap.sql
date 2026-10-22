-- Amounts in alerts now keep a small gap between the currency symbol and the number, like the app does: "$ 12.50".
-- The gap is a no-break space (character 160), so the symbol and the amount never split across lines.
-- Run this once in the Supabase SQL Editor.

create or replace function public.currency_symbol(code text) returns text
language sql immutable set search_path = '' as $$
  select case code
    when 'EUR' then '€' when 'GBP' then '£' when 'INR' then '₹' when 'CAD' then 'CA$' when 'AUD' then 'A$'
    when 'NZD' then 'NZ$' when 'CHF' then 'CHF' when 'SGD' then 'S$' when 'HKD' then 'HK$' when 'AED' then 'AED'
    when 'MXN' then 'MX$' when 'BRL' then 'R$' when 'ZAR' then 'R' when 'CNY' then 'CN¥' when 'THB' then '฿'
    else '$' end;
$$;

create or replace function public.money_in(c numeric, gid uuid, uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.currency_symbol(coalesce(
    nullif((select g.currency from public.groups g where g.id = gid), ''),
    nullif((select p.layout ->> 'currency' from public.prefs p where p.user_id = uid), ''),
    'USD')) || chr(160) || to_char(c / 100.0, 'FM999,999,999,990.00');
$$;
