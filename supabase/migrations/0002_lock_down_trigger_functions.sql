-- Security Advisor flagged SECURITY DEFINER functions that anyone could call through the public API.
-- Trigger functions run when their trigger fires; nobody needs to call them directly, so remove all API access.
-- (Database triggers do not check the caller's EXECUTE permission, so sign-up still creates profiles.)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- public.tag_available(text) stays callable by anon and authenticated on purpose:
-- the sign-up screen checks if a tag is free before the person has an account.
