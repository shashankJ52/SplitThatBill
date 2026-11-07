-- Found while testing two people against each other: anyone in the same group (or only invited to it) could ask the
-- database for another member's email address, because the whole profiles row was readable. The app never asks for it
-- (it loads only name and tag), but the database should not allow it either. Signed-in people may now read id, name,
-- tag and when the profile was made; the email stays with the sign-in account and the admin functions, which run with
-- their own rights. Updating is limited to name and tag too (the app writes nothing else).
revoke select, update on public.profiles from authenticated;
grant select (id, name, tag, created_at) on public.profiles to authenticated;
grant update (name, tag) on public.profiles to authenticated;
