-- ByldGo Submittals — initial schema (Step 1)
--
-- What this does, in plain terms:
--   - "accounts" = one row per GC company (single-seat subscription, one owner user).
--   - "submittals" = the log of submittal packages that account is tracking.
--   - Row Level Security (RLS) is turned on for both tables, so a logged-in user's
--     queries can ONLY ever see rows that belong to their own account, enforced by
--     the database itself — not just by app code (defense in depth).
--   - The public, no-login reviewer link (built in Step 2) does NOT go through these
--     RLS policies. It will be read on the server using the Supabase service role
--     key, which bypasses RLS by design — see Step 7 for the isolation rules on that.

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  company_name text not null,
  subscription_status text not null default 'inactive'
    check (subscription_status in ('active', 'inactive')),
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.accounts is
  'One row per GC company. Single seat per subscription — owner_user_id is the only login.';

-- ---------------------------------------------------------------------------
-- submittals
-- ---------------------------------------------------------------------------
create table if not exists public.submittals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,

  -- Core identification
  name text not null,
  project_title text,

  -- Workflow status
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'needs_revision')),

  -- The trade/sub this submittal is for — a plain text label, never a login
  subcontractor_name text,

  -- The external architect/engineer reviewing this package — they never get an
  -- account. They act only through the no-login link scoped by review_token.
  reviewer_name text,
  reviewer_email text,

  -- Points at a Supabase Storage object (PDF/DOCX) — the object path, not a public URL
  file_path text,

  -- Unique, unguessable token for the public /review/[review_token] page.
  -- uuid v4 is not sequential and not enumerable, which is what makes it safe
  -- to put in a URL without also requiring a login.
  review_token uuid not null default gen_random_uuid() unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.submittals is
  'The submittal log for one account. review_token drives the public no-login reviewer link built in Step 2.';

create index if not exists submittals_account_id_idx on public.submittals (account_id);
create index if not exists submittals_status_idx on public.submittals (status);
-- review_token already has a unique index from the "unique" constraint above,
-- which is what the public review page will look it up by.

-- ---------------------------------------------------------------------------
-- keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_accounts_updated_at on public.accounts;
create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

drop trigger if exists set_submittals_updated_at on public.submittals;
create trigger set_submittals_updated_at
  before update on public.submittals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.submittals enable row level security;

-- A user can only see/manage their own account row.
create policy "accounts_select_own" on public.accounts
  for select using (owner_user_id = auth.uid());

create policy "accounts_insert_own" on public.accounts
  for insert with check (owner_user_id = auth.uid());

create policy "accounts_update_own" on public.accounts
  for update using (owner_user_id = auth.uid());

-- A user can only see/manage submittals belonging to their own account.
-- (No public/anon policy here on purpose — the no-login reviewer page reads
-- via the service role key on the server, bypassing RLS. See Step 7.)
create policy "submittals_select_own" on public.submittals
  for select using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "submittals_insert_own" on public.submittals
  for insert with check (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "submittals_update_own" on public.submittals
  for update using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "submittals_delete_own" on public.submittals
  for delete using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );
