-- ByldGo Submittals — progress tracking for the AI Specifications scan
--
-- Scanning a large spec book takes a few minutes and, until now, all the
-- registry page could show was "Scanning..." with no way to tell it apart
-- from a stuck/frozen page. These columns let the background scan report
-- which stage it's in and, once it knows, how many of how many it's
-- through — so the registry page can show real progress instead of a
-- spinner with no information behind it.

alter table public.spec_books
  add column if not exists progress_stage text,
  add column if not exists progress_current integer,
  add column if not exists progress_total integer;

comment on column public.spec_books.progress_stage is
  'Short human-readable label for what the background scan is doing right now, e.g. "Reading document...".';
comment on column public.spec_books.progress_current is
  'How many units of the current stage are done (e.g. sections extracted so far). Null when the stage has no countable total.';
comment on column public.spec_books.progress_total is
  'Total units in the current stage (e.g. total sections to extract). Null when not yet known or not applicable.';
