# Build log

Tracking progress through the 9-step build plan (see the "Base44 Prompts
Converted for Claude" doc). One step per entry, plain language.

## Step 1 — Database schema ✅ done

**What was built:** the database blueprint for the app, as a SQL file
(`supabase/migrations/0001_init_schema.sql`) plus two small connector files
(`src/lib/supabase/client.ts` and `server.ts`) that let the Next.js app talk
to Supabase.

**In plain terms:**

- **`accounts` table** — one row per GC company. Since this is single-seat
  (one login per company), each account has exactly one owner.
- **`submittals` table** — the actual submittal log: name, project title,
  status (`draft` / `pending_review` / `approved` / `needs_revision`),
  which sub/trade it's for, the reviewer's name and email, a pointer to the
  uploaded file, and a random, unguessable `review_token` — that token is
  what will let a reviewer open one submittal without ever logging in
  (built in Step 2).
- **Row Level Security is turned on for both tables.** This is a database-
  level lock, not just an app-level check: even if there were a bug in the
  app's code, the database itself refuses to hand one GC's data to another
  GC's login. This is what "tenant isolation" means and it's the single
  most important thing to get right early, since it's much harder to bolt
  on later.

**What you should check before the next step:**

1. You'll need a Supabase project. If you don't have one yet for this app,
   create one at supabase.com (separate from any FieldLog/ContractShield
   project — each product should get its own Supabase project so their
   data and billing stay isolated).
2. Once you have a project, run this migration against it — either paste
   the contents of `supabase/migrations/0001_init_schema.sql` into the
   Supabase dashboard's SQL Editor and run it, or use the Supabase CLI
   (`supabase link` then `supabase db push`) if you'd rather do it that
   way.
3. Copy `.env.local.example` to `.env.local` and fill in your project's
   URL and anon key from Project Settings → API in the Supabase dashboard.
   Don't paste those values into chat — just save them into that file.

Nothing here is connected to a live UI yet — Step 2 builds the dashboard
and the public review page that actually use this schema.

## Step 2 — Submittal dashboard + public review page ✅ done

**What was built:**

- **Sign up / sign in** (`/signup`, `/login`) — email + password, one account
  per company. When you sign up, Supabase emails a confirmation link; click
  it, then sign in.
- **Dashboard** (`/dashboard`) — protected, redirects to `/login` if you're
  not signed in. Shows the submittal log as a sortable table (click
  "Status" or "Created" to sort), with color-coded status badges. "+ New
  Submittal" opens a form (name, project, subcontractor, reviewer name/
  email, and an optional file) that creates the row and uploads the file
  to private storage. Clicking any row slides in a detail panel with the
  full record, a "Get file link" button (generates a temporary secure
  link — files are never public), and a copyable no-login reviewer link.
- **Public reviewer page** (`/review/[review_token]`) — no login, no
  account. Opens by the random token only, shows the submittal name/
  project/file, a comments box, and Approve / Request Revision buttons.
  Clicking a button right now just confirms the click reached the server
  — actually changing the status and sending emails is Step 3, on
  purpose, so this page can be tested on its own first.
- **File storage** (`supabase/migrations/0002_storage.sql`) — a private
  bucket where each account can only touch files inside its own folder,
  same isolation principle as the database tables.

**What you should check before the next step:**

1. Run `supabase/migrations/0002_storage.sql` in the Supabase SQL Editor,
   the same way you ran `0001_init_schema.sql`.
2. Pull the latest code (GitHub Desktop → Fetch origin → Pull). If you
   haven't yet, run `npm install` in the project folder once (installs
   all the packages the project depends on — you'll see a `node_modules`
   folder appear, which Git ignores on purpose), then `npm run dev` to
   try it locally at `localhost:3000`.
3. Try the full loop: sign up → confirm email → sign in → create a
   submittal with a file → open its detail panel → copy the reviewer
   link → open that link in a private/incognito window (so it's testing
   as a logged-out reviewer) and confirm it shows the right submittal.
4. In Supabase, under Authentication → Email Templates / URL
   Configuration, you may want to double check the "Site URL" is set —
   this controls where confirmation emails send people.

## Step 3 — Status workflow + email — not started

## Step 3 — Status workflow + email — not started

## Step 4 — Basic AI spec Q&A — not started

## Step 5 — Full split-screen AI Specification Analysis Portal — not started

## Step 6 — Spec revision versioning & change-impact analysis — not started

## Step 7 — Account isolation (hardening pass) — not started

## Step 8 — Sandbox accounts, Stripe paywall & subscription webhooks — not started

## Step 9 — Ball-in-Court tracking & Project Closeout export — not started
