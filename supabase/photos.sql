-- Photo uploads for places. Run once in the SQL Editor, AFTER extras.sql and contributors.sql. Safe to re-run.
--
-- Who may do what:
--   look at a photo ........ everyone (the bucket is public: a photo is shown on the place page like any other picture)
--   upload a photo ......... admins and approved contributors only (nobody else, and nobody without signing in)
--   delete / replace ....... admins only
-- The app shrinks every photo to at most 1600 px wide JPEG before uploading (usually 150-400 KB), and the bucket refuses anything over 1 MB
-- or that is not a JPEG, so the free storage allowance lasts a long time.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-photos', 'place-photos', true, 1048576, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

drop policy if exists "place photos: members upload" on storage.objects;
create policy "place photos: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-photos' and (public.is_admin() or public.is_contributor()));

drop policy if exists "place photos: admins change" on storage.objects;
create policy "place photos: admins change" on storage.objects for update to authenticated
  using (bucket_id = 'place-photos' and public.is_admin()) with check (bucket_id = 'place-photos' and public.is_admin());

drop policy if exists "place photos: admins delete" on storage.objects;
create policy "place photos: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'place-photos' and public.is_admin());
