# SplitThatBill: Phase 0 Decisions

Status: draft. You said "seems good" without answering the four open questions, so these are my recommended defaults. Change any of them.

| # | Decision | Default | Revisit when |
|---|---|---|---|
| 1 | Platform | Mobile-first PWA (React + TypeScript) | Native camera or push needs outgrow the PWA |
| 2 | Backend | Supabase (Postgres, auth, storage, RLS) | Phase 3 |
| 3 | OCR | Vision-LLM returning structured JSON, validated against the receipt total | Accuracy test on real receipts |
| 4 | Privacy | Redact on-device first, never store the original, user can add manual redaction boxes | Before Phase 2 |
| 5 | Phase 1 scope | Account-free local loop: scan, review, assign, summary, WhatsApp text | n/a |
| 6 | Money | Integer cents only. Leftover pennies go deterministically to the first people in the list | n/a |
| 7 | Tax, tip, fees | Split proportionally to each person's item subtotal. Even split is an option | User feedback |
| 8 | Currency | One currency per expense, no conversion in v1 | Travel use case |
| 9 | Ledger model | Group and one-off are both "ledgers". A one-off is a ledger with a temporary member set | n/a |
| 10 | Non-user contacts | Local named contacts, claimable later by invite email or phone | Phase 3 |
| 11 | Edits after sync | Visible "changed" badge plus history. No silent edits | Phase 3 |

## Screen inventory

1. Home (balances, recent splits, empty state)
2. Capture (camera or upload)
3. Privacy filter (shows what was redacted, manual redaction)
4. Review items (edit, add, delete, reconciliation bar)
5. Assign (item-first and person-first)
6. Details (payer, date, location, ledger)
7. Summary (who owes what, per-person breakdown)
8. Export (WhatsApp, image, PDF)

## Design direction (revision 2)

- **Look:** NYC subway signage. Helvetica bold with tight tracking, colored route bullets (MTA palette) for groups and people, black "sign" panels for totals, a route-line map for balances.
- **Theme:** dark and light, toggled from the header, remembered per device. Defaults to the system setting.
- **Footer (4 buttons):** Groups, Alerts, Split (camera, raised yellow), Account. With four buttons there is no exact center, so the camera sits in the third slot.
- **Groups tab:** totals (you owe, owed, net), list of groups, new group. Group page has bills, who owes whom, split a bill, record payment, and settings (name, color, simplify debts on/off, people).
- **One-off splits** live in a built-in "Quick splits" group that can't be deleted.
- **Alerts:** new bills and payments that involve you, unread badge, mark all read.
- **Account:** name, email, user tag, password, share my tag, theme.

## Revision 3 decisions

- **Ledgers:** groups plus hidden 1-1 ledgers (replaces "Quick splits"). The Groups tab has a People section listing 1-1 people with money outstanding.
- **Shared balances:** the balance with a person adds up their 1-1 ledger and every group you share. A payment from their page is applied 1-1 first, then to groups, so group and header totals always agree. Header totals net out per person.
- **Bills:** tap a bill for items, who pays what, extras, notes and comments. Only the person who added a bill can edit or delete it. Everyone else comments. Edits leave a note in the comments.
- **Splitting an item:** Even (with +1 guests counting as extra shares) or Portions in steps of 0.5 (0.25 for single items). Portions must add up to the item quantity.
- **Extras:** cab, parking and similar, each split evenly between people with items, in proportion to items, or between chosen people.
- **Payments:** optional note and image (3 MB max) saved with the payment.
- **Share link:** public page with items, split and notes only. It shows first names, no balances, groups, tags, emails or comments.
- **Alerts:** bill notifications open the bill.

## Revision 4 decisions

- **Discount:** an optional "Apply discount" under tip, as $ or % of items + tax + tip. It is shared in proportion to items, like tax. Capped at the bill total.
- **Several payers:** a bill can be paid by more than one person with exact amounts that must add up to the total. Balances settle each bill using the net of what each person paid versus their share.
- **Title and location:** every bill has a title. Location is optional and pre-filled from the receipt.
- **Review screen:** items show only name and price. Tap one to edit it and choose who split it.
- **No receipt:** "Enter items yourself" skips scanning. The total is the sum of the items, tax, tip and discount.
- **Scan picker:** up to 5 recent groups and 5 recent people shown as route-bullet chips, with search for all, new group on the spot (any number of people), and someone new. The tab bar stays visible.
- **Groups tab filters:** You owe, Owed and Net work as filters. Net (default) shows everything. "Find or add someone" searches all people.
- **Group list:** each group has a shared tick-off list.
- **Alerts notes:** personal checklists and memos. View as Hide, Recent 3 or All.

## Revision 5 decisions

- **Layout:** the page itself never scrolls. Headers and totals stay put, and only sections scroll (your lines, people, recent splits, notes, each group tab).
- **Alerts:** Recent splits first, Short notes below (collapsed by default, Open shows about three and scrolls). Swipe a split a little to mark read or unread, further to dismiss (with Undo). Keyboard: R and Delete.
- **Lists and notes are one thing:** a name, a checklist and an optional memo. Groups can have many (per store or task). Alerts has the same for personal notes. A box next to + Create searches them.
- **Quick add:** items are added from a row at the top of Review. Enter adds, and tapping an item opens its details and who split it.
- **Split whole bill:** equally between chosen people, or by amount (amounts must add up to the receipt total).
- **Group bills:** current month by default, arrows to change month, All months with sticky month headers.
- **Overview:** People (outer ring share, inner ring paid), Categories (this month outside, last month inside), Trend (a subway map of the last three months, with toggles). Slider or swipe to change month. Tap a slice for details in the middle.
- **Categories:** every bill has one, chosen on Details.
- **Dropdowns:** custom route-bullet menus everywhere instead of native selects.

## Revision 6 decisions

- **Overview months:** the same ‹ Oct 2026 › bar as Bills replaces the slider. In Bills, the All months toggle becomes Month-wise when you're in the all-months view.
- **Alerts:** two tabs, Splits and Short notes. A note has a Save to field: Just me or any group. Group notes appear in that group's Lists tab, and notes can be moved later.
- **Groups tab:** short + New and Find buttons sit opposite the section titles. Tap or drag a section header down to show only that section, tap or drag up to go back.
- **Home button:** appears in the header on every split-bill step. It asks before discarding what you've entered.
- **Whole-bill equal split:** + guests per person, so James +1 counts as two shares.

## Revision 7 decisions

- **Reminders:** in a group's Balances tab, tap a friend's station. A popup shows what you owe each other in that group with a friendly, editable message. On the app it goes only to that person's Alerts. For people not on the app it offers WhatsApp or copy. Reminder alerts open with the message and a Record payment button.
- **Short notes:** each note shows a preview (first three open items, two lines of memo). Tap to expand. Ticks update instantly. Notes with every item ticked are archived under Done and reveal on tap. Group lists with open items also show here, tagged with the group.
- **Alerts:** the bulk button reads Mark all read, then Dismiss all once everything is read, and disappears when empty. Each alert has a route bullet in the group or type color.
- **Removed:** the +1s button on the assign step. Guests are set in Split whole bill.
- **Fixed:** the yellow camera disc peeking under pages without the tab bar.
- **Not in the wireframe yet:** sign up, log in, forgot password, and first-run onboarding.

## Revision 8 decisions

- **Onboarding and accounts:** a three-slide intro (swipe or dots), Create account, Log in, Forgot password and Reset password. Sign up asks for name, email, user tag (live availability), and a password with a strength meter, then a 6-digit email code (demo code 123456, resend with a cooldown). Log in locks for 15 seconds after five wrong tries and never says which field was wrong. Forgot password gives the same message whether or not the email exists. Apple and Google buttons are placeholders. A brand-new account starts empty.
- **Where to see them:** the wireframe still opens on Groups. Use Account > Log out, or Account > Demo: show onboarding and sign up. The intro also has Skip and explore the demo.
- **Reminders from a person page:** a Remind button sits top-right of the balance card, using the combined balance across all groups and 1-1. Same privacy: only that person sees it, and people not on the app get WhatsApp or copy.
- **Short notes filter:** group chips under the search bar (All, Just me, each group), and searching a group name also filters.
- **Short notes order:** press and hold a note, then drag to reorder, or release in place for Move to top and Hide for now. Hidden notes wait under Hidden. Hiding a group list only removes it from your Short notes. Keyboard: M opens the same menu.

## Wireframe

`wireframe/index.html` is a clickable prototype with fake data. Open it in a browser. It uses the same money rules (integer cents, proportional tax and tip, penny distribution) that the real app will use.

## Revision 9 decisions

- **Price for more than one:** when quantity is above 1, the quick-add row and the item editor ask whether the price is for all of them or each. Receipts usually give a total, groceries often give a per-item price. The choice is remembered while you add items, and rows show "$x each".
- **Wording:** the summary now says "Total share $x", with a short breakdown only when tax, tip, discount or extras apply. Group rows no longer show a bill count.
- **Screen sizes checked:** 320x568, 360x640, 360x800, 375x667, 375x812, 390x844, 412x915, 430x932, 600x960, 768x1024, 1024x768, and landscape phones 812x375 and 667x375. Each was audited across 30 screens and sheets for sideways overflow, clipped text, content under the bottom bar and short scroll areas. On landscape phones the frozen headers give way to normal page scrolling. On wide screens the app stays a centered column. Not tested: real devices, notches and safe-area insets, browser zoom and large system font sizes.
