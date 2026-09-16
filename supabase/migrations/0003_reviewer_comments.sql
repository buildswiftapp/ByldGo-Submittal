-- ByldGo Submittals — reviewer comments (Step 3)
--
-- Stores what the reviewer typed on the public review page, so it shows up
-- in the owner's detail panel too, not just in the notification email.
alter table public.submittals
  add column if not exists reviewer_comments text;
