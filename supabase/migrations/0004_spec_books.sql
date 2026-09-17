-- ByldGo Submittals — Specifications / AI submittal registry (Step 4 rebuild)
--
-- What this does, in plain terms:
--   - "spec_books" = one row per uploaded project specification book (the
--     whole multi-hundred-page document for a project — separate from an
--     individual "submittals" row, which is one package for one trade).
--   - "spec_requirements" = the AI-extracted registry: every submittal
--     requirement the AI found while scanning the spec book, each tied back
--     to the section/pages it came from. submittal_id gets filled in once
--     you turn a registry row into an actual tracked submittal.
--   - Same tenant-isolation pattern as Step 1: RLS policies keyed on
--     auth.uid() via the owning account, not just app-level filtering.

-- ---------------------------------------------------------------------------
-- spec_books
-- ---------------------------------------------------------------------------
create table if not exists public.spec_books (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,

  name text not null,
  file_path text not null,

  -- 'processing' while the AI is scanning it (this can take a few minutes
  -- for a large document), 'ready' once the registry is populated,
  -- 'failed' if something went wrong (see error).
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.spec_books is
  'One row per uploaded project specification book. Scanning it populates spec_requirements.';

create index if not exists spec_books_account_id_idx on public.spec_books (account_id);

-- ---------------------------------------------------------------------------
-- spec_requirements — the AI-extracted registry
-- ---------------------------------------------------------------------------
create table if not exists public.spec_requirements (
  id uuid primary key default gen_random_uuid(),
  spec_book_id uuid not null references public.spec_books (id) on delete cascade,

  -- Denormalized on purpose (mirrors spec_books.account_id) so RLS policies
  -- here don't need a join, same reasoning as submittals.account_id.
  account_id uuid not null references public.accounts (id) on delete cascade,

  division_code text,
  division_title text,
  description text not null,

  -- Where this requirement came from in the source document, e.g.
  -- "Section 03 30 00" or "Pages 42-47" when section detection fell back
  -- to plain page ranges.
  source_label text not null,

  -- Set once someone clicks "Create Submittal" on this row, so the UI can
  -- show it's already been turned into a tracked submittal and avoid
  -- creating duplicates.
  submittal_id uuid references public.submittals (id) on delete set null,

  created_at timestamptz not null default now()
);

comment on table public.spec_requirements is
  'The AI-generated submittal registry for a spec book — one row per requirement found, cited back to its source section.';

create index if not exists spec_requirements_spec_book_id_idx on public.spec_requirements (spec_book_id);
create index if not exists spec_requirements_account_id_idx on public.spec_requirements (account_id);

drop trigger if exists set_spec_books_updated_at on public.spec_books;
create trigger set_spec_books_updated_at
  before update on public.spec_books
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.spec_books enable row level security;
alter table public.spec_requirements enable row level security;

create policy "spec_books_select_own" on public.spec_books
  for select using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_books_insert_own" on public.spec_books
  for insert with check (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_books_update_own" on public.spec_books
  for update using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_books_delete_own" on public.spec_books
  for delete using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_requirements_select_own" on public.spec_requirements
  for select using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_requirements_insert_own" on public.spec_requirements
  for insert with check (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_requirements_update_own" on public.spec_requirements
  for update using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

create policy "spec_requirements_delete_own" on public.spec_requirements
  for delete using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Storage — a dedicated private bucket, same isolation pattern as Step 2's
-- submittal-files bucket. Kept separate so a whole project's spec book
-- (often large) doesn't mix in with individual submittal package files.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('spec-books', 'spec-books', false)
on conflict (id) do nothing;

create policy "spec_books_files_owner_all" on storage.objects
  for all
  using (
    bucket_id = 'spec-books'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.accounts where owner_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'spec-books'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.accounts where owner_user_id = auth.uid()
    )
  );
