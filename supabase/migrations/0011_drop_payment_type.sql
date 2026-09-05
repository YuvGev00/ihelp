-- iHelp: pricing belongs entirely to the helper's offer; a request is simply a
-- description of what is needed. Every request can receive fixed-price,
-- after-job, and volunteer offers alike.

-- 1. Rebuild the offer policies (they reference the column being dropped).
-- Any identity-verified helper may offer with any pricing_mode on any
-- open/visible request.
drop policy offers_insert on public.offers;
create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    helper_id = auth.uid()
    and status = 'active'
    and public.is_identity_verified()
    and exists (select 1 from public.help_requests r
                where r.id = request_id
                  and r.requester_id <> auth.uid()
                  and r.status in ('open','has_offers')
                  and not r.is_hidden)
  );

drop policy offers_update_own on public.offers;
create policy offers_update_own on public.offers
  for update to authenticated
  using (helper_id = auth.uid() and status = 'active')
  with check (helper_id = auth.uid() and status in ('active','withdrawn'));

-- 2. With no policy dependents, drop the column.
alter table public.help_requests drop column payment_type;

-- 3. create_request_with_photos loses its payment_type parameter (signature
-- change: drop + recreate + regrant).
drop function public.create_request_with_photos(
  text, text, text, public.payment_type,
  double precision, double precision, text[]);

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
begin
  if not public.is_identity_verified() then
    raise exception 'forbidden';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'location_required';
  end if;

  select array_agg(distinct p) into v_paths from unnest(p_photo_paths) as p;
  if v_paths is null or array_length(v_paths, 1) < 1 then
    raise exception 'photos_required';
  end if;
  if array_length(v_paths, 1) > 5 then
    raise exception 'too_many_photos';
  end if;
  foreach v_path in array v_paths loop
    if v_path not like auth.uid()::text || '/%' then
      raise exception 'forbidden';
    end if;
  end loop;
  if (select count(*) from storage.objects
      where bucket_id = 'request-photos' and name = any(v_paths))
     <> array_length(v_paths, 1) then
    raise exception 'photo_not_uploaded';
  end if;

  insert into public.help_requests
    (requester_id, title, description, category, lat, lng)
  values
    (auth.uid(), p_title, p_description, p_category, p_lat, p_lng)
  returning id into v_id;

  insert into public.request_photos (request_id, storage_path, position)
  select v_id, u.path, u.ord - 1
  from unnest(v_paths) with ordinality as u(path, ord);

  return v_id;
end $$;

revoke execute on function public.create_request_with_photos(
  text, text, text, double precision, double precision, text[]) from public, anon;
grant execute on function public.create_request_with_photos(
  text, text, text, double precision, double precision, text[]) to authenticated;

-- 4. Drop the payment_type enum (nothing references it).
drop type public.payment_type;
