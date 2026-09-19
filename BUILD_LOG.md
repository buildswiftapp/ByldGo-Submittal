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

## Step 3 — Status workflow + email ✅ done

**What was built:**

- **"Send for Review" button** — new, on a draft submittal's detail panel.
  Moves its status from Draft to Pending Review and, if a reviewer email
  is on file, emails them their no-login review link. (This step didn't
  exist yet — Step 2 built the reviewer page, but nothing yet moved a
  submittal into "awaiting review." This button is that missing piece.)
- **Approve / Request Revision now actually work** on the public
  `/review/[review_token]` page — clicking one updates the submittal's
  status (approved / needs_revision), saves whatever the reviewer typed
  into Reviewer Comments (now visible in your detail panel too), and
  emails you a summary. A submittal can only be acted on once while it's
  "Pending Review" — the button won't do anything on an already-decided
  submittal, so a reviewer can't double-submit or someone can't reuse an
  old link to change a decision.
- **Email delivery via Resend** (`src/lib/resend.ts`). If you haven't
  set up a Resend account yet, nothing breaks — emails are just silently
  skipped, and the status changes still work normally.

**What you should check before the next step:**

1. Run `supabase/migrations/0003_reviewer_comments.sql` in the Supabase
   SQL Editor (adds the column that stores what the reviewer typed).
2. Sign up for a free account at **resend.com**, create an API key, and
   add it to `.env.local` as `RESEND_API_KEY=re_...`. For quick testing
   before you verify your own domain, Resend only delivers to the email
   address on your Resend account — that's a Resend limitation, not a
   bug here. Once you verify a sending domain in Resend, set
   `RESEND_FROM_EMAIL` too.
3. Restart `npm run dev` after adding the Resend key (env var changes
   need a restart, unlike regular code edits).
4. Full test: create a submittal with your own email as the reviewer →
   click **Send for Review** → check that email arrives with the
   reviewer link → open that link, add a comment, click **Approve** →
   check that a second email arrives at your account's login email
   summarizing the decision → confirm the submittal now shows
   "Approved" with your comment in the dashboard.

**✅ Tested and confirmed working end-to-end (9/16/2026).** Two things
worth remembering from testing this:

- Leaving `RESEND_FROM_EMAIL` blank in `.env.local` had a bug — a blank
  value still isn't the same as "not set" to the app, so it tried
  sending from an empty address and Resend rejected it. Fixed in
  `src/lib/resend.ts`; leaving it blank now correctly falls back to
  `onboarding@resend.dev`.
- While using that fallback `onboarding@resend.dev` sender (before you
  verify your own domain), test emails may land in **spam** — that's
  normal for a shared sandbox address, not a bug. It'll stop once you
  verify `byldgo.com` in Resend and send from a real address on it.

## Step 4 — AI Specification Registry ✅ done

**Why this looks different from the original plan:** the first version of
Step 4 was a per-submittal "ask a question about this file" search box.
After trying it, the real workflow turned out to be different: a GC
receives one large project spec book (300-400 pages) up front, and what
actually saves time is having AI read the *whole* thing once and hand back
every submittal requirement it found — not answering one-off questions.
This step was rebuilt around that instead.

**What was built:**

- **New "Specifications" area** (nav link at the top of the dashboard,
  next to "Submittal Log"). Upload a full project spec book there (PDF or
  .docx) and give it a name.
- **Two-pass AI scan, running in the background** so the upload itself
  doesn't hang for minutes:
  1. **Segmentation** — AI reads the document in overlapping page windows
     and finds where each CSI spec section begins (its code, title, and
     starting page), so the document is split the way a spec book is
     actually organized, not into arbitrary page blocks. If the document
     has no page numbers (most .docx files) or the AI can't find enough
     section breaks, it falls back to fixed-size blocks automatically so
     the scan still completes.
  2. **Extraction** — each section is read on its own and AI pulls out
     every distinct "submit this to the architect/engineer" requirement in
     it (product data, shop drawings, samples, certifications, mix
     designs, test reports, close-out documents, etc.), written as a
     plain-language line you could drop straight into a submittal log.
- **Registry page** for each uploaded spec book — shows "Scanning..." and
  auto-refreshes while the AI works, then lists every requirement found,
  grouped by division/section, each one showing exactly which section it
  came from. Click **Create Submittal** on any row to turn it into a
  tracked submittal in one click (it's pre-filled with the requirement as
  the name and the spec book as the project) — the row then links straight
  to it in the Submittal Log instead of letting you create a duplicate.
- **The old "Query Specification AI" box is still there too**, in each
  submittal's detail panel — kept as a quick way to ask a one-off question
  about a single file, separate from the full-document registry above.
- **New files:** `supabase/migrations/0004_spec_books.sql` (new
  `spec_books` and `spec_requirements` tables, RLS policies, and a private
  `spec-books` storage bucket), `src/lib/ai/segment.ts` (section
  detection), `src/lib/ai/registryExtract.ts` (per-section requirement
  extraction), `src/lib/ai/concurrency.ts` (runs section scans a few at a
  time instead of all at once), `src/app/dashboard/specs/actions.ts`
  (upload + background processing + "Create Submittal"), and the
  Specifications pages/components under `src/app/dashboard/specs/`.

**What you should check before the next step:**

1. **Run the new migration.** Open `supabase/migrations/0004_spec_books.sql`
   and run its contents in Supabase's SQL Editor, the same way you did for
   the earlier migrations — this step won't work until that table exists.
2. If you haven't already, create an API key at **platform.openai.com**
   (separate from a regular ChatGPT login — it needs its own billing set
   up) and add it to `.env.local` as `OPENAI_API_KEY=sk-...`, then restart
   `npm run dev`.
3. Click **Specifications** in the nav, upload a real project spec book,
   and give it a minute or two — the page should show "Scanning..." and
   then fill in on its own once it's done.
4. Spot-check a handful of registry rows against the actual document: does
   the section it's cited to look right, and does the requirement wording
   make sense? Click **Create Submittal** on one and confirm it shows up
   in the Submittal Log and the row now links to it instead of showing the
   button again.
5. Try a document that's a scanned image with no selectable text (if you
   have one handy) — it should show a clear "failed" message rather than
   silently doing nothing.

**Update:** every AI feature (the Specifications registry above and the
per-submittal Q&A box) now runs on **OpenAI** instead of Anthropic — you
already have an OpenAI account, so this avoids needing two separate AI
providers set up. `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` in `.env.local` no
longer do anything; swap them for `OPENAI_API_KEY`/`OPENAI_MODEL` per the
updated `.env.local.example`.

**Update:** tested end-to-end against a real 1000-requirement spec book scan
(9/18/2026) and two gaps came up, both fixed:

- Fixed a bug where a blank `OPENAI_MODEL=` line in `.env.local` was being
  sent to OpenAI as an empty model name instead of falling back to the
  default — same category of bug as the earlier `RESEND_FROM_EMAIL` issue
  (a blank value isn't the same as "not set" unless the code checks for
  that specifically).
- **Registry rows that are near-identical repeats now collapse into one
  row.** A large spec book's overlapping section windows can cause the
  same requirement to get pulled out more than once, worded almost
  identically — these now show as a single row with a "Show N sources"
  toggle that expands to the original occurrences (each still able to
  become its own submittal, in case you genuinely want one per section).
  This only collapses requirements whose wording matches after ignoring
  case/punctuation/spacing — it does not try to guess that two
  differently-worded requirements mean the same thing, since that's a
  much easier way to accidentally hide a real requirement.
- **You can now edit a submittal's details after it's created.** Useful
  for anything created from the Specifications registry, since those
  start out with just a name and project — no subcontractor or reviewer
  yet. Open a submittal in the Submittal Log and click **Edit** to fill
  in or change the name, project, subcontractor/trade, and reviewer
  name/email.

**Update:** the registry can now create submittals for many rows at once
instead of one click at a time. Every row (except ones that already have a
submittal) has a checkbox; **Select all** / **Select none** at the top pick
everything or clear the selection, and clicking individual checkboxes picks
whatever subset you want. **Create N Submittals** then creates all of them
in one go and reports back how many were created (and flags any that
already existed or failed). This works against the *deduplicated* rows —
selecting and bulk-creating skips over the near-identical repeats collapsed
in the update above, so this doesn't flood the Submittal Log with
duplicates.

**Update:** submittal file attachments now accept any file type, not just
PDF/DOCX (that restriction only ever made sense for the Specifications spec
book upload, which is the one the AI actually reads — a plain submittal
attachment is just stored and shared via a link, so there was no real
reason to limit it).

**Update:** two changes to how the Submittal Log is organized
(`supabase/migrations/0006_submittal_division.sql` — run this one too):

- **The Submittal Log is now grouped by CSI division** (or your project's
  own division scheme, for a non-CSI spec) — the same grouping style
  already used in the Specifications registry. A submittal created from
  the registry picks up its division automatically from the spec section
  it came from; a submittal you create by hand lets you pick one.
- **Division and Subcontractor/trade are now "pick from a list, or just
  type your own" fields**, on both New Submittal and Edit. Division
  suggests the 35 standard CSI MasterFormat divisions (03 - Concrete, 26 -
  Electrical, etc.); Subcontractor suggests ~60 common construction
  project parties — trade subs, suppliers, the design team (architect,
  engineers), owner-side roles, and testing/inspection agencies. Either
  field is happy with something that isn't on the list at all; the list is
  just there to save typing on the common cases.

## Step 5 — Full split-screen AI Specification Analysis Portal ✅ done

The original idea for Step 5 (a portal for browsing a spec section-by-
section) turned out to be mostly covered by the Specifications registry
built in Step 4. The one piece that was still missing — opening a
registry item and reading its actual source text, not just a page
citation — is now in.

- **"View source text" on every registry row.** Each requirement in the
  Specifications registry now has a "View source text" link. Clicking it
  slides open a panel on the right showing the real wording from the spec
  book — the actual section the AI read to find that requirement — instead
  of just a citation like "Section 03 30 00, p. 42". Duplicate/collapsed
  rows can each show their own source, since near-identical requirements
  sometimes come from different sections.
- **Spec sections are now saved permanently.** Up to now, the AI read each
  section of a spec book to pull out requirements, but threw away the
  section's actual text right after — only the short requirement
  description was kept. A new database table now saves each section's
  full text (once per section, not copied onto every requirement), which
  is what makes the "View source text" panel possible.
- **Important — only applies going forward.** This needs a small database
  update (see below), and even after that, only spec books you scan
  *after* running it will have source text available. Spec books you've
  already scanned won't have it retroactively — re-scan one if you want
  to see its source text (the requirements it already created stay put
  either way).

## Step 6 — Spec revision versioning & change-impact analysis — not started

## Step 7 — Account isolation (hardening pass) — not started

## Step 8 — Sandbox accounts, Stripe paywall & subscription webhooks — not started

## Step 9 — Ball-in-Court tracking & Project Closeout export — not started
