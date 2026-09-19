-- ByldGo Submittals — save each spec section's full text (finishes Step 5)
--
-- What this does, in plain terms:
--   - Up to now, the AI read each section of a spec book to pull out
--     requirements, but only the short requirement descriptions got saved
--     — the section's actual text was thrown away right after. This adds
--     a table to keep it, so a registry row can show you the real source
--     text next to the requirement instead of just a page citation.
--   - "spec_sections" = one row per section the scan found (e.g. "03 30 00
--     – CAST-IN-PLACE CONCRETE"), holding its full text. Several
--     requirements typically point at the same section, so this is stored
--     once per section rather than copied onto every requirement row.
--   - spec_requirements gets a new section_id column linking each
--     requirement back to the section it came from. It's nullable and set
--     to null (rather than deleting the requirement) if its section is
--     ever removed, and it's only filled in for spec books scanned AFTER
--     this update — older ones won't have source text to show, since it
--     was never saved for them.

create table if not exists public.spec_sections (
  id uuid primary key default gen_random_uuid(),
  spec_book_id uuid not null references public.spec_books (id) on delete cascade,

  -- Denormalized on purpose, same reasoning as spec_requirements.account_id.
  account_id uuid not null references public.accounts (id) on delete cascade,

  code text,
  title text,
  label text not null,
  text text not null,

  created_at timestamptz not null default now()
);

comment on table public.spec_sections is
  'Full text of each section a spec book scan found, kept so a registry row can show its real source text, not just a citation.';

create index if not exists spec_sections_spec_book_id_idx on public.spec_sections (spec_book_id);
create index if not exists spec_sections_account_id_idx on public.spec_sections (account_id);

alter table public.spec_requirements
  add column if not exists section_id uuid references public.spec_sections (id) on delete set null;

create index if not exists spec_requirements_section_id_idx on public.spec_requirements (section_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — same tenant-isolation pattern as spec_books/
-- spec_requirements in migration 0004.
-- ---------------------------------------------------------------------------
alter table public.spec_sections enable row level security;

create policy "spec_sections_select_own" on public.spec_sections
  for select using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_sections_insert_own" on public.spec_sections
  for insert with check (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_sections_update_own" on public.spec_sections
  for update using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_sections_delete_own" on public.spec_sections
  for delete using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );
