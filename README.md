# SplitThatBill

**Split a bill the right way: item by item, with your whole trip in one place.**

**Live app: [splitthatbill.app](https://splitthatbill.app)** (tap **Try the demo** on the front page to look around without an account)

SplitThatBill is an installable web app (PWA) for splitting receipts among friends. Scan a receipt or type the items, say who had what, and see who owes whom. It also keeps the shared lists, notes and payments that usually end up scattered across other apps. The look is a New York subway map: groups are "lines", and every group gets a coloured bullet.

> This is an early project that I'm testing with my roommates. It works and it's live, but expect rough edges. Feedback is very welcome (see the end).

## Why I built it

The idea came from a trip to New York. We were juggling three apps for the same days:

- **Apple Notes** for shared links and trip plans
- **WhatsApp** for talking to each other
- **Splitwise** for the actual splits, and at the end of the trip we still reached for paper to write down who had what

I wanted one place that holds all of that together: the money, the lists and the conversation about a bill.

It was also a chance to learn **spec-driven development**, so the project is as much about the process as the product. I spent most of my effort on the problem and its design (who the users are, which screens and components are needed, what the rules are) and wrote those down as specs and decisions. Giving Claude that context and those specs is what brought the app to life. It taught me a lot about designing from a problem instead of from code. The decisions and designs I wrote are kept in [`docs/`](docs/) and the first wireframe is in [`wireframe/`](wireframe/).

## What it does

- **Scan or type a receipt.** A photo is read by Claude to pull out the items, with a totals check so a misread is caught. No receipt? Enter the items yourself.
- **Split item by item.** Assign each item to people, share it in portions, add +1 guests, apply discounts, extras and tax or tip, and have several people pay. Money is handled in whole cents, so totals always match to the cent.
- **Groups and 1-1s.** Balances, "simplify debts", settle-ups, payments and reminders.
- **Share a group** with a link. Anyone who opens it can ask to join, and an admin approves each person.
- **Shared lists and short notes** in every group, plus your own private notes.
- **Personal tab.** A private place for spending you don't split with anyone: bills, an overview and your lists. It never counts towards what you owe or are owed.
- **Share a bill** as a WhatsApp message, a link anyone can open, a picture or a PDF.
- **Many currencies.** Each group has its own currency. Amounts are never converted.
- **Works on a phone and a laptop.** On a laptop or iPad you get a sidebar with your lines, your recent 1-1s and Personal.
- **Accounts you control.** Sign up with an emailed code, and delete your account from inside the app.
- **Feedback button** in the app, and a private admin page for the person running it.

## How it's built

| Part | What I used |
|---|---|
| App | React 19, TypeScript, Vite, `react-router`, installable as a PWA (`vite-plugin-pwa`) |
| Backend | [Supabase](https://supabase.com): Postgres, row-level security on every table, auth, SQL migrations in [`supabase/migrations`](supabase/migrations) |
| Receipt reading | A small serverless function ([`app/api/scan.ts`](app/api/scan.ts)) that sends the photo once to Claude and returns structured items. The photo is never stored, and there is a daily scan limit per person |
| Hosting | Vercel, deployed from `main` |
| Email | Resend for sign-up codes, on the app's own domain |
| Tests | Vitest, including database rules run against a real in-process Postgres ([PGlite](https://pglite.dev)) |
| Exports | Pictures and PDFs are drawn in the browser with no libraries |

A few choices worth knowing about:

- **Money is integers.** Everything is in cents, and leftover pennies go deterministically to the first people in the list.
- **Rules live in the database too.** Row-level security decides who can see and change what, and the tests check those rules directly, not just the screens.
- **No silent edits.** Changes to a bill leave a visible note in its history.

## Run it yourself

You need a recent Node.js (I use 22). The app runs without a backend in demo mode.

```bash
cd app
npm install
npm run dev        # http://localhost:5173
```

On the front page, choose **Try the demo** to use the app with sample data.

To connect your own backend, create a Supabase project, run the migrations in [`supabase/migrations`](supabase/migrations) in order in the SQL editor, and add these to `app/.env.local`:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

The receipt reader also needs `ANTHROPIC_API_KEY` set where the serverless function runs (for example in your Vercel project settings).

Other commands, all from `app/`:

```bash
npm test           # unit tests and database-rule tests
npm run build      # type-check and build for production
npm run lint
```

## Repository map

```
app/            the web app (React) and the receipt-reading function (api/)
  src/money     the splitting engine, pure functions with tests
  src/domain    state, selectors and the bill draft
  src/screens   pages and the split flow
  src/db        database-rule tests
supabase/       SQL migrations (schema, security rules, functions)
docs/           decisions, the sharing design, the admin guide
wireframe/      the first clickable wireframe
```

## Status and what's next

Live and being tested by a few people. Still on my list: a proper legal review of the privacy and terms pages, bot protection on sign-up, error monitoring, push notifications, data export, and more testing on real phones.

## Feedback

I'd love for you to try it and tell me what's confusing, what's broken and what's missing. You can use the feedback button inside the app, open an issue here, or write to **hello@splitthatbill.app**.

## Licence

[MIT](LICENSE). The code is free to use, change and share. The name and look of SplitThatBill are mine, so please pick your own if you build on it.
