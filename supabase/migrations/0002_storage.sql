-- ByldGo Submittals — file storage (Step 2)
--
-- What this does, in plain terms:
--   - Creates a PRIVATE storage bucket called "submittal-files". Private
--     means nobody can access a file just by guessing its URL — every
--     access goes through a signed, time-limited link that the app
--     generates on request.
--   - Files are stored under a path like "<account_id>/<submittal_id>/<filename>",
--     and the security rule below says: you may only touch files under
--     YOUR OWN account's folder. Same tenant-isolation principle as the
--     database tables in Step 1, applied to file storage.

insert into storage.buckets (id, name, public)
values ('submittal-files', 'submittal-files', false)
on conflict (id) do nothing;

create policy "submittal_files_owner_all" on storage.objects
  for all
  using (
    bucket_id = 'submittal-files'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.accounts where owner_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'submittal-files'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.accounts where owner_user_id = auth.uid()
    )
  );
