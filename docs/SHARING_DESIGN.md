# Sharing between people (Phase 3)

Status: design agreed with the owner on 2026-10-20. Migration `0004_sharing.sql` implements the database side.

## Decisions

| Topic | Decision |
|---|---|
| Finding people | Exact search by user tag. Returns name and tag only. |
| Invites | The invited person must accept. Until then they can see nothing about the group. |
| Roles | **Owner** (creator, the "super admin"), **Admin** (made by the owner), **Member**. |
| Owner | Renames or deletes the group, makes and removes admins, can transfer ownership. Cannot leave without transferring. |
| Admins | Add and remove members, approve or deny join requests, rename the group. Cannot remove the owner or other admins. |
| Members | Add bills, payments, comments and tick lists. Can leave. |
| Group link | Anyone in the group can share it. Opening it shows only the group name and who runs it. The visitor taps **Request to join**; an admin approves or denies. Every group gets one automatically and it is permanent; there is no off switch or reset in the app. |
| Removing someone | The app only allows it when their balance is zero. Old bills stay exactly as they were and the person is listed as a former member. If someone will not settle, an admin can **Remove and write off**, which records a visible adjustment so the others' balances stay correct. The removed person loses all access. |
| Editing bills | Only the person who added a bill can edit or delete it. Everyone else comments. |
| Contacts | A friend without the app is a named member of the group (no account). Linking a contact to a real account later is not built yet. |

## Data model

One shared model replaces the per-person tables from Phase 1.

- `groups`: a group or a 1-1 split (`kind`). Has an owner and an optional invite code.
- `members`: who is in a group. `person_id` is the account id for real people, or a made-up id for contacts, and it is the id used inside bills, so one person is the same across all groups. `role` and `status` (`invited`, `active`, `removed`, `left`). Rows are never deleted, so history keeps names.
- `join_requests`: people who opened the group link and asked in.
- `bills`, `payments`, `comments`: belong to a group. Comments are their own rows so two people commenting never overwrite each other.
- `lists`, `list_items`: shared checklists. Items are rows, so two people ticking different items never overwrite each other.
- `notifs`: alerts. Created by the database when something happens, never by a client directly.
- Kept as they were: `profiles`, `notes` (personal), `prefs`, `sent_reminders`.

The app still calls the signed-in person "you". It swaps their account id for "you" when loading and back when saving, so the splitting engine does not change.

## Who can do what (enforced in the database)

- A group is readable only by its **active** members.
- Roles and statuses change only through functions that check who is asking (`invite_user`, `accept_invite`, `decide_join`, `set_role`, `remove_member`, `leave_group`, `transfer_ownership`). A direct update cannot change them.
- Bills: any active member can add; only the creator can edit or delete. Payments are add-only.
- Alerts are written by triggers and functions, so nobody can fake an alert to someone else.
- Reminders go through `send_reminder`, which limits one per hour per person and group.
- The public bill link calls `public_bill(token)`, which returns only the bill, how it is split and first names.

## Known limits (to revisit before a public launch)

- "Settle first" removal is checked in the app, not in the database. A modified client could remove someone with an open balance. History is never deleted, so the damage is limited to that person losing access.
- Deleting an account (`delete_my_account`, migration `0011`): the person must first hand over every group that another active account is in (or delete it for everyone). The database refuses otherwise. Groups with nobody else active go with the account. Elsewhere the person leaves, keeping their name on the old bills (their member row stays as a former member with the name copied onto it). Bills, payments, comments and lists they made are kept, because their pointer to the account was made a plain number. Unsettled balances are written off in the app first, as a visible adjustment. The app asks for the password and the word DELETE.
- That the database function can delete from `auth.users` is a Supabase permission that is only exercised against the real project, not in the local tests.
- Names inside bills are ids, so a member could reference a person outside the group; they cannot see that person's data.
- The built-in email sender is a personal Gmail account (500 emails a day).
