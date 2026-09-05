-- iHelp: optional profile pictures.
-- Every user may set an avatar; it shows wherever they appear (offer cards,
-- helper profile). Optional — the UI falls back to initials when absent.

-- avatar_path lives on the PUBLIC profile row (display_name/badges are already
-- broadly readable; an avatar is the same kind of public identity data).
alter table public.profiles add column avatar_path text;

-- A dedicated public-read bucket: avatars are shown in <img> tags across the
-- app, so a public bucket avoids per-render signed URLs. Writes are still
-- own-folder-only, so a user can only set their own picture. Paths are
-- unguessable UUIDs; nothing sensitive lives here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg','image/png','image/webp']);

create policy "avatars_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);
-- public bucket → read is public; no select policy needed for anon display.

-- The column guard already lets a user update their own profile row content;
-- avatar_path is deliberately NOT in the guarded set (it is safe self-service
-- identity data, like display_name), so updateProfile can write it directly.
