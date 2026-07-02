-- iHelp: storage buckets + policies (design doc 03 §2, architecture §5).
-- Both buckets private; 5MB limit; image MIME allowlist. Downloads happen via
-- bulk signed URLs created by Server Components; uploads go directly from the
-- browser with the user JWT under these policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('request-photos', 'request-photos', false, 5242880,
   array['image/jpeg','image/png','image/webp']),
  ('verification-docs', 'verification-docs', false, 5242880,
   array['image/jpeg','image/png','image/webp']);

-- request-photos: identity-verified users upload into their own folder
-- ({user_id}/...). Uploads precede the request row (photos-first flow), so the
-- gate is the verified flag, not request ownership. Reads: any signed-in user
-- (photo paths of hidden requests remain fetchable by path — accepted MVP
-- limitation, unguessable UUID paths; see security doc).
create policy photos_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'request-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_identity_verified()
  );
create policy photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'request-photos');

-- verification-docs: applicant uploads into own folder; applicant + admins read.
create policy docs_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
