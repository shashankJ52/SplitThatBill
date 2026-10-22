# The admin dashboard

A private page at `/admin` for the person running the app. It shows people, activity, receipts scanned and the feedback
inbox, and lets you switch accounts off and on. It is not linked from anywhere in the app or the website.

## What it shows
- **People:** total, new in 7 and 30 days, how many are switched off.
- **Activity:** groups and 1-1 splits, bills and payments (all time, last 7 and 30 days). A payment spread over several
  groups counts once.
- **Receipts scanned:** total, today, last 7 days (from the daily scan counter).
- **Feedback:** counts for − $ (don't like it), $ (like it), $ $ $ (love it), and every message with who sent it, the
  email if they left one, the page and the device.
- **People list:** name, tag, email, when they joined, last sign-in, and how much each has done. Switch someone off
  (they cannot sign in and their open sessions end, nothing is deleted) or back on.

The numbers are worked out fresh each time you sign in or press Refresh, so they are as current as that moment.
Admins never see anyone's bills, notes or messages, only counts.

## Setting up the admin account (once)
1. Run `supabase/migrations/0013_admin.sql` in the Supabase SQL Editor.
2. Supabase dashboard, **Authentication, Users, Add user, Create new user**. Email `shashank.admin@splitthebill.com`
   (the address does not need to receive mail), a strong password of your own, and tick **Auto Confirm User**.
   Do this soon after step 1, so nobody else can sign up with that address first.
3. Make it an admin, in the SQL Editor:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users
   where email = 'shashank.admin@splitthebill.com' and email_confirmed_at is not null;
   ```

   It should say "Success. 1 row". If it says 0 rows, the user is missing or not confirmed.
4. Go to `/admin` and sign in with that email and password.

Admin is decided by the `admins` table, not by the email address, so having that address is not enough. To add another
admin later, repeat step 3 with their email. To remove one: `delete from public.admins where user_id = '<their id>'`.

## Limits
- Switching a person off sets a very long ban on their login. It ends their open sessions; a phone that already has a
  valid sign-in may keep working for up to an hour until it refreshes.
- There is no delete-user button on purpose: a person who owns shared groups has to hand them over first, which only
  they can do. Switch them off instead.
- That the database may change `auth.users` (for the ban) is a Supabase permission that is only exercised on the real
  project, not in the local tests.
