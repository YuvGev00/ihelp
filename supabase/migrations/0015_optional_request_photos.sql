-- iHelp: make request photos optional (product change 2026-08-31).
--
-- Until now every help request required 1–5 photos. This was friction for
-- requests with nothing physical to show (a ride, help with a form). Photos
-- are now OPTIONAL: 0–5 are accepted. The upper bound (≤5) and the ownership +
-- existence checks for any photos that ARE supplied are kept unchanged.
--
-- The only subtlety: array_length() of an empty/NULL array returns NULL, so the
-- storage-existence check (count(*) <> array_length(...)) must run ONLY when
-- photos are present — otherwise "0 <> NULL" would misbehave. The ownership
-- foreach loop is already a no-op on an empty array, and the photo INSERT
-- no-ops on an empty array too, so both are safe as-is; we simply guard the
-- count check.

create or replace function public.create_request_with_photos(
  p_title text, p_description text, p_category text,
  p_lat double precision, p_lng double precision,
  p_photo_paths text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_path text;
  v_paths text[];
  v_count int;
begin
  if not public.is_identity_verified() then
    raise exception 'forbidden';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'location_required';
  end if;

  -- Deduplicate. v_paths may be NULL (no photos) — that is now allowed.
  select array_agg(distinct p) into v_paths from unnest(p_photo_paths) as p;
  v_count := coalesce(array_length(v_paths, 1), 0);

  if v_count > 5 then
    raise exception 'too_many_photos';
  end if;

  -- Only validate ownership + existence when photos were actually supplied.
  if v_count > 0 then
    foreach v_path in array v_paths loop
      if v_path not like auth.uid()::text || '/%' then
        raise exception 'forbidden';
      end if;
    end loop;
    if (select count(*) from storage.objects
        where bucket_id = 'request-photos' and name = any(v_paths)) <> v_count then
      raise exception 'photo_not_uploaded';
    end if;
  end if;

  insert into public.help_requests
    (requester_id, title, description, category, lat, lng)
  values
    (auth.uid(), p_title, p_description, p_category, p_lat, p_lng)
  returning id into v_id;

  -- No-ops when v_paths is empty/NULL.
  insert into public.request_photos (request_id, storage_path, position)
  select v_id, u.path, u.ord - 1
  from unnest(v_paths) with ordinality as u(path, ord);

  return v_id;
end $$;

revoke execute on function public.create_request_with_photos(
  text, text, text, double precision, double precision, text[]) from public, anon;
grant execute on function public.create_request_with_photos(
  text, text, text, double precision, double precision, text[]) to authenticated;
